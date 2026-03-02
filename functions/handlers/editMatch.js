const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { chunk } = require('../utils/helpers');

/**
 * Applies (or reverts) a match's statistical impact to all affected seasonStats
 * documents within the given transaction.
 *
 * @param {object} matchData - Firestore match document data
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
      // set({ merge: true }) only writes identity fields and does not overwrite stats.
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
exports.editMatch = onCall(async request => {
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

  if (ids1.some(id => !id) || ids2.some(id => !id)) {
    throw new HttpsError(
      'invalid-argument',
      'Todos los jugadores deben tener un groupMemberId válido.',
    );
  }

  const set1 = new Set(ids1);
  if (set1.size < ids1.length) {
    throw new HttpsError('invalid-argument', 'Hay jugadores duplicados en el Equipo 1.');
  }

  const set2 = new Set(ids2);
  if (set2.size < ids2.length) {
    throw new HttpsError('invalid-argument', 'Hay jugadores duplicados en el Equipo 2.');
  }

  const allPlayerIds = [...ids1, ...ids2];
  const allPlayerIdsSet = new Set(allPlayerIds);
  if (allPlayerIdsSet.size < allPlayerIds.length) {
    throw new HttpsError('invalid-argument', 'Hay jugadores duplicados en el partido.');
  }

  // ── STEP 2: Validate all players belong to the group ──────────────────────
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

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new HttpsError('invalid-argument', 'date no es una fecha válida.');
  }

  // Run the atomic transaction: revert old stats → update match → apply new stats
  await db.runTransaction(async t => {
    const snap = await t.get(matchRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', `El partido "${matchId}" no existe.`);
    }

    const old = snap.data();

    processMatchImpact(old, -1, t, db, FieldValue);

    const newMatchForImpact = {
      groupId: old.groupId,
      season: old.season,
      goalsTeam1,
      goalsTeam2,
      players1,
      players2,
    };

    processMatchImpact(newMatchForImpact, +1, t, db, FieldValue);

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
