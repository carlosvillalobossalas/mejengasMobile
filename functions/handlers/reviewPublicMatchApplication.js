const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const LISTINGS_COLLECTION = 'publicMatchListings';
const APPLICATIONS_COLLECTION = 'publicMatchApplications';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';
const USERS_COLLECTION = 'users';

const SOURCE_COLLECTION_BY_TYPE = {
  matches: 'matches',
  matchesByTeams: 'matchesByTeams',
  matchesByChallenge: 'matchesByChallenge',
};

const VALID_POSITIONS = new Set(['POR', 'DEF', 'MED', 'DEL']);

const normalizePreferredPosition = preferredPositions => {
  if (!Array.isArray(preferredPositions) || preferredPositions.length === 0) {
    return 'DEF';
  }

  const next = preferredPositions.find(pos => VALID_POSITIONS.has(pos));
  return next || 'DEF';
};

const isEmptySlot = player => {
  const id = typeof player?.groupMemberId === 'string' ? player.groupMemberId.trim() : '';
  return !id;
};

const hasPlayer = (players, groupMemberId) =>
  Array.isArray(players) && players.some(player => String(player?.groupMemberId ?? '') === groupMemberId);

const buildPlayerEntry = (groupMemberId, preferredPosition, isSub = false) => ({
  groupMemberId,
  position: preferredPosition,
  goals: 0,
  assists: 0,
  ownGoals: 0,
  isSub,
});

const withInsertedPlayer = (players, groupMemberId, preferredPosition) => {
  if (!Array.isArray(players)) {
    return [buildPlayerEntry(groupMemberId, preferredPosition)];
  }

  if (hasPlayer(players, groupMemberId)) {
    return players;
  }

  const firstEmptyIdx = players.findIndex(isEmptySlot);
  if (firstEmptyIdx >= 0) {
    const next = [...players];
    next[firstEmptyIdx] = {
      ...next[firstEmptyIdx],
      ...buildPlayerEntry(groupMemberId, preferredPosition),
    };
    return next;
  }

  return [...players, buildPlayerEntry(groupMemberId, preferredPosition, true)];
};

const canManageApplications = ({ role, isOwner, isCreator }) =>
  role === 'owner' || role === 'admin' || isOwner || isCreator;

