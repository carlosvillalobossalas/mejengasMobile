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

const COLLECTION = 'matchesByChallenge';
const STATS_COLLECTION = 'challengeSeasonStats';

/**
 * Notify all linked users in a group that the MVP for a challenge match was calculated.
 */
const notifyGroupOnChallengeMvpResult = async (groupId, matchId, winnerName, groupName) => {
  const db = admin.firestore();

  const membersSnap = await db
    .collection('groupMembers_v2')
    .where('groupId', '==', groupId)
    .get();

  if (membersSnap.empty) return;

  const userIds = uniqueNonEmpty(
    membersSnap.docs
      .map(doc => String(doc.data().userId ?? '').trim())
      .filter(Boolean),
  );
  if (userIds.length === 0) return;

  const userDocs = await Promise.all(
    userIds.map(id => db.collection(USERS_COLLECTION).doc(id).get()),
  );
  const tokens = uniqueNonEmpty(
    userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
  );
  if (tokens.length === 0) return;

  let body = 'El MVP del partido ha sido calculado';
  if (winnerName && groupName) {
    body = `${winnerName} fue elegido MVP en "${groupName}"`;
  } else if (winnerName) {
    body = `${winnerName} fue elegido MVP del partido`;
  } else if (groupName) {
    body = `El MVP de "${groupName}" ha sido calculado`;
  }

  const payload = {
    notification: { title: '🏆 MVP calculado', body },
    data: { matchId, groupId, matchCollection: 'matchesByChallenge', type: 'mvp-calculated' },
    android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
    apns: { headers: { 'apns-priority': '10' } },
  };

  for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
    await admin.messaging().sendEachForMulticast({ tokens: tokensChunk, ...payload });
  }
};

/**
 * Runs every 3 hours. Finds all challenge matches where:
 *   - mvpVoting.status == "open"
 *   - mvpVoting.closesAt <= now
 *
 * For each, counts votes in the mvpVotes map, determines the winner,
 * updates mvpGroupMemberId on the match, and increments mvp counter
 * in the correct challengeSeasonStats document.
 *
 * NOTE: Requires a composite index on matchesByChallenge:
 *   (mvpVoting.status ASC, mvpVoting.closesAt ASC)
 */
exports.calculateChallengeMvpWinners = onSchedule('every 3 hours', async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const snap = await db
    .collection(COLLECTION)
    .where('mvpVoting.status', '==', 'open')
    .where('mvpVoting.closesAt', '<=', now)
    .get();

  if (snap.empty) {
    logger.info('calculateChallengeMvpWinners: no open matches to process');
    return;
  }

  logger.info('calculateChallengeMvpWinners: processing matches', { count: snap.size });

  for (const doc of snap.docs) {
    try {
      const data = doc.data();
      const mvpVotes = data.mvpVotes ?? {};

      // Count votes per candidate
      const counts = {};
      for (const votedId of Object.values(mvpVotes)) {
        counts[votedId] = (counts[votedId] ?? 0) + 1;
      }

      // Determine winner — highest vote count; null when no votes were cast
      let winnerId = null;
      let maxVotes = 0;
      for (const [candidateId, count] of Object.entries(counts)) {
        if (count > maxVotes) {
          maxVotes = count;
          winnerId = candidateId;
        }
      }

      const batch = db.batch();

      batch.update(doc.ref, {
        mvpGroupMemberId: winnerId,
        'mvpVoting.status': 'calculated',
        'mvpVoting.calculatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      // Increment mvp counter in challengeSeasonStats for the winner (if any)
      if (winnerId) {
        const season = data.season;
        const groupId = data.groupId;
        const statsDocId = `${groupId}_${season}_${winnerId}`;
        const statsRef = db.collection(STATS_COLLECTION).doc(statsDocId);

        const playerEntry = (data.players ?? []).find(p => p.groupMemberId === winnerId);
        const isGoalkeeper = playerEntry?.position === 'POR';
        const mvpField = isGoalkeeper ? 'goalkeeperStats.mvp' : 'playerStats.mvp';

        batch.update(statsRef, { [mvpField]: admin.firestore.FieldValue.increment(1) });
      }

      await batch.commit();

      // Notify group members
      try {
        const groupId = data.groupId;
        let winnerName = null;
        let groupName = null;

        if (winnerId) {
          const winnerDoc = await db.collection('groupMembers_v2').doc(winnerId).get();
          winnerName = winnerDoc.exists
            ? String(winnerDoc.data().displayName ?? '').trim() || null
            : null;
        }

        const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
        groupName = groupDoc.exists
          ? String(groupDoc.data().name ?? '').trim() || null
          : null;

        await notifyGroupOnChallengeMvpResult(groupId, doc.id, winnerName, groupName);
      } catch (notifyErr) {
        logger.warn('calculateChallengeMvpWinners: notification failed', {
          matchId: doc.id,
          error: notifyErr?.message ?? String(notifyErr),
        });
      }

      logger.info('calculateChallengeMvpWinners: processed match', { matchId: doc.id, winnerId });
    } catch (err) {
      logger.error('calculateChallengeMvpWinners: error processing match', {
        matchId: doc.id,
        error: err?.message ?? String(err),
      });
    }
  }
});
