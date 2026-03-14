import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import type { MatchPublicationInput } from '../../types/matchPublication';
import type { MatchVenue } from '../../types/venue';

export type TeamPlayer = {
  position: 'POR' | 'DEF' | 'MED' | 'DEL';
  groupMemberId: string | null;
  playerName: string;
  goals: string;
  assists: string;
  ownGoals: string;
  isSub?: boolean;
};

export type MatchToSave = {
  date: Date;
  groupId: string;
  team1Players: TeamPlayer[];
  team2Players: TeamPlayer[];
  team1Goals: number;
  team2Goals: number;
  team1Color?: string;
  team2Color?: string;
  publication?: MatchPublicationInput;
  venue?: MatchVenue | null;
  createdByUserId?: string | null;
  createdByGroupMemberId?: string | null;
};

type PlayerStats = {
  goals: number;
  assists: number;
  ownGoals: number;
  won: boolean;
  lost: boolean;
  draw: boolean;
  isGoalkeeper: boolean;
  // Only relevant for goalkeepers
  goalsConceded?: number;
  cleanSheet?: number;
};

const MATCHES_COLLECTION = 'matches';
const GROUPS_COLLECTION = 'groups';
const SEASON_STATS_COLLECTION = 'seasonStats';
const PUBLIC_MATCH_LISTINGS_COLLECTION = 'publicMatchListings';

const buildListingId = (matchId: string) => `matches_${matchId}`;

const shouldPublishListing = (publication?: MatchPublicationInput): boolean =>
  Boolean(publication?.isPublished) && Number(publication?.neededPlayers ?? 0) > 0;

const getGroupNameById = async (groupId: string): Promise<string | null> => {
  try {
    const groupDoc = await firestore().collection(GROUPS_COLLECTION).doc(groupId).get();
    if (!groupDoc.exists) return null;
    const data = (groupDoc.data() ?? {}) as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    return name || null;
  } catch {
    return null;
  }
};

