import { getUserById, type User } from '../../repositories/users/usersRepository';
import { getAllPlayerSeasonStatsByUserId, type PlayerSeasonStats } from '../../repositories/players/playerSeasonStatsRepository';
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
};

export type ProfileData = {
  user: User | null;
  historicStats: ProfileStats;
  statsByGroup: Array<{
    stats: PlayerSeasonStats;
    group: Group | null;
  }>;
};

/**
 * Get all profile data for a user
 */
export async function getProfileData(userId: string): Promise<ProfileData> {
  // Get user and season stats in parallel
  const [user, seasonStats] = await Promise.all([
    getUserById(userId),
    getAllPlayerSeasonStatsByUserId(userId),
  ]);

  // Get unique group IDs
  const groupIds = [...new Set(seasonStats.map(stat => stat.groupId))];

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
  };

  seasonStats.forEach(stat => {
    historicStats.goals += stat.goals || 0;
    historicStats.assists += stat.assists || 0;
    historicStats.won += stat.won || 0;
    historicStats.draw += stat.draw || 0;
    historicStats.lost += stat.lost || 0;
    historicStats.mvp += stat.mvp || 0;
  });

  // Map stats with their groups
  const statsByGroup = seasonStats.map(stat => ({
    stats: stat,
    group: groupsMap.get(stat.groupId) || null,
  }));

  return {
    user,
    historicStats,
    statsByGroup,
  };
}
