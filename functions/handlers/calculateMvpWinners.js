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

/**
 * Notify all linked users in a group that the MVP for a match was calculated.
 * @param {string} groupId
 * @param {string} matchId
 * @param {string|null} winnerName - display name of the winning group member
 * @param {string|null} groupName  - name of the group the match belongs to
 */
const notifyGroupOnMvpResult = async (groupId, matchId, winnerName, groupName) => {
  const db = admin.firestore();

  const membersSnap = await db
    .collection('groupMembers_v2')
    .where('groupId', '==', groupId)
    .get();

  if (membersSnap.empty) {
    logger.info('notifyGroupOnMvpResult: no members found', { groupId, matchId });
    return;
  }

  // Only notify members that are linked to a user account
  const userIds = uniqueNonEmpty(
    membersSnap.docs
      .map(doc => String(doc.data().userId ?? '').trim())
      .filter(Boolean),
  );

  if (userIds.length === 0) {
    logger.info('notifyGroupOnMvpResult: no linked users in group', { groupId, matchId });
    return;
  }

  const usersRef = db.collection(USERS_COLLECTION);
  const userDocs = await Promise.all(userIds.map(id => usersRef.doc(id).get()));

  const tokens = uniqueNonEmpty(
    userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
  );

  if (tokens.length === 0) {
    logger.info('notifyGroupOnMvpResult: no FCM tokens found', { groupId, matchId });
    return;
  }

  // Build notification body combining winner name and group name
  let body = 'El MVP del partido ha sido calculado';
  if (winnerName && groupName) {
    body = `${winnerName} fue elegido MVP en "${groupName}"`;
  } else if (winnerName) {
    body = `${winnerName} fue elegido MVP del partido`;
  } else if (groupName) {
    body = `El MVP de "${groupName}" ha sido calculado`;
  }

  const payload = {
    notification: {
      title: '🏆 MVP calculado',
      body,
    },
    data: {
      matchId,
      groupId,
      type: 'mvp-calculated',
    },
    android: { priority: 'high' },
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
      logger.warn('notifyGroupOnMvpResult: some notifications failed', {
        matchId,
        failures: response.failureCount,
      });
    }
  }

  logger.info('notifyGroupOnMvpResult: notifications sent', { matchId, groupId, sentCount });
};

/**
 * Runs every 3 hours. Finds all matches where:
 *   - mvpVoting.status == "open"
 *   - mvpVoting.closesAt <= now
 *
 * For each, counts votes in the mvpVotes map, determines the winner (most
 * votes; first by insertion order on a tie), updates mvpGroupMemberId on the
 * match, and increments playerStats.mvps or goalkeeperStats.mvps in the
 * correct seasonStats document.
 *
 * NOTE: Requires a composite index on (mvpVoting.status ASC, mvpVoting.closesAt ASC).
 */
exports.calculateMvpWinners = onSchedule('every 3 hours', async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const snap = await db
    .collection('matches')
    .where('mvpVoting.status', '==', 'open')
    .where('mvpVoting.closesAt', '<=', now)
    .get();

  if (snap.empty) {
    logger.info('calculateMvpWinners: no open matches to process');
    return;
  }

  logger.info('calculateMvpWinners: processing matches', { count: snap.size });

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

      // Close the voting window on the match document
      batch.update(doc.ref, {
        mvpGroupMemberId: winnerId,
        'mvpVoting.status': 'calculated',
        'mvpVoting.calculatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      // Increment mvps in seasonStats for the winner (if any)
      if (winnerId) {
        const season = data.season;
        const groupId = data.groupId;
        const statsDocId = `${groupId}_${season}_${winnerId}`;
        const statsRef = db.collection('seasonStats').doc(statsDocId);

        const allPlayers = [...(data.players1 ?? []), ...(data.players2 ?? [])];
        const playerEntry = allPlayers.find(p => p.groupMemberId === winnerId);
        const isGoalkeeper = playerEntry?.position === 'POR';

        // Use update() so dot-notation is interpreted as a nested field path.
        // set({ merge: true }) treats 'playerStats.mvps' as a literal field name.
        const mvpField = isGoalkeeper ? 'goalkeeperStats.mvps' : 'playerStats.mvps';
        batch.update(statsRef, { [mvpField]: admin.firestore.FieldValue.increment(1) });
      }

      await batch.commit();

      // Notify group members about the MVP result
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

        await notifyGroupOnMvpResult(groupId, doc.id, winnerName, groupName);
      } catch (notifyErr) {
        // Notification failure must not affect the batch result
        logger.warn('calculateMvpWinners: notification failed', {
          matchId: doc.id,
          error: notifyErr?.message ?? String(notifyErr),
        });
      }

      logger.info('calculateMvpWinners: match processed', {
        matchId: doc.id,
        winnerId,
        totalVotes: Object.keys(mvpVotes).length,
      });
    } catch (err) {
      logger.error('calculateMvpWinners: error processing match', {
        matchId: doc.id,
        error: err?.message ?? String(err),
      });
    }
  }
});
