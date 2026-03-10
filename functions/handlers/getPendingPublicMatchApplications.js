const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const APPLICATIONS_COLLECTION = 'publicMatchApplications';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';

const toIsoString = value => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
};

exports.getPendingPublicMatchApplications = onCall({ invoker: 'public' }, async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para ver postulaciones pendientes.');
  }

  const rawData = request.data ?? {};
  const groupId = typeof rawData.groupId === 'string' ? rawData.groupId.trim() : '';
  if (!groupId) {
    throw new HttpsError('invalid-argument', 'groupId es requerido.');
  }

  const db = admin.firestore();

  const membershipSnap = await db
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('groupId', '==', groupId)
    .where('userId', '==', uid)
    .limit(1)
    .get();

  if (membershipSnap.empty) {
    throw new HttpsError('permission-denied', 'No perteneces al grupo activo.');
  }

  const role = String(membershipSnap.docs[0].data()?.role ?? '');
  if (role !== 'owner' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo owner o admin pueden ver postulaciones pendientes.');
  }

  const snap = await db
    .collection(APPLICATIONS_COLLECTION)
    .where('groupId', '==', groupId)
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(200)
    .get();

  const rows = snap.docs.map(doc => {
    const data = doc.data() ?? {};
    return {
      id: doc.id,
      listingId: String(data.listingId ?? ''),
      groupId: String(data.groupId ?? ''),
      sourceMatchId: String(data.sourceMatchId ?? ''),
      sourceMatchType: String(data.sourceMatchType ?? 'matches'),
      applicantUserId: String(data.applicantUserId ?? ''),
      applicantDisplayName: String(data.applicantDisplayName ?? ''),
      applicantPhotoURL: typeof data.applicantPhotoURL === 'string' ? data.applicantPhotoURL : null,
      note: typeof data.note === 'string' ? data.note : null,
      preferredPositions: Array.isArray(data.preferredPositions) ? data.preferredPositions : [],
      status: String(data.status ?? 'pending'),
      membershipMode: data.membershipMode === 'permanent' ? 'permanent' : data.membershipMode === 'temporary' ? 'temporary' : null,
      reviewedByUserId: typeof data.reviewedByUserId === 'string' ? data.reviewedByUserId : null,
      reviewedAt: toIsoString(data.reviewedAt),
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  });

  return { rows };
});
