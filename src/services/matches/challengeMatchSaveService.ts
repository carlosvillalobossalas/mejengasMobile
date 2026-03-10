import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import type { MatchPublicationInput } from '../../types/matchPublication';

const CHALLENGE_MATCHES_COLLECTION = 'matchesByChallenge';
const GROUPS_COLLECTION = 'groups';
const CHALLENGE_SEASON_STATS_COLLECTION = 'challengeSeasonStats';
const PUBLIC_MATCH_LISTINGS_COLLECTION = 'publicMatchListings';

const buildListingId = (matchId: string) => `matchesByChallenge_${matchId}`;

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
      sourceMatchType: 'matchesByChallenge',
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChallengeTeamPlayer = {
  position: 'POR' | 'DEF' | 'MED' | 'DEL';
  groupMemberId: string | null;
  goals: string;
  assists: string;
  ownGoals: string;
  isSub: boolean;
};

export type ChallengeMatchToSave = {
  date: Date;
  groupId: string;
  players: ChallengeTeamPlayer[];
  goalsTeam: number;
  teamColor?: string;
  opponentColor?: string;
  opponentName: string;
  goalsOpponent: number;
  publication?: MatchPublicationInput;
  createdByUserId?: string | null;
  createdByGroupMemberId?: string | null;
};

export type ScheduledChallengePlayerToSave = {
  groupMemberId: string | null;
  position: 'POR' | 'DEF' | 'MED' | 'DEL' | null;
  isSub?: boolean;
};

export type ScheduledChallengeMatchToSave = {
  date: Date;
  groupId: string;
  players: ScheduledChallengePlayerToSave[];
  teamColor?: string;
  opponentColor?: string;
  opponentName: string;
  publication?: MatchPublicationInput;
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
  goalsConceded?: number;
  cleanSheet?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Appends batch operations to upsert a player's challengeSeasonStats.
 * Uses the same doc-id pattern as seasonStats: `${groupId}_${season}_${groupMemberId}`.
 */
function addChallengeSeasonStatsToBatch(
  batch: FirebaseFirestoreTypes.WriteBatch,
  groupMemberId: string,
  groupId: string,
  season: number,
  stats: PlayerStats,
): void {
  const docId = `${groupId}_${season}_${groupMemberId}`;
  const ref = firestore().collection(CHALLENGE_SEASON_STATS_COLLECTION).doc(docId);

  // Ensure the document exists without overwriting existing stats
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a played challenge match and atomically update all affected
 * challengeSeasonStats documents in a single batch.
 *
 * - POR → goalkeeperStats block; DEF/MED/DEL → playerStats block.
 * - goalsConceded = goalsOpponent (opponent goals against the group's keeper).
 * - Opens MVP voting window immediately (closes in 24 h).
 */
export async function saveChallengeMatch(match: ChallengeMatchToSave): Promise<void> {
  const season = match.date.getFullYear();
  const { goalsTeam, goalsOpponent, groupId } = match;
  const createdByUserId = match.createdByUserId ?? null;
  const createdByGroupMemberId = match.createdByGroupMemberId ?? null;

  const teamWon = goalsTeam > goalsOpponent;
  const teamLost = goalsOpponent > goalsTeam;
  const isDraw = goalsTeam === goalsOpponent;

  const batch = firestore().batch();
  const groupName = await getGroupNameById(groupId);

  const matchRef = firestore().collection(CHALLENGE_MATCHES_COLLECTION).doc();
  const opensAt = firestore.Timestamp.fromDate(new Date());
  const closesAt = firestore.Timestamp.fromMillis(opensAt.toMillis() + 24 * 60 * 60 * 1000);

  batch.set(matchRef, {
    groupId,
    season,
    createdByUserId,
    createdByGroupMemberId,
    date: firestore.Timestamp.fromDate(match.date),
    registeredDate: firestore.FieldValue.serverTimestamp(),
    status: 'finished',
    players: match.players
      .filter(p => p.groupMemberId !== null)
      .map(p => ({
        groupMemberId: p.groupMemberId,
        position: p.position,
        goals: parseInt(p.goals, 10) || 0,
        assists: parseInt(p.assists, 10) || 0,
        ownGoals: parseInt(p.ownGoals, 10) || 0,
        isSub: p.isSub,
      })),
    goalsTeam,
    teamColor: match.teamColor ?? null,
    opponentColor: match.opponentColor ?? null,
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
    opponentName: match.opponentName.trim(),
    goalsOpponent,
    mvpGroupMemberId: null,
    mvpVoting: {
      status: 'open',
      opensAt,
      closesAt,
      calculatedAt: null,
    },
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

  // Update challengeSeasonStats for each player
  for (const player of match.players) {
    if (!player.groupMemberId) continue;
    const isGoalkeeper = player.position === 'POR';
    addChallengeSeasonStatsToBatch(batch, player.groupMemberId, groupId, season, {
      goals: parseInt(player.goals, 10) || 0,
      assists: parseInt(player.assists, 10) || 0,
      ownGoals: parseInt(player.ownGoals, 10) || 0,
      won: teamWon,
      lost: teamLost,
      draw: isDraw,
      isGoalkeeper,
      ...(isGoalkeeper && {
        goalsConceded: goalsOpponent,
        cleanSheet: goalsOpponent === 0 ? 1 : 0,
      }),
    });
  }

  await batch.commit();
}

/**
 * Save a scheduled challenge match.
 * Reminders at 24h, 12h and 6h are created server-side by the
 * onChallengeMatchCreated Cloud Function trigger — no client-side reminder
 * docs needed here.
 */
export async function saveScheduledChallengeMatch(
  match: ScheduledChallengeMatchToSave,
): Promise<void> {
  const { groupId } = match;
  const season = match.date.getFullYear();
  const createdByUserId = match.createdByUserId ?? null;
  const createdByGroupMemberId = match.createdByGroupMemberId ?? null;

  const batch = firestore().batch();
  const groupName = await getGroupNameById(groupId);
  const matchRef = firestore().collection(CHALLENGE_MATCHES_COLLECTION).doc();
  const matchDateTs = firestore.Timestamp.fromDate(match.date);

  batch.set(matchRef, {
    groupId,
    season,
    createdByUserId,
    createdByGroupMemberId,
    date: matchDateTs,
    registeredDate: firestore.FieldValue.serverTimestamp(),
    status: 'scheduled',
    players: match.players.map(p => ({
      groupMemberId: p.groupMemberId,
      position: p.position ?? '',
      goals: 0,
      assists: 0,
      ownGoals: 0,
      isSub: p.isSub ?? false,
    })),
    goalsTeam: 0,
    teamColor: match.teamColor ?? null,
    opponentColor: match.opponentColor ?? null,
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
    opponentName: match.opponentName.trim(),
    goalsOpponent: 0,
    mvpGroupMemberId: null,
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
