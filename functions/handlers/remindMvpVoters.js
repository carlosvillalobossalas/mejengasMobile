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

const FIRESTORE_IN_LIMIT = 10;

/**
 * Runs every 12 hours. Finds all matches where:
 *   - mvpVoting.status == "open"
 *   - mvpVoting.closesAt > now  (voting window still active)
 *
 * For each match, identifies players who participated but haven't voted yet
 * and sends them a push notification reminder.
 *
 * NOTE: Requires the same composite index as calculateMvpWinners:
 * (mvpVoting.status ASC, mvpVoting.closesAt ASC).
 */
exports.remindMvpVoters = onSchedule('every 12 hours', async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const snap = await db
    .collection('matches')
    .where('mvpVoting.status', '==', 'open')
    .where('mvpVoting.closesAt', '>', now)
    .get();

  if (snap.empty) {
    logger.info('remindMvpVoters: no active voting windows');
    return;
  }

  logger.info('remindMvpVoters: processing matches', { count: snap.size });

  for (const doc of snap.docs) {
    try {
      const data = doc.data();
      const matchId = doc.id;
      const groupId = data.groupId;
      const mvpVotes = data.mvpVotes ?? {};

      // Keys in mvpVotes are the groupMemberIds of players who have already voted
      const votedGroupMemberIds = new Set(Object.keys(mvpVotes));

      // Find players who participated but haven't voted yet
      const allPlayers = [...(data.players1 ?? []), ...(data.players2 ?? [])];
      const nonVoterGroupMemberIds = allPlayers
        .map(p => p.groupMemberId)
        .filter(id => id && !votedGroupMemberIds.has(id));

      if (nonVoterGroupMemberIds.length === 0) {
        logger.info('remindMvpVoters: all players have voted', { matchId });
        continue;
      }

      // Fetch groupMembers_v2 docs to resolve userId for each non-voter
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
        logger.info('remindMvpVoters: no linked users for non-voters', { matchId });
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
        logger.info('remindMvpVoters: no FCM tokens for non-voters', { matchId });
        continue;
      }

      // Fetch group name for the notification body
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
        data: {
          matchId,
          groupId,
          matchCollection: 'matches',
          type: 'mvp-vote-reminder',
        },
        android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
        apns: { headers: { 'apns-priority': '10' } },
      };

      let sentCount = 0;
      for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: tokensChunk,
          ...payload,
        });
        sentCount += response.successCount;
        if (response.failureCount > 0) {
          logger.warn('remindMvpVoters: some notifications failed', {
            matchId,
            failures: response.failureCount,
          });
        }
      }

      logger.info('remindMvpVoters: reminders sent', {
        matchId,
        sentCount,
        pendingVoters: nonVoterGroupMemberIds.length,
      });
    } catch (err) {
      logger.error('remindMvpVoters: error processing match', {
        matchId: doc.id,
        error: err?.message ?? String(err),
      });
    }
  }
});
