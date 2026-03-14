import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import type { FavoriteVenue, MatchVenue } from '../../types/venue';

const USERS_COLLECTION = 'users';
const VENUES_SUBCOLLECTION = 'favoriteVenues';

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return null;
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): FavoriteVenue => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    userId: String(d.userId ?? ''),
    name: String(d.name ?? ''),
    address: String(d.address ?? ''),
    latitude: Number(d.latitude ?? 0),
    longitude: Number(d.longitude ?? 0),
    notes: d.notes ? String(d.notes) : null,
    createdAt: toIsoString(d.createdAt),
  };
};

const venuesRef = (userId: string) =>
  firestore()
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection(VENUES_SUBCOLLECTION);

/**
 * Subscribe to all favourite venues for a user, ordered by creation time descending.
 * Returns an unsubscribe function.
 */
export function subscribeToFavoriteVenues(
  userId: string,
  onNext: (venues: FavoriteVenue[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return venuesRef(userId)
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      snap => onNext(snap.docs.map(mapDoc)),
      err => onError?.(err),
    );
}

/**
 * Add a new favourite venue for a user.
 * Returns the new document ID.
 */
export async function addFavoriteVenue(
  userId: string,
  venue: MatchVenue,
): Promise<string> {
  const docRef = await venuesRef(userId).add({
    userId,
    name: venue.name,
    address: venue.address,
    latitude: venue.latitude,
    longitude: venue.longitude,
    notes: venue.notes ?? null,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Delete a favourite venue by ID.
 */
export async function deleteFavoriteVenue(
  userId: string,
  venueId: string,
): Promise<void> {
  await venuesRef(userId).doc(venueId).delete();
}
