const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
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

// ─── Edit Match ───────────────────────────────────────────────────────────────

/**
 * Applies (or reverts) a match's statistical impact to all affected seasonStats
 * documents within the given transaction.
 *
 * @param {object} matchData - Firestore match document data (groupId, season, goalsTeam1, goalsTeam2, players1, players2)
 * @param {number} multiplier - +1 to apply, -1 to revert
 * @param {object} t - Firestore Transaction
 * @param {object} db - admin.firestore() instance
 * @param {object} FieldValue - admin.firestore.FieldValue
 */
const processMatchImpact = (matchData, multiplier, t, db, FieldValue) => {
  const { groupId, season, goalsTeam1, goalsTeam2, players1, players2 } = matchData;

  const team1Won = goalsTeam1 > goalsTeam2;
  const team2Won = goalsTeam2 > goalsTeam1;
  const isDraw = goalsTeam1 === goalsTeam2;

  const applyTeam = (players, isTeam1) => {
    const rivalGoals = isTeam1 ? Number(goalsTeam2) : Number(goalsTeam1);
    const myTeamWon = isTeam1 ? team1Won : team2Won;
    const myTeamLost = isTeam1 ? team2Won : team1Won;

    for (const player of (players ?? [])) {
      const gmbId = player.groupMemberId;
      if (!gmbId) continue;

      const docId = `${groupId}_${season}_${gmbId}`;
      const ref = db.collection('seasonStats').doc(docId);
      const m = multiplier;

      // Ensure the document exists before updating.
      // set({merge:true}) only writes identity fields and does not overwrite stats.
      t.set(ref, { groupId, season, groupMemberId: gmbId }, { merge: true });

      if (player.position === 'POR') {
        t.update(ref, {
          'goalkeeperStats.matches': FieldValue.increment(m),
          'goalkeeperStats.goalsConceded': FieldValue.increment(m * rivalGoals),
          'goalkeeperStats.cleanSheets': FieldValue.increment(m * (rivalGoals === 0 ? 1 : 0)),
          'goalkeeperStats.goals': FieldValue.increment(m * Number(player.goals ?? 0)),
          'goalkeeperStats.assists': FieldValue.increment(m * Number(player.assists ?? 0)),
          'goalkeeperStats.ownGoals': FieldValue.increment(m * Number(player.ownGoals ?? 0)),
          'goalkeeperStats.won': FieldValue.increment(m * (myTeamWon ? 1 : 0)),
          'goalkeeperStats.draw': FieldValue.increment(m * (isDraw ? 1 : 0)),
          'goalkeeperStats.lost': FieldValue.increment(m * (myTeamLost ? 1 : 0)),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        t.update(ref, {
          'playerStats.matches': FieldValue.increment(m),
          'playerStats.goals': FieldValue.increment(m * Number(player.goals ?? 0)),
          'playerStats.assists': FieldValue.increment(m * Number(player.assists ?? 0)),
          'playerStats.ownGoals': FieldValue.increment(m * Number(player.ownGoals ?? 0)),
          'playerStats.won': FieldValue.increment(m * (myTeamWon ? 1 : 0)),
          'playerStats.draw': FieldValue.increment(m * (isDraw ? 1 : 0)),
          'playerStats.lost': FieldValue.increment(m * (myTeamLost ? 1 : 0)),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  };

  applyTeam(players1, true);
  applyTeam(players2, false);
};

/**
 * Callable function to edit an existing match and atomically recalculate
 * all affected seasonStats documents.
 *
 * Only users with role 'admin' or 'owner' in the match's group may call this.
 * MVP fields (mvpVoting, mvpVotes, mvpGroupMemberId) are never modified.
 *
 * Expected request.data shape:
 * {
 *   matchId: string,
 *   updatedMatchData: {
 *     players1: MatchPlayer[],    // { groupMemberId, position, goals, assists, ownGoals }
 *     players2: MatchPlayer[],
 *     goalsTeam1: number,
 *     goalsTeam2: number,
 *     date: string,               // ISO-8601 date string
 *   }
 * }
 */
exports.editMatch = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para editar partidos.');
  }

  const { matchId, updatedMatchData } = request.data ?? {};

  if (!matchId || typeof matchId !== 'string') {
    throw new HttpsError('invalid-argument', 'matchId es requerido.');
  }
  if (!updatedMatchData || typeof updatedMatchData !== 'object') {
    throw new HttpsError('invalid-argument', 'updatedMatchData es requerido.');
  }

  const { players1, players2, goalsTeam1, goalsTeam2, date } = updatedMatchData;

  if (!Array.isArray(players1) || !Array.isArray(players2)) {
    throw new HttpsError('invalid-argument', 'players1 y players2 deben ser arreglos.');
  }
  if (typeof goalsTeam1 !== 'number' || typeof goalsTeam2 !== 'number') {
    throw new HttpsError('invalid-argument', 'goalsTeam1 y goalsTeam2 deben ser números.');
  }
  if (!date || typeof date !== 'string') {
    throw new HttpsError('invalid-argument', 'date es requerida y debe ser una cadena ISO-8601.');
  }

  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  // Pre-flight: read match to get groupId for role check
  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new HttpsError('not-found', `El partido "${matchId}" no existe.`);
  }

  const matchData = matchSnap.data();
  const groupId = String(matchData.groupId ?? '');

  // Validate caller role
  const memberSnap = await db
    .collection('groupMembers_v2')
    .where('groupId', '==', groupId)
    .where('userId', '==', uid)
    .limit(1)
    .get();

  if (memberSnap.empty) {
    throw new HttpsError('permission-denied', 'No eres miembro de este grupo.');
  }

  const callerRole = String(memberSnap.docs[0].data().role ?? '');
  if (callerRole !== 'admin' && callerRole !== 'owner') {
    throw new HttpsError('permission-denied', 'Solo administradores pueden editar partidos.');
  }

  // ── STEP 1: Validate no duplicate players ─────────────────────────────────
  const ids1 = players1.map(p => p.groupMemberId);
  const ids2 = players2.map(p => p.groupMemberId);

  // All players must have a valid groupMemberId
  if (ids1.some(id => !id) || ids2.some(id => !id)) {
    throw new HttpsError(
      'invalid-argument',
      'Todos los jugadores deben tener un groupMemberId válido.',
    );
  }

  // No duplicates within each team
  const set1 = new Set(ids1);
  if (set1.size < ids1.length) {
    throw new HttpsError('invalid-argument', 'Hay jugadores duplicados en el Equipo 1.');
  }

  const set2 = new Set(ids2);
  if (set2.size < ids2.length) {
    throw new HttpsError('invalid-argument', 'Hay jugadores duplicados en el Equipo 2.');
  }

  // No duplicates across both teams
  const allPlayerIds = [...ids1, ...ids2];
  const allPlayerIdsSet = new Set(allPlayerIds);
  if (allPlayerIdsSet.size < allPlayerIds.length) {
    throw new HttpsError('invalid-argument', 'Hay jugadores duplicados en el partido.');
  }

  // ── STEP 2: Validate all players belong to the group ──────────────────────
  // Firestore 'in' operator supports max 10 values per query — chunk if needed
  const FIRESTORE_IN_LIMIT = 10;
  const uniquePlayerIds = [...allPlayerIdsSet];
  const playerIdChunks = chunk(uniquePlayerIds, FIRESTORE_IN_LIMIT);

  const groupMemberDocs = (
    await Promise.all(
      playerIdChunks.map(ids =>
        db
          .collection('groupMembers_v2')
          .where('groupId', '==', groupId)
          .where(admin.firestore.FieldPath.documentId(), 'in', ids)
          .get(),
      ),
    )
  ).flatMap(snap => snap.docs);

  if (groupMemberDocs.length !== uniquePlayerIds.length) {
    throw new HttpsError(
      'invalid-argument',
      'Uno o más jugadores no pertenecen a este grupo.',
    );
  }

  // Parse the new date
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new HttpsError('invalid-argument', 'date no es una fecha válida.');
  }

  // Run the atomic transaction: revert old stats → update match → apply new stats
  await db.runTransaction(async (t) => {
    // Re-read match inside transaction to ensure consistency
    const snap = await t.get(matchRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', `El partido "${matchId}" no existe.`);
    }

    const old = snap.data();

    // Revert the statistical impact of the old match data
    processMatchImpact(old, -1, t, db, FieldValue);

    // Build the new match data for impact calculation (keep groupId and season unchanged)
    const newMatchForImpact = {
      groupId: old.groupId,
      season: old.season,
      goalsTeam1,
      goalsTeam2,
      players1,
      players2,
    };

    // Apply the statistical impact of the new match data
    processMatchImpact(newMatchForImpact, +1, t, db, FieldValue);

    // Update the match document (never touch MVP fields)
    t.update(matchRef, {
      players1,
      players2,
      goalsTeam1,
      goalsTeam2,
      date: admin.firestore.Timestamp.fromDate(parsedDate),
      editedAt: FieldValue.serverTimestamp(),
      editedBy: uid,
      impactVersion: FieldValue.increment(1),
    });
  });

  logger.info('editMatch: match updated successfully', { matchId, uid });
  return { success: true };
});
