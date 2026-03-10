const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { chunk } = require('../utils/helpers');

const COLLECTION = 'matchesByChallenge';
const STATS_COLLECTION = 'challengeSeasonStats';

const processChallengeMatchImpact = (matchData, multiplier, t, db, FieldValue) => {
  const { groupId, season, goalsTeam, goalsOpponent, players } = matchData;

  const teamWon = goalsTeam > goalsOpponent;
  const teamLost = goalsOpponent > goalsTeam;
  const isDraw = goalsTeam === goalsOpponent;

  for (const player of players ?? []) {
    const gmbId = player.groupMemberId;
    if (!gmbId) continue;

    const docId = `${groupId}_${season}_${gmbId}`;
    const ref = db.collection(STATS_COLLECTION).doc(docId);
    const m = multiplier;

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

exports.deleteChallengeMatch = onCall(async request => {
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
  const matchRef = db.collection(COLLECTION).doc(matchId);

  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new HttpsError('not-found', `El partido "${matchId}" no existe.`);
  }

  const matchData = matchSnap.data();
  const groupId = String(matchData.groupId ?? '');

  // Verify the caller is the group owner using groups.ownerId (same check as the UI)
  const groupSnap = await db.collection('groups').doc(groupId).get();
  if (!groupSnap.exists) {
    throw new HttpsError('not-found', 'El grupo no existe.');
  }
  if (groupSnap.data().ownerId !== uid) {
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
      processChallengeMatchImpact(
        {
          groupId: String(current.groupId ?? ''),
          season,
          goalsTeam: Number(current.goalsTeam ?? 0),
          goalsOpponent: Number(current.goalsOpponent ?? 0),
          players: current.players ?? [],
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
      const refs = remindersSnap.docs
        .filter(doc => {
          const data = doc.data();
          return data.matchCollection === COLLECTION;
        })
        .map(doc => doc.ref);

      const refChunks = chunk(refs, 450);
      for (const refsChunk of refChunks) {
        const batch = db.batch();
        refsChunk.forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }
  } catch (err) {
    logger.warn('deleteChallengeMatch: failed to delete reminder docs', { matchId, err: String(err) });
  }

  // Clean up the public match listing and its applications using the deterministic listing ID
  try {
    const listingId = `matchesByChallenge_${matchId}`;
    const listingRef = db.collection('publicMatchListings').doc(listingId);
    const listingSnap = await listingRef.get();

    if (listingSnap.exists) {
      // Delete all applications tied to this listing
      const applicationsSnap = await db
        .collection('publicMatchApplications')
        .where('listingId', '==', listingId)
        .get();

      if (!applicationsSnap.empty) {
        const appRefs = applicationsSnap.docs.map(d => d.ref);
        const appChunks = chunk(appRefs, 450);
        for (const appChunk of appChunks) {
          const batch = db.batch();
          appChunk.forEach(ref => batch.delete(ref));
          await batch.commit();
        }
      }

      await listingRef.delete();
      logger.info('deleteChallengeMatch: listing deleted', { listingId, matchId });
    }
  } catch (err) {
    logger.warn('deleteChallengeMatch: failed to delete publicMatchListings', { matchId, err: String(err) });
  }

  logger.info('deleteChallengeMatch: match deleted successfully', { matchId, uid });
  return { success: true };
});
