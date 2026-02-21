import { getUserById, type User } from '../../repositories/users/usersRepository';
import { getAllPlayerSeasonStatsByUserId, getAllPlayerSeasonStatsByPlayerId, type PlayerSeasonStats } from '../../repositories/players/playerSeasonStatsRepository';
import { getAllGoalkeeperSeasonStatsByUserId, getAllGoalkeeperSeasonStatsByPlayerId, type GoalkeeperSeasonStats } from '../../repositories/goalkeepers/goalkeeperSeasonStatsRepository';
import { getGroupsByIds, type Group } from '../../repositories/groups/groupsRepository';

export type PlayerSeasonStatsWithGroup = PlayerSeasonStats & {
  group: Group | null;
};

export type ProfileStats = {
  goals: number;
  assists: number;
  won: number;
  draw: number;
  lost: number;
  mvp: number;
  // Goalkeeper specific stats
  cleanSheets?: number;
  goalsReceived?: number;
};

export type StatItem = {
  stats: PlayerSeasonStats | GoalkeeperSeasonStats;
  group: Group | null;
  type: 'player' | 'goalkeeper';
};

export type ProfileData = {
  user: User | null;
  historicStats: ProfileStats;
  statsByGroup: Array<StatItem>;
};

/**
 * Get all profile data for a user or player
 * @param userId User ID to search by (from users collection)
 * @param playerId Player ID to search by (from Players collection)
 */
export async function getProfileData(userId?: string, playerId?: string): Promise<ProfileData> {
  if (!userId && !playerId) {
    throw new Error('Either userId or playerId must be provided');
  }

  let user: User | null = null;
  let playerSeasonStats: PlayerSeasonStats[] = [];
  let goalkeeperSeasonStats: GoalkeeperSeasonStats[] = [];

  if (userId) {
    // Search by userId
    [user, playerSeasonStats, goalkeeperSeasonStats] = await Promise.all([
      getUserById(userId),
      getAllPlayerSeasonStatsByUserId(userId),
      getAllGoalkeeperSeasonStatsByUserId(userId),
    ]);
  } else if (playerId) {
    // Search by playerId
    [playerSeasonStats, goalkeeperSeasonStats] = await Promise.all([
      getAllPlayerSeasonStatsByPlayerId(playerId),
      getAllGoalkeeperSeasonStatsByPlayerId(playerId),
    ]);
  }

  // Combine both types of stats with their type identifier
  const allStats: Array<StatItem> = [
    ...playerSeasonStats.map((stat: PlayerSeasonStats) => ({
      stats: stat,
      group: null,
      type: 'player' as const,
    })),
    ...goalkeeperSeasonStats.map((stat: GoalkeeperSeasonStats) => ({
      stats: stat,
      group: null,
      type: 'goalkeeper' as const,
    })),
  ];

  // Get unique group IDs from both types of stats
  const groupIds = [
    ...new Set([
      ...playerSeasonStats.map((stat: PlayerSeasonStats) => stat.groupId),
      ...goalkeeperSeasonStats.map((stat: GoalkeeperSeasonStats) => stat.groupId),
    ]),
  ];

  // Get all groups
  const groupsMap = await getGroupsByIds(groupIds);

  // Calculate historic totals
  const historicStats: ProfileStats = {
    goals: 0,
    assists: 0,
    won: 0,
    draw: 0,
    lost: 0,
    mvp: 0,
    cleanSheets: 0,
    goalsReceived: 0,
  };

  // Sum player stats
  playerSeasonStats.forEach((stat: PlayerSeasonStats) => {
    historicStats.goals += stat.goals || 0;
    historicStats.assists += stat.assists || 0;
    historicStats.won += stat.won || 0;
    historicStats.draw += stat.draw || 0;
    historicStats.lost += stat.lost || 0;
    historicStats.mvp += stat.mvp || 0;
  });

  // Sum goalkeeper stats
  goalkeeperSeasonStats.forEach((stat: GoalkeeperSeasonStats) => {
    historicStats.cleanSheets = (historicStats.cleanSheets || 0) + (stat.cleanSheets || 0);
    historicStats.goalsReceived = (historicStats.goalsReceived || 0) + (stat.goalsReceived || 0);
    historicStats.won += stat.won || 0;
    historicStats.draw += stat.draw || 0;
    historicStats.lost += stat.lost || 0;
    historicStats.mvp += stat.mvp || 0;
  });

  // Map stats with their groups
  const statsByGroup = allStats.map(item => ({
    ...item,
    group: groupsMap.get(item.stats.groupId) || null,
  }));

  // Sort by season (newest first) and type
  statsByGroup.sort((a, b) => {
    const seasonDiff = b.stats.season - a.stats.season;
    if (seasonDiff !== 0) return seasonDiff;
    return a.type === 'player' ? -1 : 1; // Players first, then goalkeepers
  });

  return {
    user,
    historicStats,
    statsByGroup,
  };
}
