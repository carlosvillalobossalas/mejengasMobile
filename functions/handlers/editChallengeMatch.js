const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { chunk } = require('../utils/helpers');

const COLLECTION = 'matchesByChallenge';
const STATS_COLLECTION = 'challengeSeasonStats';

/**
 * Applies (or reverts) a challenge match's statistical impact on
 * challengeSeasonStats documents within the given transaction.
 *
 * Challenge mode only tracks the group's own team (`players`).
 * goalsTeam  = goals scored by the group's team
 * goalsOpponent = goals scored by the opponent
 *
 * @param {object} matchData - Firestore matchesByChallenge document data
 * @param {number} multiplier - +1 to apply, -1 to revert
 * @param {object} t - Firestore Transaction
 * @param {object} db - admin.firestore() instance
 * @param {object} FieldValue - admin.firestore.FieldValue
 */
const processChallengeMatchImpact = (matchData, multiplier, t, db, FieldValue) => {
  const { groupId, season, goalsTeam, goalsOpponent, players } = matchData;

  const teamWon = goalsTeam > goalsOpponent;
  const teamLost = goalsOpponent > goalsTeam;
  const isDraw = goalsTeam === goalsOpponent;

  for (const player of (players ?? [])) {
    const gmbId = player.groupMemberId;
    if (!gmbId) continue;

    const docId = `${groupId}_${season}_${gmbId}`;
    const ref = db.collection(STATS_COLLECTION).doc(docId);
    const m = multiplier;

    // Ensure the document exists before updating
    t.set(ref, { groupId, season, groupMemberId: gmbId }, { merge: true });

    if (player.position === 'POR') {
      t.update(ref, {
        'goalkeeperStats.matches': FieldValue.increment(m),
        'goalkeeperStats.goalsConceded': FieldValue.increment(m * Number(goalsOpponent ?? 0)),
        'goalkeeperStats.cleanSheets': FieldValue.increment(m * (goalsOpponent === 0 ? 1 : 0)),
        'goalkeeperStats.goals': FieldValue.increment(m * Number(player.goals ?? 0)),
        'goalkeeperStats.assists': FieldValue.increment(m * Number(player.assists ?? 0)),
        'goalkeeperStats.ownGoals': FieldValue.increment(m * Number(player.ownGoals ?? 0)),
        'goalkeeperStats.won': FieldValue.increment(m * (teamWon ? 1 : 0)),
        'goalkeeperStats.draw': FieldValue.increment(m * (isDraw ? 1 : 0)),
        'goalkeeperStats.lost': FieldValue.increment(m * (teamLost ? 1 : 0)),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      t.update(ref, {
        'playerStats.matches': FieldValue.increment(m),
        'playerStats.goals': FieldValue.increment(m * Number(player.goals ?? 0)),
        'playerStats.assists': FieldValue.increment(m * Number(player.assists ?? 0)),
        'playerStats.ownGoals': FieldValue.increment(m * Number(player.ownGoals ?? 0)),
        'playerStats.won': FieldValue.increment(m * (teamWon ? 1 : 0)),
        'playerStats.draw': FieldValue.increment(m * (isDraw ? 1 : 0)),
        'playerStats.lost': FieldValue.increment(m * (teamLost ? 1 : 0)),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
};

/**
 * Callable function to edit an existing challenge match and atomically
 * recalculate all affected challengeSeasonStats documents.
 *
 * Only users with role 'admin' or 'owner' in the match's group may call this.
 * MVP fields (mvpVoting, mvpVotes, mvpGroupMemberId) are never modified here.
 *
 * Expected request.data shape:
 * {
 *   matchId: string,
 *   updatedMatchData: {
 *     players: ChallengeMatchPlayer[],   // { groupMemberId, position, goals, assists, ownGoals, isSub }
 *     goalsTeam: number,
 *     opponentName: string,
 *     goalsOpponent: number,
 *     date: string,                      // ISO-8601 date string
 *     markAsFinished?: boolean,          // only relevant for scheduled matches
 *   }
 * }
 */
exports.editChallengeMatch = onCall(async request => {
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

  const { players, goalsTeam, goalsOpponent, opponentName, date, markAsFinished = false } = updatedMatchData;

  if (!Array.isArray(players)) {
    throw new HttpsError('invalid-argument', 'players debe ser un arreglo.');
  }
  if (typeof goalsTeam !== 'number' || typeof goalsOpponent !== 'number') {
    throw new HttpsError('invalid-argument', 'goalsTeam y goalsOpponent deben ser números.');
  }
  if (!date || typeof date !== 'string') {
    throw new HttpsError('invalid-argument', 'date es requerida y debe ser una cadena ISO-8601.');
  }

  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  const matchRef = db.collection(COLLECTION).doc(matchId);
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

  // Validate no duplicate players — null groupMemberIds are allowed (empty/unassigned slots)
  const playerIds = players.map(p => p.groupMemberId).filter(id => !!id);
  const playerIdSet = new Set(playerIds);
  if (playerIdSet.size < playerIds.length) {
    throw new HttpsError('invalid-argument', 'Hay jugadores duplicados en el equipo.');
  }

  // Validate all players belong to the group
  const FIRESTORE_IN_LIMIT = 10;
  const playerIdChunks = chunk([...playerIdSet], FIRESTORE_IN_LIMIT);
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

  if (groupMemberDocs.length !== playerIdSet.size) {
    throw new HttpsError('invalid-argument', 'Uno o más jugadores no pertenecen a este grupo.');
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new HttpsError('invalid-argument', 'date no es una fecha válida.');
  }

  const currentStatus = String(matchData.status ?? 'finished');

  await db.runTransaction(async t => {
    const snap = await t.get(matchRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', `El partido "${matchId}" no existe.`);
    }

    const old = snap.data();
    const statusInTransaction = old.status ?? 'finished';

    const newMatchForImpact = {
      groupId: old.groupId,
      season: old.season,
      goalsTeam,
      goalsOpponent,
      players,
    };

    const baseMatchUpdate = {
      players,
      goalsTeam,
      goalsOpponent,
      opponentName: String(opponentName ?? ''),
      date: admin.firestore.Timestamp.fromDate(parsedDate),
      editedAt: FieldValue.serverTimestamp(),
      editedBy: uid,
      impactVersion: FieldValue.increment(1),
    };

    if (statusInTransaction === 'finished') {
      // Normal edit of a finished match: revert old stats, apply new stats
      processChallengeMatchImpact(old, -1, t, db, FieldValue);
      processChallengeMatchImpact(newMatchForImpact, +1, t, db, FieldValue);
      t.update(matchRef, { ...baseMatchUpdate, status: 'finished' });
    } else if (statusInTransaction === 'scheduled' && markAsFinished) {
      // Finalizing a scheduled match: apply stats for the first time, open MVP voting
      processChallengeMatchImpact(newMatchForImpact, +1, t, db, FieldValue);
      const opensAt = admin.firestore.Timestamp.now();
      const closesAt = admin.firestore.Timestamp.fromMillis(
        opensAt.toMillis() + 24 * 60 * 60 * 1000,
      );
      t.update(matchRef, {
        ...baseMatchUpdate,
        status: 'finished',
        mvpVoting: { status: 'open', opensAt, closesAt, calculatedAt: null },
        mvpVotes: {},
        mvpGroupMemberId: null,
      });
    } else {
      // Editing a scheduled match without finalizing: no stats changes
      t.update(matchRef, { ...baseMatchUpdate, status: 'scheduled' });
    }
  });

  // When finalizing a scheduled match, cancel any pending reminders
  if (currentStatus === 'scheduled' && markAsFinished) {
    try {
      const remindersSnap = await db
        .collection('matchReminders')
        .where('matchId', '==', matchId)
        .where('status', '==', 'pending')
        .get();

      if (!remindersSnap.empty) {
        const remindersBatch = db.batch();
        remindersSnap.docs.forEach(doc => {
          remindersBatch.update(doc.ref, {
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
          });
        });
        await remindersBatch.commit();
      }
    } catch (err) {
      logger.warn('editChallengeMatch: failed to cancel reminders', { matchId, err: String(err) });
    }
  }

  logger.info('editChallengeMatch: match updated successfully', { matchId, uid });
  return { success: true };
});
