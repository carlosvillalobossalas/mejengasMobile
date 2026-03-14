/**
 * Location data stored inside a match document.
 * Immutable snapshot — not tied to a specific FavoriteVenue id.
 */
export type MatchVenue = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** Optional arrival notes written by the user when selecting the venue. */
  notes: string | null;
};

/**
 * A saved favourite venue stored per-user in Firestore.
 * Extends MatchVenue with identity and ownership fields.
 */
export type FavoriteVenue = MatchVenue & {
  id: string;
  userId: string;
  createdAt: string | null;
};
