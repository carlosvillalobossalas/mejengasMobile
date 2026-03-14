import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import type { MatchPosition } from '../../types/matchPublication';
import type { MatchVenue } from '../../types/venue';

const COLLECTION = 'publicMatchListings';

export type PublicMatchType = 'matches' | 'matchesByTeams' | 'matchesByChallenge';

export type PublicMatchListing = {
  id: string;
  groupId: string;
  groupName: string | null;
  sourceMatchId: string;
  sourceMatchType: PublicMatchType;
  matchDate: string;
  city: string;
  neededPlayers: number;
  acceptedPlayers: number;
  preferredPositions: MatchPosition[];
  allowAnyPosition: boolean;
  notes: string | null;
  status: 'open' | 'closed';
  closedReason: 'manual' | 'filled' | 'expired' | null;
  publishedByUserId: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  venue: MatchVenue | null;
};

const toIsoString = (value: unknown): string => {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return new Date().toISOString();
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): PublicMatchListing => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    groupName: d.groupName ? String(d.groupName) : null,
    sourceMatchId: String(d.sourceMatchId ?? ''),
    sourceMatchType: (d.sourceMatchType as PublicMatchType) ?? 'matches',
    matchDate: toIsoString(d.matchDate),
    city: String(d.city ?? ''),
    neededPlayers: Number(d.neededPlayers ?? 0),
    acceptedPlayers: Number(d.acceptedPlayers ?? 0),
    preferredPositions: Array.isArray(d.preferredPositions)
      ? (d.preferredPositions as MatchPosition[])
      : [],
    allowAnyPosition: Boolean(d.allowAnyPosition ?? true),
    notes: d.notes ? String(d.notes) : null,
    status: (d.status as PublicMatchListing['status']) ?? 'open',
    closedReason: (d.closedReason as PublicMatchListing['closedReason']) ?? null,
    publishedByUserId: d.publishedByUserId ? String(d.publishedByUserId) : null,
    publishedAt: toIsoString(d.publishedAt),
    closedAt: toIsoString(d.closedAt),
    venue: (() => {
      const v = d.venue as Record<string, unknown> | undefined;
      if (!v || typeof v !== 'object') return null;
      return {
        name: String(v.name ?? ''),
        address: String(v.address ?? ''),
        latitude: Number(v.latitude ?? 0),
        longitude: Number(v.longitude ?? 0),
        notes: v.notes ? String(v.notes) : null,
      } satisfies MatchVenue;
    })(),
  };
};

export function subscribeOpenPublicListings(
  onNext: (rows: PublicMatchListing[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return firestore()
    .collection(COLLECTION)
    .orderBy('publishedAt', 'desc')
    .onSnapshot(
      snap => {
        const rows = snap.docs.map(mapDoc);
        onNext(rows);
      },
      err => onError?.(err),
    );
}

export async function closePublicListing(
  listingId: string,
  closedReason: 'manual' | 'filled' | 'expired',
): Promise<void> {
  await firestore().collection(COLLECTION).doc(listingId).update({
    status: 'closed',
    closedReason,
    closedAt: firestore.FieldValue.serverTimestamp(),
  });
}
