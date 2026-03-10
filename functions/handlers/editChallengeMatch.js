const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { chunk } = require('../utils/helpers');

const COLLECTION = 'matchesByChallenge';
const STATS_COLLECTION = 'challengeSeasonStats';
const PUBLIC_MATCH_LISTINGS_COLLECTION = 'publicMatchListings';
const VALID_POSITIONS = new Set(['POR', 'DEF', 'MED', 'DEL']);

const buildListingId = matchId => `matchesByChallenge_${matchId}`;

const normalizeHexColor = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return null;
  return trimmed.toUpperCase();
};

const normalizePublication = publication => {
  const raw = publication && typeof publication === 'object' ? publication : {};
  const preferredPositions = Array.isArray(raw.preferredPositions)
    ? raw.preferredPositions.filter(pos => ['POR', 'DEF', 'MED', 'DEL'].includes(pos))
    : [];

  return {
    isPublished: Boolean(raw.isPublished ?? false),
    neededPlayers: Math.max(0, Number(raw.neededPlayers ?? 0) || 0),
    preferredPositions,
    allowAnyPosition: Boolean(raw.allowAnyPosition ?? true),
    city: typeof raw.city === 'string' && raw.city.trim() ? raw.city.trim() : null,
    notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : null,
    publishedByUserId:
      typeof raw.publishedByUserId === 'string' && raw.publishedByUserId.trim()
        ? raw.publishedByUserId.trim()
        : null,
    publishedAt: null,
    closedAt: null,
    closedByUserId: null,
    closeReason: null,
  };
};

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

  const {
    players,
    goalsTeam,
    goalsOpponent,
    opponentName,
    date,
    teamColor,
    opponentColor,
    publication,
    markAsFinished = false,
  } = updatedMatchData;

  if (!Array.isArray(players)) {
    throw new HttpsError('invalid-argument', 'players debe ser un arreglo.');
  }
  if (typeof goalsTeam !== 'number' || typeof goalsOpponent !== 'number') {
    throw new HttpsError('invalid-argument', 'goalsTeam y goalsOpponent deben ser números.');
  }
  if (!date || typeof date !== 'string') {
    throw new HttpsError('invalid-argument', 'date es requerida y debe ser una cadena ISO-8601.');
  }

  const normalizedPlayers = normalizePlayers(players);

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
  const playerIds = normalizedPlayers.map(p => p.groupMemberId).filter(id => !!id);
  const playerIdSet = new Set(playerIds);
  if (playerIdSet.size < playerIds.length) {
    throw new HttpsError('invalid-argument', 'Hay jugadores duplicados en el equipo.');
  }

  // Validate all players belong to the group
  const FIRESTORE_IN_LIMIT = 10;
  const uniquePlayerIds = [...playerIdSet];
  let groupMemberDocs = [];

  if (uniquePlayerIds.length > 0) {
    const playerIdChunks = chunk(uniquePlayerIds, FIRESTORE_IN_LIMIT);
    groupMemberDocs = (
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
  }

  if (groupMemberDocs.length !== playerIdSet.size) {
    throw new HttpsError('invalid-argument', 'Uno o más jugadores no pertenecen a este grupo.');
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new HttpsError('invalid-argument', 'date no es una fecha válida.');
  }

  const normalizedPublication = publication !== undefined
    ? normalizePublication(publication)
    : undefined;

  const currentStatus = String(matchData.status ?? 'finished');

  try {
    await db.runTransaction(async t => {
      const snap = await t.get(matchRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', `El partido "${matchId}" no existe.`);
      }

      const old = snap.data();
      const statusInTransaction = old.status ?? 'finished';
      const listingRef = db
        .collection(PUBLIC_MATCH_LISTINGS_COLLECTION)
        .doc(buildListingId(matchId));
      let listingSnap = null;
      let existingListing = null;

      if (normalizedPublication !== undefined) {
        listingSnap = await t.get(listingRef);
        existingListing = listingSnap.exists ? listingSnap.data() : null;
      }

      const groupRef = db.collection('groups').doc(String(old.groupId ?? ''));
      const groupSnap = await t.get(groupRef);
      const groupName = groupSnap.exists
        ? (String(groupSnap.data()?.name ?? '').trim() || null)
        : null;

      const newMatchForImpact = {
        groupId: old.groupId,
        season: old.season,
        goalsTeam,
        goalsOpponent,
        players: normalizedPlayers,
      };

      const baseMatchUpdate = {
        players: normalizedPlayers,
        goalsTeam,
        goalsOpponent,
        teamColor: normalizeHexColor(teamColor),
        opponentColor: normalizeHexColor(opponentColor),
        ...(normalizedPublication !== undefined ? { publication: normalizedPublication } : {}),
        opponentName: String(opponentName ?? ''),
        date: admin.firestore.Timestamp.fromDate(parsedDate),
        editedAt: FieldValue.serverTimestamp(),
        editedBy: uid,
        impactVersion: FieldValue.increment(1),
      };

      if (statusInTransaction === 'finished') {
        processChallengeMatchImpact(old, -1, t, db, FieldValue);
        processChallengeMatchImpact(newMatchForImpact, +1, t, db, FieldValue);
        t.update(matchRef, { ...baseMatchUpdate, status: 'finished' });
      } else if (statusInTransaction === 'scheduled' && markAsFinished) {
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
        t.update(matchRef, { ...baseMatchUpdate, status: 'scheduled' });
      }

      if (normalizedPublication !== undefined) {
        if (normalizedPublication.isPublished && normalizedPublication.neededPlayers > 0) {
          t.set(
            listingRef,
            {
              groupId: old.groupId,
              groupName,
              sourceMatchId: matchId,
              sourceMatchType: 'matchesByChallenge',
              matchDate: admin.firestore.Timestamp.fromDate(parsedDate),
              city: normalizedPublication.city ?? '',
              neededPlayers: normalizedPublication.neededPlayers,
              acceptedPlayers: Number(existingListing?.acceptedPlayers ?? 0),
              preferredPositions: normalizedPublication.allowAnyPosition
                ? []
                : normalizedPublication.preferredPositions,
              allowAnyPosition: normalizedPublication.allowAnyPosition,
              notes: normalizedPublication.notes ?? null,
              status: 'open',
              closedReason: null,
              publishedByUserId: normalizedPublication.publishedByUserId ?? uid,
              publishedAt: existingListing?.publishedAt ?? FieldValue.serverTimestamp(),
              closedAt: null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        } else if (listingSnap?.exists) {
          t.delete(listingRef);
        }
      }
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error('editChallengeMatch: unexpected error while saving', {
      matchId,
      uid,
      err: String(error),
    });
    throw new HttpsError('internal', 'No se pudo editar el partido. Intenta de nuevo.');
  }

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
