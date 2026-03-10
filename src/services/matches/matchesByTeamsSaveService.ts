import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import type { MatchPublicationInput } from '../../types/matchPublication';

const MATCHES_BY_TEAMS_COLLECTION = 'matchesByTeams';
const GROUPS_COLLECTION = 'groups';
const SEASON_STATS_COLLECTION = 'seasonStats';
const SEASON_STATS_BY_TEAMS_COLLECTION = 'seasonStatsByTeams';
const PUBLIC_MATCH_LISTINGS_COLLECTION = 'publicMatchListings';

const buildListingId = (matchId: string) => `matchesByTeams_${matchId}`;

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
      sourceMatchType: 'matchesByTeams',
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

// ─── Input types ─────────────────────────────────────────────────────────────

export type MatchTeamPlayerToSave = {
  groupMemberId: string;
  position: 'POR' | 'DEF' | 'MED' | 'DEL';
  goals: number;
  assists: number;
  ownGoals: number;
  isSub: boolean;
};

export type MatchByTeamsToSave = {
  groupId: string;
  date: Date;
  team1Id: string;
  team2Id: string;
  goalsTeam1: number;
  goalsTeam2: number;
  players1: MatchTeamPlayerToSave[];
  players2: MatchTeamPlayerToSave[];
  publication?: MatchPublicationInput;
  createdByUserId?: string | null;
  createdByGroupMemberId?: string | null;
};

// ─── Internal stat shapes ─────────────────────────────────────────────────────

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

// ─── Batch helpers ────────────────────────────────────────────────────────────

/**
 * Adds two batch ops on the seasonStats doc for a single player.
 * Identical to matchSaveService — POR → goalkeeperStats, rest → playerStats.
 * docId: `${groupId}_${season}_${groupMemberId}`
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

  // Guarantee the doc exists without overwriting existing stat blocks.
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
 * Adds two batch ops on the seasonStatsByTeams doc for a single team.
 * docId: `${groupId}_${season}_${teamId}`
 * Points: win = 3, draw = 1, loss = 0.
 */
