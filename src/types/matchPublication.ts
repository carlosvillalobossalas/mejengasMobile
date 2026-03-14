export type MatchPosition = 'POR' | 'DEF' | 'MED' | 'DEL';

export type MatchPublicationCloseReason = 'manual' | 'filled' | 'expired' | null;

export type MatchPublication = {
  isPublished: boolean;
  neededPlayers: number;
  preferredPositions: MatchPosition[];
  allowAnyPosition: boolean;
  city: string | null;
  notes: string | null;
  publishedByUserId: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  closedByUserId: string | null;
  closeReason: MatchPublicationCloseReason;
};

import type { MatchVenue } from './venue';

export type MatchPublicationInput = {
  isPublished: boolean;
  neededPlayers: number;
  preferredPositions?: MatchPosition[];
  allowAnyPosition?: boolean;
  city?: string | null;
  notes?: string | null;
  publishedByUserId?: string | null;
  venue?: MatchVenue | null;
};

export const createDefaultMatchPublication = (): MatchPublication => ({
  isPublished: false,
  neededPlayers: 0,
  preferredPositions: [],
  allowAnyPosition: true,
  city: null,
  notes: null,
  publishedByUserId: null,
  publishedAt: null,
  closedAt: null,
  closedByUserId: null,
  closeReason: null,
});
