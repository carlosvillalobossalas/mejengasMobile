const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const LISTINGS_COLLECTION = 'publicMatchListings';
const APPLICATIONS_COLLECTION = 'publicMatchApplications';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';
const USERS_COLLECTION = 'users';
const VALID_POSITIONS = new Set(['POR', 'DEF', 'MED', 'DEL']);

exports.applyPublicMatchApplication = onCall({ invoker: 'public' }, async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para postularte.');
  }

  const rawData = request.data ?? {};
  const listingId = typeof rawData.listingId === 'string' ? rawData.listingId.trim() : '';
  const note = typeof rawData.note === 'string' && rawData.note.trim() ? rawData.note.trim() : null;
  const preferredPositions = Array.isArray(rawData.preferredPositions)
    ? rawData.preferredPositions.filter(pos => VALID_POSITIONS.has(pos))
    : [];

  if (!listingId) {
    throw new HttpsError('invalid-argument', 'listingId es requerido.');
  }

  const db = admin.firestore();
  const listingRef = db.collection(LISTINGS_COLLECTION).doc(listingId);
  const userRef = db.collection(USERS_COLLECTION).doc(uid);

  const result = await db.runTransaction(async tx => {
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists) {
      throw new HttpsError('not-found', 'La publicación no existe.');
    }

    const listing = listingSnap.data();
    if (listing.status !== 'open') {
      throw new HttpsError('failed-precondition', 'Esta publicación ya no está abierta.');
    }

    const now = admin.firestore.Timestamp.now();
    const matchDate = listing.matchDate;
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

    const groupId = String(listing.groupId ?? '');
    if (!groupId) {
      throw new HttpsError('failed-precondition', 'La publicación no tiene grupo asociado.');
    }

    const membershipSnap = await db
      .collection(GROUP_MEMBERS_V2_COLLECTION)
      .where('groupId', '==', groupId)
      .where('userId', '==', uid)
      .limit(1)
      .get();

    if (!membershipSnap.empty) {
      throw new HttpsError('failed-precondition', 'Ya eres miembro de este grupo.');
    }

    const pendingSnap = await db
      .collection(APPLICATIONS_COLLECTION)
      .where('listingId', '==', listingId)
      .where('applicantUserId', '==', uid)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!pendingSnap.empty) {
      throw new HttpsError('already-exists', 'Ya tienes una postulación pendiente para este partido.');
    }

    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() ?? {};
    const displayName = String(userData.displayName ?? '').trim() || 'Jugador';
    const photoURL = typeof userData.photoURL === 'string' ? userData.photoURL : null;

    const applicationRef = db.collection(APPLICATIONS_COLLECTION).doc();
    tx.set(applicationRef, {
      listingId,
      groupId,
      sourceMatchId: String(listing.sourceMatchId ?? ''),
      sourceMatchType: String(listing.sourceMatchType ?? 'matches'),
      applicantUserId: uid,
      applicantDisplayName: displayName,
      applicantPhotoURL: photoURL,
      preferredPositions,
      note,
      status: 'pending',
      membershipMode: null,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { applicationId: applicationRef.id };
  });

  return result;
});