function addSeasonStatsByTeamsToBatch(
  batch: FirebaseFirestoreTypes.WriteBatch,
  teamId: string,
  groupId: string,
  season: number,
  won: boolean,
  lost: boolean,
  draw: boolean,
  goals: number,
  goalsConceded: number,
): void {
  const docId = `${groupId}_${season}_${teamId}`;
  const ref = firestore().collection(SEASON_STATS_BY_TEAMS_COLLECTION).doc(docId);

  // set({ merge: true }) ensures identity fields exist before the update.
  // createdAt is only written on the first call (merge skips it if already present
  // since we rely on the field not being in subsequent set payloads — see update below).
  batch.set(
    ref,
    { groupId, teamId, season, createdAt: firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );

  batch.update(ref, {
    matches: firestore.FieldValue.increment(1),
    won: firestore.FieldValue.increment(won ? 1 : 0),
    lost: firestore.FieldValue.increment(lost ? 1 : 0),
    draw: firestore.FieldValue.increment(draw ? 1 : 0),
    points: firestore.FieldValue.increment(won ? 3 : draw ? 1 : 0),
    goals: firestore.FieldValue.increment(goals),
    goalsConceded: firestore.FieldValue.increment(goalsConceded),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/* ─ Partidos jugados ──────────────────────────────────────────────────────
 * - seasonStats       (per player, same format as individual matches)
 * - seasonStatsByTeams (per team: won/lost/draw/matches/goals/goalsConceded/points)
 *
 * All writes are committed in a single Firestore batch — fully atomic.
 */
export async function saveMatchByTeams(match: MatchByTeamsToSave): Promise<void> {
  const season = match.date.getFullYear();
  const { groupId, team1Id, team2Id, goalsTeam1, goalsTeam2 } = match;
  const createdByUserId = match.createdByUserId ?? null;
  const createdByGroupMemberId = match.createdByGroupMemberId ?? null;

  const team1Won = goalsTeam1 > goalsTeam2;
  const team2Won = goalsTeam2 > goalsTeam1;
  const isDraw = goalsTeam1 === goalsTeam2;

  const batch = firestore().batch();
  const groupName = await getGroupNameById(groupId);

  // ── Build statsSnapshot ───────────────────────────────────────────────────
  // Captures exactly what was incremented so the match can be reverted later
  // without recalculating anything from scratch.
  const playersSnapshot: Record<string, {
    teamId: string;
    goals: number;
    assists: number;
    ownGoals: number;
    won: boolean;
    lost: boolean;
    draw: boolean;
    isGoalkeeper: boolean;
    goalsConceded: number;
    cleanSheet: number;
  }> = {};

  for (const player of match.players1) {
    const isGoalkeeper = player.position === 'POR';
    playersSnapshot[player.groupMemberId] = {
      teamId: team1Id,
      goals: player.goals,
      assists: player.assists,
      ownGoals: player.ownGoals,
      won: team1Won,
      lost: team2Won,
      draw: isDraw,
      isGoalkeeper,
      goalsConceded: isGoalkeeper ? goalsTeam2 : 0,
      cleanSheet: isGoalkeeper && goalsTeam2 === 0 ? 1 : 0,
    };
  }

  for (const player of match.players2) {
    const isGoalkeeper = player.position === 'POR';
    playersSnapshot[player.groupMemberId] = {
      teamId: team2Id,
      goals: player.goals,
      assists: player.assists,
      ownGoals: player.ownGoals,
      won: team2Won,
      lost: team1Won,
      draw: isDraw,
      isGoalkeeper,
      goalsConceded: isGoalkeeper ? goalsTeam1 : 0,
      cleanSheet: isGoalkeeper && goalsTeam1 === 0 ? 1 : 0,
    };
  }

  const statsSnapshot = {
    season,
    team1: {
      teamId: team1Id,
      won: team1Won,
      lost: team2Won,
      draw: isDraw,
      goals: goalsTeam1,
      goalsConceded: goalsTeam2,
      points: team1Won ? 3 : isDraw ? 1 : 0,
    },
    team2: {
      teamId: team2Id,
      won: team2Won,
      lost: team1Won,
      draw: isDraw,
      goals: goalsTeam2,
      goalsConceded: goalsTeam1,
      points: team2Won ? 3 : isDraw ? 1 : 0,
    },
    players: playersSnapshot,
  };

  // ── matchesByTeams document ───────────────────────────────────────────────
  const matchRef = firestore().collection(MATCHES_BY_TEAMS_COLLECTION).doc();
  const opensAt = firestore.Timestamp.fromDate(new Date());
  const closesAt = firestore.Timestamp.fromMillis(opensAt.toMillis() + 24 * 60 * 60 * 1000);

  batch.set(matchRef, {
    groupId,
    season,
    createdByUserId,
    createdByGroupMemberId,
    team1Id,
    team2Id,
    date: firestore.Timestamp.fromDate(match.date),
    registeredDate: firestore.FieldValue.serverTimestamp(),
    goalsTeam1,
    goalsTeam2,
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
    players1: match.players1,
    players2: match.players2,
    mvpVoting: {
      status: 'open',
      opensAt,
      closesAt,
      calculatedAt: null,
    },
    mvpVotes: {},
    statsSnapshot,
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

  // ── seasonStatsByTeams ────────────────────────────────────────────────────
  addSeasonStatsByTeamsToBatch(
    batch, team1Id, groupId, season,
    team1Won, team2Won, isDraw, goalsTeam1, goalsTeam2,
  );
  addSeasonStatsByTeamsToBatch(
    batch, team2Id, groupId, season,
    team2Won, team1Won, isDraw, goalsTeam2, goalsTeam1,
  );

  // ── seasonStats (per player) ──────────────────────────────────────────────
  for (const player of match.players1) {
    const isGoalkeeper = player.position === 'POR';
    addSeasonStatsToBatch(batch, player.groupMemberId, groupId, season, {
      goals: player.goals,
      assists: player.assists,
      ownGoals: player.ownGoals,
      won: team1Won,
      lost: team2Won,
      draw: isDraw,
      isGoalkeeper,
      ...(isGoalkeeper && {
        goalsConceded: goalsTeam2,
        cleanSheet: goalsTeam2 === 0 ? 1 : 0,
      }),
    });
  }

  for (const player of match.players2) {
    const isGoalkeeper = player.position === 'POR';
    addSeasonStatsToBatch(batch, player.groupMemberId, groupId, season, {
      goals: player.goals,
      assists: player.assists,
      ownGoals: player.ownGoals,
      won: team2Won,
      lost: team1Won,
      draw: isDraw,
      isGoalkeeper,
      ...(isGoalkeeper && {
        goalsConceded: goalsTeam1,
        cleanSheet: goalsTeam1 === 0 ? 1 : 0,
      }),
    });
  }

  await batch.commit();
}

// ─ Partidos programados ─────────────────────────────────────────────────────

export type ScheduledMatchByTeamsToSave = {
  date: Date;
  groupId: string;
  team1Id: string;
  team2Id: string;
  players1: Array<{ groupMemberId: string; position: 'POR' | 'DEF' | 'MED' | 'DEL' | null }>;
  players2: Array<{ groupMemberId: string; position: 'POR' | 'DEF' | 'MED' | 'DEL' | null }>;
  publication?: MatchPublicationInput;
  createdByUserId?: string | null;
  createdByGroupMemberId?: string | null;
};

/**
 * Guarda un partido programado en 'matchesByTeams'.
 * Los recordatorios (24h, 12h, 6h) los crea el trigger onMatchByTeamsCreated en Cloud Functions.
 */
export async function saveScheduledMatchByTeams(
  match: ScheduledMatchByTeamsToSave,
): Promise<void> {
  const { groupId, team1Id, team2Id } = match;
  const season = match.date.getFullYear();
  const createdByUserId = match.createdByUserId ?? null;
  const createdByGroupMemberId = match.createdByGroupMemberId ?? null;

  const batch = firestore().batch();
  const groupName = await getGroupNameById(groupId);
  const matchRef = firestore().collection(MATCHES_BY_TEAMS_COLLECTION).doc();

  batch.set(matchRef, {
    groupId,
    season,
    createdByUserId,
    createdByGroupMemberId,
    team1Id,
    team2Id,
    date: firestore.Timestamp.fromDate(match.date),
    registeredDate: firestore.FieldValue.serverTimestamp(),
    status: 'scheduled',
    goalsTeam1: 0,
    goalsTeam2: 0,
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
    players1: match.players1.map(p => ({
      groupMemberId: p.groupMemberId,
      position: p.position ?? '',
      goals: 0,
      assists: 0,
      ownGoals: 0,
      isSub: false,
    })),
    players2: match.players2.map(p => ({
      groupMemberId: p.groupMemberId,
      position: p.position ?? '',
      goals: 0,
      assists: 0,
      ownGoals: 0,
      isSub: false,
    })),
    mvpVoting: null,
    mvpVotes: {},
    statsSnapshot: null,
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
