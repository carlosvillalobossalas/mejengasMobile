const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { chunk } = require('../utils/helpers');

const VALID_POSITIONS = new Set(['POR', 'DEF', 'MED', 'DEL']);

const normalizePlayers = players =>
  (players ?? []).map(player => {
    const rawGroupMemberId = typeof player?.groupMemberId === 'string'
      ? player.groupMemberId.trim()
      : null;

    return {
      groupMemberId: rawGroupMemberId ? rawGroupMemberId : null,
      position: VALID_POSITIONS.has(player?.position) ? player.position : 'DEF',
      goals: Number(player?.goals ?? 0) || 0,
      assists: Number(player?.assists ?? 0) || 0,
      ownGoals: Number(player?.ownGoals ?? 0) || 0,
      isSub: Boolean(player?.isSub ?? false),
    };
  });

const processMatchImpact = (matchData, multiplier, t, db, FieldValue) => {
  const { groupId, season, goalsTeam1, goalsTeam2, players1, players2 } = matchData;

  const team1Won = goalsTeam1 > goalsTeam2;
  const team2Won = goalsTeam2 > goalsTeam1;
  const isDraw = goalsTeam1 === goalsTeam2;

  const applyTeam = (players, isTeam1) => {
    const rivalGoals = isTeam1 ? Number(goalsTeam2) : Number(goalsTeam1);
    const myTeamWon = isTeam1 ? team1Won : team2Won;
    const myTeamLost = isTeam1 ? team2Won : team1Won;

    for (const player of players ?? []) {
      const gmbId = player.groupMemberId;
      if (!gmbId) continue;

      const docId = `${groupId}_${season}_${gmbId}`;
      const ref = db.collection('seasonStats').doc(docId);
      const m = multiplier;

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

exports.deleteMatch = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para eliminar partidos.');
  }

  const { matchId } = request.data ?? {};
  if (!matchId || typeof matchId !== 'string') {
    throw new HttpsError('invalid-argument', 'matchId es requerido.');
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
  if (callerRole !== 'owner') {
    throw new HttpsError('permission-denied', 'Solo el owner puede eliminar partidos.');
  }

  await db.runTransaction(async t => {
    const snap = await t.get(matchRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', `El partido "${matchId}" no existe.`);
    }

    const current = snap.data();
    const status = String(current.status ?? 'finished');

    if (status === 'finished') {
      const season = Number(current.season ?? new Date().getFullYear());
      processMatchImpact(
        {
          groupId: String(current.groupId ?? ''),
          season,
          goalsTeam1: Number(current.goalsTeam1 ?? 0),
          goalsTeam2: Number(current.goalsTeam2 ?? 0),
          players1: normalizePlayers(current.players1),
          players2: normalizePlayers(current.players2),
        },
        -1,
        t,
        db,
        FieldValue,
      );
    }

    t.delete(matchRef);
  });

  try {
    const remindersSnap = await db
      .collection('matchReminders')
      .where('matchId', '==', matchId)
      .get();

    if (!remindersSnap.empty) {
      const refs = remindersSnap.docs.map(doc => doc.ref);
      const refChunks = chunk(refs, 450);

      for (const refsChunk of refChunks) {
        const batch = db.batch();
        refsChunk.forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }
  } catch (err) {
    logger.warn('deleteMatch: failed to delete reminder docs', { matchId, err: String(err) });
  }

  logger.info('deleteMatch: match deleted successfully', { matchId, uid });
  return { success: true };
});
