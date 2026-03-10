const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const LISTINGS_COLLECTION = 'publicMatchListings';

const toIsoString = value => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
};

exports.getOpenPublicMatchListings = onCall({ invoker: 'public' }, async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para ver publicaciones abiertas.');
  }

  const db = admin.firestore();
  const snap = await db
    .collection(LISTINGS_COLLECTION)
    .where('status', '==', 'open')
    .orderBy('matchDate', 'asc')
    .limit(100)
    .get();

  const rows = [];

  snap.docs.forEach(doc => {
    const data = doc.data() ?? {};
    const neededPlayers = Number(data.neededPlayers ?? 0);
    const acceptedPlayers = Number(data.acceptedPlayers ?? 0);
    const isFilled = neededPlayers > 0 && acceptedPlayers >= neededPlayers;

    if (neededPlayers <= 0 || isFilled) {
      return;
    }

    rows.push({
      id: doc.id,
      groupId: String(data.groupId ?? ''),
      sourceMatchId: String(data.sourceMatchId ?? ''),
      sourceMatchType: String(data.sourceMatchType ?? 'matches'),
      matchDate: toIsoString(data.matchDate),
      city: String(data.city ?? ''),
      neededPlayers,
      acceptedPlayers,
      preferredPositions: Array.isArray(data.preferredPositions) ? data.preferredPositions : [],
      allowAnyPosition: Boolean(data.allowAnyPosition ?? true),
      notes: typeof data.notes === 'string' ? data.notes : null,
      status: 'open',
      closedReason: null,
      publishedByUserId: typeof data.publishedByUserId === 'string' ? data.publishedByUserId : null,
      publishedAt: toIsoString(data.publishedAt),
      closedAt: null,
    });
  });

  return { rows };
});
