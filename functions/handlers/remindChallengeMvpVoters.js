const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const {
  USERS_COLLECTION,
  GROUPS_COLLECTION,
  MAX_TOKENS_PER_BATCH,
  uniqueNonEmpty,
  chunk,
  collectUserTokens,
} = require('../utils/helpers');
const { isNotificationEnabled } = require('../utils/notificationPreferences');

const COLLECTION = 'matchesByChallenge';
const FIRESTORE_IN_LIMIT = 10;

/**
 * Runs every 12 hours. Finds all challenge matches where:
 *   - mvpVoting.status == "open"
 *   - mvpVoting.closesAt > now  (voting window still active)
 *
 * For each match, identifies players who participated but haven't voted yet
 * and sends them a push notification reminder.
 *
 * NOTE: Requires a composite index on matchesByChallenge:
 *   (mvpVoting.status ASC, mvpVoting.closesAt ASC)
 */
exports.remindChallengeMvpVoters = onSchedule('every 12 hours', async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const snap = await db
    .collection(COLLECTION)
    .where('mvpVoting.status', '==', 'open')
    .where('mvpVoting.closesAt', '>', now)
    .get();

  if (snap.empty) {
    logger.info('remindChallengeMvpVoters: no active voting windows');
    return;
  }

  logger.info('remindChallengeMvpVoters: processing matches', { count: snap.size });

  for (const doc of snap.docs) {
    try {
      const data = doc.data();
      const matchId = doc.id;
      const groupId = data.groupId;
      const mvpVotes = data.mvpVotes ?? {};

      // Keys in mvpVotes are groupMemberIds of players who have already voted
      const votedGroupMemberIds = new Set(Object.keys(mvpVotes));

      // Find players who participated but haven't voted yet
      const nonVoterGroupMemberIds = (data.players ?? [])
        .map(p => p.groupMemberId)
        .filter(id => id && !votedGroupMemberIds.has(id));

      if (nonVoterGroupMemberIds.length === 0) {
        logger.info('remindChallengeMvpVoters: all players have voted', { matchId });
        continue;
      }

      // Resolve userId for each non-voter
      const idChunks = chunk(nonVoterGroupMemberIds, FIRESTORE_IN_LIMIT);
      const memberDocs = (
        await Promise.all(
          idChunks.map(ids =>
            db
              .collection('groupMembers_v2')
              .where(admin.firestore.FieldPath.documentId(), 'in', ids)
              .get(),
          ),
        )
      ).flatMap(s => s.docs);

      const userIds = uniqueNonEmpty(
        memberDocs
          .map(d => String(d.data().userId ?? '').trim())
          .filter(Boolean),
      );
      if (userIds.length === 0) {
        logger.info('remindChallengeMvpVoters: no linked users for non-voters', { matchId });
        continue;
      }

      const userDocs = await Promise.all(
        userIds.map(id => db.collection(USERS_COLLECTION).doc(id).get()),
      );
      const tokens = uniqueNonEmpty(
        userDocs
          .filter(doc => isNotificationEnabled(doc.data() ?? {}, groupId, 'mvpReminders'))
          .flatMap(doc => collectUserTokens(doc.data() ?? {})),
      );
      if (tokens.length === 0) {
        logger.info('remindChallengeMvpVoters: no FCM tokens for non-voters', { matchId });
        continue;
      }

      const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
      const groupName = groupDoc.exists
        ? String(groupDoc.data().name ?? '').trim()
        : '';

      const payload = {
        notification: {
          title: '⚽ ¡No olvides votar!',
          body: groupName
            ? `Todavía podés votar por el MVP en "${groupName}"`
            : 'Todavía podés votar por el MVP del partido',
        },
        data: { matchId, groupId, matchCollection: 'matchesByChallenge', type: 'mvp-vote-reminder' },
        android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
        apns: { headers: { 'apns-priority': '10' } },
      };

      for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
        await admin.messaging().sendEachForMulticast({ tokens: tokensChunk, ...payload });
      }

      logger.info('remindChallengeMvpVoters: reminders sent', {
        matchId,
        notified: nonVoterGroupMemberIds.length,
      });
    } catch (err) {
      logger.error('remindChallengeMvpVoters: error processing match', {
        matchId: doc.id,
        error: err?.message ?? String(err),
      });
    }
  }
});
