const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
admin.initializeApp();

const GROUP_MEMBERS_COLLECTION = 'groupMembers';
const USERS_COLLECTION = 'users';
const MAX_TOKENS_PER_BATCH = 500;

const uniqueNonEmpty = values => {
  const result = new Set();
  for (const value of values) {
    if (value) {
      result.add(value);
    }
  }
  return Array.from(result);
};

const chunk = (items, size) => {
  if (size <= 0) {
    return [items];
  }

  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const resolveGroupId = data => {
  return String(data.groupId ?? data.groupid ?? '').trim();
};

const resolveMemberUserId = data => {
  return String(data.userId ?? data.userid ?? '').trim();
};

const collectUserTokens = data => {
  const tokens = [];

  const token = typeof data.fcmToken === 'string' ? data.fcmToken.trim() : '';
  if (token) {
    tokens.push(token);
  }

  const tokenList = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
  for (const entry of tokenList) {
    if (typeof entry === 'string' && entry.trim()) {
      tokens.push(entry.trim());
    }
  }

  return tokens;
};

const notifyGroupMembers = async (matchId, groupId) => {
  const firestore = admin.firestore();
  let membersSnap = await firestore
    .collection(GROUP_MEMBERS_COLLECTION)
    .where('groupId', '==', groupId)
    .get();

  if (membersSnap.empty) {
    membersSnap = await firestore
      .collection(GROUP_MEMBERS_COLLECTION)
      .where('groupid', '==', groupId)
      .get();
  }

  if (membersSnap.empty) {
    logger.info('No group members found', { groupId, matchId });
    return;
  }

  const userIds = uniqueNonEmpty(
    membersSnap.docs.map(doc => resolveMemberUserId(doc.data() ?? {})),
  );

  if (userIds.length === 0) {
    logger.info('No user IDs resolved for group', { groupId, matchId });
    return;
  }

  const usersRef = firestore.collection(USERS_COLLECTION);
  const userDocs = await Promise.all(userIds.map(id => usersRef.doc(id).get()));

  const tokens = uniqueNonEmpty(
    userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
  );

  if (tokens.length === 0) {
    logger.info('No FCM tokens found for group', { groupId, matchId });
    return;
  }

  const payload = {
    notification: {
      title: 'Nuevo partido',
      body: 'Se agregó un partido en tu grupo.',
    },
    data: {
      matchId,
      groupId,
      type: 'match-created',
    },
    android: {
      priority: 'high',
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
    },
  };

  let sentCount = 0;
  for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokensChunk,
      ...payload,
    });

    sentCount += response.successCount;

    if (response.failureCount > 0) {
      logger.warn('Some notifications failed', {
        matchId,
        groupId,
        failures: response.failureCount,
      });
    }
  }

  logger.info('Match notification sent', { matchId, groupId, sentCount });
};

const handleMatchCreated = async (matchId, data) => {
  if (!data) {
    logger.warn('Match document has no data', { matchId });
    return;
  }

  const groupId = resolveGroupId(data);

  if (!groupId) {
    logger.warn('Match missing groupId', { matchId });
    return;
  }

  await notifyGroupMembers(matchId, groupId);
};

exports.notifyGroupOnNewMatch = onDocumentCreated(
  'matches/{matchId}',
  async event => {
    await handleMatchCreated(event.params.matchId, event.data?.data());
  },
);

// ─── Invite notifications ─────────────────────────────────────────────────────

/**
 * Triggered when a new invite document is created.
 * Looks up the invited user by email in the 'users' collection,
 * collects their FCM tokens and sends a push notification with the group name.
 */
exports.notifyUserOnInvite = onDocumentCreated(
  'invites/{inviteId}',
  async event => {
    const inviteId = event.params.inviteId;
    const data = event.data?.data();

    if (!data) {
      logger.warn('notifyUserOnInvite: invite document has no data', { inviteId });
      return;
    }

    const email = String(data.email ?? '').trim().toLowerCase();
    const groupName = String(data.groupName ?? '').trim();

    if (!email) {
      logger.warn('notifyUserOnInvite: invite has no email', { inviteId });
      return;
    }

    const db = admin.firestore();

    // Find the user by email to retrieve their FCM tokens
    const usersSnap = await db
      .collection(USERS_COLLECTION)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (usersSnap.empty) {
      logger.info('notifyUserOnInvite: no user found for email', { inviteId, email });
      return;
    }

    const tokens = uniqueNonEmpty(
      usersSnap.docs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
    );

    if (tokens.length === 0) {
      logger.info('notifyUserOnInvite: no FCM tokens for user', { inviteId, email });
      return;
    }

    const payload = {
      notification: {
        title: '¡Tenés una nueva invitación!',
        body: groupName
          ? `Fuiste invitado al grupo "${groupName}"`
          : 'Fuiste invitado a un grupo',
      },
      data: {
        inviteId,
        type: 'invite-received',
      },
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
      },
    };

    let sentCount = 0;
    for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokensChunk,
        ...payload,
      });

      sentCount += response.successCount;

      if (response.failureCount > 0) {
        logger.warn('notifyUserOnInvite: some notifications failed', {
          inviteId,
          failures: response.failureCount,
        });
      }
    }

    logger.info('notifyUserOnInvite: notification sent', { inviteId, email, sentCount });
  },
);

// ─── MVP voting: scheduled calculation ───────────────────────────────────────

/**
 * Notify all linked users in a group_v2 that the MVP for a match was calculated.
 * Uses groupMembers_v2 (userId != null) to find recipients.
 */
const notifyGroupOnMvpResult = async (groupId, matchId, winnerName) => {
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

  const payload = {
    notification: {
      title: '🏆 MVP calculado',
      body: winnerName
        ? `${winnerName} fue elegido MVP del partido`
        : 'El MVP del partido ha sido calculado',
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
 * NOTE: The Firestore query uses a composite index on
 * (mvpVoting.status ASC, mvpVoting.closesAt ASC). If Firestore prompts for
 * index creation, follow the link in the error logs.
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

        // Determine the winner's role from the match's player arrays
        const allPlayers = [...(data.players1 ?? []), ...(data.players2 ?? [])];
        const playerEntry = allPlayers.find(p => p.groupMemberId === winnerId);
        const isGoalkeeper = playerEntry?.position === 'POR';

        // set+merge creates the doc if it doesn't exist yet, avoiding
        // a "document not found" error on update when the player has never
        // had a seasonStats doc (edge case, but safe to guard).
        const mvpField = isGoalkeeper ? 'goalkeeperStats.mvps' : 'playerStats.mvps';
        batch.set(
          statsRef,
          { [mvpField]: admin.firestore.FieldValue.increment(1) },
          { merge: true },
        );
      }

      await batch.commit();

      // Notify all group members about the MVP result
      try {
        let winnerName = null;
        if (winnerId) {
          const winnerDoc = await db.collection('groupMembers_v2').doc(winnerId).get();
          winnerName = winnerDoc.exists ? String(winnerDoc.data().displayName ?? '').trim() : null;
        }
        await notifyGroupOnMvpResult(data.groupId, doc.id, winnerName);
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


