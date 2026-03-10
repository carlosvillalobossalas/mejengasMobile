const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const APPLICATIONS_COLLECTION = 'publicMatchApplications';

const toIsoString = value => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
};

exports.getMyPublicMatchApplications = onCall({ invoker: 'public' }, async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para ver tus postulaciones.');
  }

  const db = admin.firestore();
  const snap = await db
    .collection(APPLICATIONS_COLLECTION)
    .where('applicantUserId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(100)
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