exports.reviewPublicMatchApplication = onCall({ invoker: 'public' }, async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para gestionar postulaciones.');
  }

  const rawData = request.data ?? {};
  const applicationId = typeof rawData.applicationId === 'string' ? rawData.applicationId.trim() : '';
  const decision = rawData.decision;
  const membershipMode = rawData.membershipMode === 'permanent' ? 'permanent' : 'temporary';

  if (!applicationId) {
    throw new HttpsError('invalid-argument', 'applicationId es requerido.');
  }
  if (decision !== 'accepted' && decision !== 'rejected') {
    throw new HttpsError('invalid-argument', 'decision debe ser accepted o rejected.');
  }

  const db = admin.firestore();
  const applicationRef = db.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  await db.runTransaction(async tx => {
    const applicationSnap = await tx.get(applicationRef);
    if (!applicationSnap.exists) {
      throw new HttpsError('not-found', 'La postulación no existe.');
    }

    const application = applicationSnap.data();
    if (application.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Esta postulación ya fue procesada.');
    }

    const listingId = String(application.listingId ?? '');
    const groupId = String(application.groupId ?? '');
    const applicantUserId = String(application.applicantUserId ?? '');
    const sourceMatchType = String(application.sourceMatchType ?? 'matches');
    const sourceMatchId = String(application.sourceMatchId ?? '');

    const listingRef = db.collection(LISTINGS_COLLECTION).doc(listingId);
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists) {
      throw new HttpsError('not-found', 'La publicación asociada ya no existe.');
    }
    const listing = listingSnap.data();

    const memberSnap = await db
      .collection(GROUP_MEMBERS_V2_COLLECTION)
      .where('groupId', '==', groupId)
      .where('userId', '==', uid)
      .limit(1)
      .get();

    const role = memberSnap.empty ? '' : String(memberSnap.docs[0].data().role ?? '');

    const sourceCollection = SOURCE_COLLECTION_BY_TYPE[sourceMatchType] || 'matches';
    const sourceMatchRef = db.collection(sourceCollection).doc(sourceMatchId);
    const sourceMatchSnap = await tx.get(sourceMatchRef);
    const sourceMatch = sourceMatchSnap.exists ? sourceMatchSnap.data() : null;
    const sourceCreatedByUserId = sourceMatch ? String(sourceMatch.createdByUserId ?? '') : '';

    const isOwner = sourceMatch ? String(sourceMatch.ownerId ?? '') === uid : false;
    const isCreator = sourceCreatedByUserId && sourceCreatedByUserId === uid;

    if (!canManageApplications({ role, isOwner, isCreator })) {
      throw new HttpsError(
        'permission-denied',
        'Solo owner, admin o creador del partido pueden gestionar postulaciones.',
      );
    }

    if (decision === 'rejected') {
      tx.update(applicationRef, {
        status: 'rejected',
        membershipMode: null,
        reviewedByUserId: uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const matchDate = listing.matchDate;
    if (listing.status !== 'open') {
      throw new HttpsError('failed-precondition', 'La publicación ya no está abierta.');
    }
    if (matchDate && typeof matchDate.toMillis === 'function' && matchDate.toMillis() <= now.toMillis()) {
      tx.update(listingRef, {
        status: 'closed',
        closedReason: 'expired',
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new HttpsError('failed-precondition', 'La publicación ya expiró.');
    }

    const neededPlayers = Number(listing.neededPlayers ?? 0);
    const acceptedPlayers = Number(listing.acceptedPlayers ?? 0);
    if (neededPlayers <= 0 || acceptedPlayers >= neededPlayers) {
      tx.update(listingRef, {
        status: 'closed',
        closedReason: 'filled',
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new HttpsError('failed-precondition', 'La publicación ya completó sus cupos.');
    }

    const nextAcceptedPlayers = acceptedPlayers + 1;
    tx.update(listingRef, {
      acceptedPlayers: nextAcceptedPlayers,
      status: nextAcceptedPlayers >= neededPlayers ? 'closed' : 'open',
      closedReason: nextAcceptedPlayers >= neededPlayers ? 'filled' : null,
      closedAt:
        nextAcceptedPlayers >= neededPlayers
          ? admin.firestore.FieldValue.serverTimestamp()
          : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(applicationRef, {
      status: 'accepted',
      membershipMode,
      reviewedByUserId: uid,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const existingMemberSnap = await db
      .collection(GROUP_MEMBERS_V2_COLLECTION)
      .where('groupId', '==', groupId)
      .where('userId', '==', applicantUserId)
      .limit(1)
      .get();

    let applicantGroupMemberId = existingMemberSnap.empty
      ? null
      : existingMemberSnap.docs[0].id;

    if (!applicantGroupMemberId) {
      const userRef = db.collection(USERS_COLLECTION).doc(applicantUserId);
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() ?? {};

      const displayName =
        String(userData.displayName ?? '').trim() || String(application.applicantDisplayName ?? 'Jugador');
      const photoUrl = typeof userData.photoURL === 'string'
        ? userData.photoURL
        : (application.applicantPhotoURL ?? null);

      const memberRef = db.collection(GROUP_MEMBERS_V2_COLLECTION).doc();
      applicantGroupMemberId = memberRef.id;

      tx.set(memberRef, {
        groupId,
        userId: applicantUserId,
        displayName,
        photoUrl,
        isGuest: false,
        role: 'member',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (sourceMatch && applicantGroupMemberId) {
      const preferredPosition = normalizePreferredPosition(application.preferredPositions);

      if (sourceMatchType === 'matchesByChallenge') {
        const nextPlayers = withInsertedPlayer(
          sourceMatch.players,
          applicantGroupMemberId,
          preferredPosition,
        );

        if (nextPlayers !== sourceMatch.players) {
          tx.update(sourceMatchRef, {
            players: nextPlayers,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } else {
        const players1 = Array.isArray(sourceMatch.players1) ? sourceMatch.players1 : [];
        const players2 = Array.isArray(sourceMatch.players2) ? sourceMatch.players2 : [];

        if (!hasPlayer(players1, applicantGroupMemberId) && !hasPlayer(players2, applicantGroupMemberId)) {
          const hasEmptyInTeam1 = players1.some(isEmptySlot);
          const hasEmptyInTeam2 = players2.some(isEmptySlot);

          let nextPlayers1 = players1;
          let nextPlayers2 = players2;

          if (hasEmptyInTeam1 || (!hasEmptyInTeam2 && players1.length <= players2.length)) {
            nextPlayers1 = withInsertedPlayer(players1, applicantGroupMemberId, preferredPosition);
          } else {
            nextPlayers2 = withInsertedPlayer(players2, applicantGroupMemberId, preferredPosition);
          }

          tx.update(sourceMatchRef, {
            players1: nextPlayers1,
            players2: nextPlayers2,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }
  });

  return { ok: true };
});