const addPublicListingToBatch = (
  batch: FirebaseFirestoreTypes.WriteBatch,
  matchId: string,
  groupId: string,
  groupName: string | null,
  matchDate: Date,
  publication: MatchPublicationInput | undefined,
  fallbackPublisherUserId: string | null,
): void => {
  if (!shouldPublishListing(publication)) {
    return;
  }

  const listingRef = firestore()
    .collection(PUBLIC_MATCH_LISTINGS_COLLECTION)
    .doc(buildListingId(matchId));

  batch.set(
    listingRef,
    {
      groupId,
      groupName,
      sourceMatchId: matchId,
      sourceMatchType: 'matches',
      matchDate: firestore.Timestamp.fromDate(matchDate),
      city: publication?.city ?? '',
      neededPlayers: Number(publication?.neededPlayers ?? 0),
      acceptedPlayers: 0,
      preferredPositions: publication?.allowAnyPosition ? [] : (publication?.preferredPositions ?? []),
      allowAnyPosition: Boolean(publication?.allowAnyPosition ?? true),
      notes: publication?.notes ?? null,
      status: 'open',
      closedReason: null,
      publishedByUserId: publication?.publishedByUserId ?? fallbackPublisherUserId,
      publishedAt: firestore.FieldValue.serverTimestamp(),
      closedAt: null,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};

/**
 * Adds two batch operations on the seasonStats doc for a single player:
 * 1. set({ merge: true }) with base identity fields to ensure the doc exists
 *    without overwriting any existing stats blocks.
 * 2. update() with FieldValue.increment via dot-notation on the specific block
 *    (goalkeeperStats.* for POR, playerStats.* for all others).
 *
 * No pre-read is needed. FieldValue.increment initializes a missing field to
 * the given value, so the first match for a new player is handled correctly.
 * Using both ops in the same batch is safe and atomic.
 */
function addSeasonStatsToBatch(
  batch: FirebaseFirestoreTypes.WriteBatch,
  groupMemberId: string,
  groupId: string,
  season: number,
  stats: PlayerStats,
): void {
  const docId = `${groupId}_${season}_${groupMemberId}`;
  const ref = firestore().collection(SEASON_STATS_COLLECTION).doc(docId);

  // Guarantee the document exists. merge: true means existing stats blocks
  // are never overwritten — only the identity fields are merged in.
  batch.set(ref, { groupId, season, groupMemberId }, { merge: true });

  if (stats.isGoalkeeper) {
    batch.update(ref, {
      'goalkeeperStats.matches': firestore.FieldValue.increment(1),
      'goalkeeperStats.goalsConceded': firestore.FieldValue.increment(stats.goalsConceded ?? 0),
      'goalkeeperStats.cleanSheets': firestore.FieldValue.increment(stats.cleanSheet ?? 0),
      'goalkeeperStats.goals': firestore.FieldValue.increment(stats.goals),
      'goalkeeperStats.assists': firestore.FieldValue.increment(stats.assists),
      'goalkeeperStats.ownGoals': firestore.FieldValue.increment(stats.ownGoals),
      'goalkeeperStats.won': firestore.FieldValue.increment(stats.won ? 1 : 0),
      'goalkeeperStats.lost': firestore.FieldValue.increment(stats.lost ? 1 : 0),
      'goalkeeperStats.draw': firestore.FieldValue.increment(stats.draw ? 1 : 0),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  } else {
    batch.update(ref, {
      'playerStats.matches': firestore.FieldValue.increment(1),
      'playerStats.goals': firestore.FieldValue.increment(stats.goals),
      'playerStats.assists': firestore.FieldValue.increment(stats.assists),
      'playerStats.ownGoals': firestore.FieldValue.increment(stats.ownGoals),
      'playerStats.won': firestore.FieldValue.increment(stats.won ? 1 : 0),
      'playerStats.lost': firestore.FieldValue.increment(stats.lost ? 1 : 0),
      'playerStats.draw': firestore.FieldValue.increment(stats.draw ? 1 : 0),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Save a match to the 'matches' collection and atomically update all affected
 * seasonStats documents in a single batch — no pre-reads required.
 *
 * - Uses groupMemberId exclusively (never playerId).
 * - POR → goalkeeperStats block; DEF/MED/DEL → playerStats block.
 * - goalsConceded = goals scored by the opposing team.
 * - cleanSheets: incremented only when rival goals == 0.
 * - won/lost/draw: based on team membership.
 */
export async function saveMatch(match: MatchToSave): Promise<void> {
  const season = match.date.getFullYear();
  const { team1Goals, team2Goals, groupId } = match;
  const createdByUserId = match.createdByUserId ?? null;
  const createdByGroupMemberId = match.createdByGroupMemberId ?? null;

  const team1Won = team1Goals > team2Goals;
  const team2Won = team2Goals > team1Goals;
  const isDraw = team1Goals === team2Goals;

  const batch = firestore().batch();
  const groupName = await getGroupNameById(groupId);

  // Write the match document
  const matchRef = firestore().collection(MATCHES_COLLECTION).doc();
  // Both timestamps derived from the same client-side reference point
  // so they are consistent with each other.
  const opensAt = firestore.Timestamp.fromDate(new Date());
  const closesAt = firestore.Timestamp.fromMillis(opensAt.toMillis() + 24 * 60 * 60 * 1000);

  batch.set(matchRef, {
    groupId,
    season,
    createdByUserId,
    createdByGroupMemberId,
    date: firestore.Timestamp.fromDate(match.date),
    createdAt: firestore.FieldValue.serverTimestamp(),
    registeredDate: firestore.FieldValue.serverTimestamp(),
    goalsTeam1: team1Goals,
    goalsTeam2: team2Goals,
    team1Color: match.team1Color ?? null,
    team2Color: match.team2Color ?? null,
    venue: match.venue ?? null,
    publication: {
      isPublished: Boolean(match.publication?.isPublished ?? false),
      neededPlayers: Number(match.publication?.neededPlayers ?? 0),
      preferredPositions: match.publication?.preferredPositions ?? [],
      allowAnyPosition: Boolean(match.publication?.allowAnyPosition ?? true),
      city: match.publication?.city ?? null,
      notes: match.publication?.notes ?? null,
      publishedByUserId: match.publication?.isPublished
        ? (match.publication?.publishedByUserId ?? null)
        : null,
      publishedAt: match.publication?.isPublished ? firestore.FieldValue.serverTimestamp() : null,
      closedAt: null,
      closedByUserId: null,
      closeReason: null,
    },
    mvpGroupMemberId: null,
    players1: match.team1Players.map(p => ({
      groupMemberId: p.groupMemberId,
      position: p.position,
      goals: parseInt(p.goals, 10) || 0,
      assists: parseInt(p.assists, 10) || 0,
      ownGoals: parseInt(p.ownGoals, 10) || 0,
      isSub: p.isSub ?? false,
    })),
    players2: match.team2Players.map(p => ({
      groupMemberId: p.groupMemberId,
      position: p.position,
      goals: parseInt(p.goals, 10) || 0,
      assists: parseInt(p.assists, 10) || 0,
      ownGoals: parseInt(p.ownGoals, 10) || 0,
      isSub: p.isSub ?? false,
    })),
    // MVP voting window: open immediately, closes in 24 h
    mvpVoting: {
      status: 'open',
      opensAt,
      closesAt,
      calculatedAt: null,
    },
    // Empty votes map — keys are voterGroupMemberIds, values are votedGroupMemberIds
    mvpVotes: {},
  });

  addPublicListingToBatch(
    batch,
    matchRef.id,
    groupId,
    groupName,
    match.date,
    match.publication,
    createdByUserId,
  );

  // Process Team 1 players
  for (const player of match.team1Players) {
    if (!player.groupMemberId) continue;
    const isGoalkeeper = player.position === 'POR';
    addSeasonStatsToBatch(batch, player.groupMemberId, groupId, season, {
      goals: parseInt(player.goals, 10) || 0,
      assists: parseInt(player.assists, 10) || 0,
      ownGoals: parseInt(player.ownGoals, 10) || 0,
      won: team1Won,
      lost: team2Won,
      draw: isDraw,
      isGoalkeeper,
      ...(isGoalkeeper && {
        goalsConceded: team2Goals,
        cleanSheet: team2Goals === 0 ? 1 : 0,
      }),
    });
  }

  // Process Team 2 players
  for (const player of match.team2Players) {
    if (!player.groupMemberId) continue;
    const isGoalkeeper = player.position === 'POR';
    addSeasonStatsToBatch(batch, player.groupMemberId, groupId, season, {
      goals: parseInt(player.goals, 10) || 0,
      assists: parseInt(player.assists, 10) || 0,
      ownGoals: parseInt(player.ownGoals, 10) || 0,
      won: team2Won,
      lost: team1Won,
      draw: isDraw,
      isGoalkeeper,
      ...(isGoalkeeper && {
        goalsConceded: team1Goals,
        cleanSheet: team1Goals === 0 ? 1 : 0,
      }),
    });
  }

  // Commit match doc + all seasonStats updates in a single atomic operation
  await batch.commit();
}

// ─── Scheduled match ─────────────────────────────────────────────────────────

export type ScheduledPlayerToSave = {
  groupMemberId: string | null;
  /** Position is optional when scheduling — defaults to 'DEF' if not chosen */
  position: 'POR' | 'DEF' | 'MED' | 'DEL' | null;
  isSub?: boolean;
};

export type ScheduledMatchToSave = {
  date: Date;
  groupId: string;
  team1Players: ScheduledPlayerToSave[];
  team2Players: ScheduledPlayerToSave[];
  team1Color?: string;
  team2Color?: string;
  publication?: MatchPublicationInput;
  venue?: MatchVenue | null;
  createdByUserId?: string | null;
  createdByGroupMemberId?: string | null;
};

/**
 * Save a scheduled match to the 'matches' collection.
 *
 * - status: 'scheduled' — el partido aún no se ha jugado.
 * - Los goles/asistencias/ownGoals son 0.
 * - mvpVoting es null — el MVP solo se habilita para partidos 'finished'.
 * - No se actualizan seasonStats.
 * - Los recordatorios (24h, 12h, 6h) los crea el trigger onMatchCreated en Cloud Functions.
 */
export async function saveScheduledMatch(
  match: ScheduledMatchToSave,
): Promise<void> {
  const { groupId } = match;
  const season = match.date.getFullYear();
  const createdByUserId = match.createdByUserId ?? null;
  const createdByGroupMemberId = match.createdByGroupMemberId ?? null;

  const batch = firestore().batch();
  const groupName = await getGroupNameById(groupId);
  const matchRef = firestore().collection(MATCHES_COLLECTION).doc();

  batch.set(matchRef, {
    groupId,
    season,
    createdByUserId,
    createdByGroupMemberId,
    date: firestore.Timestamp.fromDate(match.date),
    createdAt: firestore.FieldValue.serverTimestamp(),
    registeredDate: firestore.FieldValue.serverTimestamp(),
    goalsTeam1: 0,
    goalsTeam2: 0,
    team1Color: match.team1Color ?? null,
    team2Color: match.team2Color ?? null,
    venue: match.venue ?? null,
    publication: {
      isPublished: Boolean(match.publication?.isPublished ?? false),
      neededPlayers: Number(match.publication?.neededPlayers ?? 0),
      preferredPositions: match.publication?.preferredPositions ?? [],
      allowAnyPosition: Boolean(match.publication?.allowAnyPosition ?? true),
      city: match.publication?.city ?? null,
      notes: match.publication?.notes ?? null,
      publishedByUserId: match.publication?.isPublished
        ? (match.publication?.publishedByUserId ?? null)
        : null,
      publishedAt: match.publication?.isPublished ? firestore.FieldValue.serverTimestamp() : null,
      closedAt: null,
      closedByUserId: null,
      closeReason: null,
    },
    mvpGroupMemberId: null,
    status: 'scheduled',
    players1: match.team1Players.map(p => ({
      groupMemberId: p.groupMemberId,
      position: p.position ?? '',
      goals: 0,
      assists: 0,
      ownGoals: 0,
      isSub: p.isSub ?? false,
    })),
    players2: match.team2Players.map(p => ({
      groupMemberId: p.groupMemberId,
      position: p.position ?? '',
      goals: 0,
      assists: 0,
      ownGoals: 0,
      isSub: p.isSub ?? false,
    })),
    mvpVoting: null,
    mvpVotes: {},
  });

  addPublicListingToBatch(
    batch,
    matchRef.id,
    groupId,
    groupName,
    match.date,
    match.publication,
    createdByUserId,
  );

  await batch.commit();
}
