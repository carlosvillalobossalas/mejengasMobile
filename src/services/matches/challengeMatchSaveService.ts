import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const CHALLENGE_MATCHES_COLLECTION = 'matchesByChallenge';
const CHALLENGE_SEASON_STATS_COLLECTION = 'challengeSeasonStats';

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
  opponentName: string;
  goalsOpponent: number;
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
  opponentName: string;
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

  const teamWon = goalsTeam > goalsOpponent;
  const teamLost = goalsOpponent > goalsTeam;
  const isDraw = goalsTeam === goalsOpponent;

  const batch = firestore().batch();

  const matchRef = firestore().collection(CHALLENGE_MATCHES_COLLECTION).doc();
  const opensAt = firestore.Timestamp.fromDate(new Date());
  const closesAt = firestore.Timestamp.fromMillis(opensAt.toMillis() + 24 * 60 * 60 * 1000);

  batch.set(matchRef, {
    groupId,
    season,
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

  const batch = firestore().batch();
  const matchRef = firestore().collection(CHALLENGE_MATCHES_COLLECTION).doc();
  const matchDateTs = firestore.Timestamp.fromDate(match.date);

  batch.set(matchRef, {
    groupId,
    season,
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
    opponentName: match.opponentName.trim(),
    goalsOpponent: 0,
    mvpGroupMemberId: null,
    mvpVoting: null,
    mvpVotes: {},
  });

  await batch.commit();
}
