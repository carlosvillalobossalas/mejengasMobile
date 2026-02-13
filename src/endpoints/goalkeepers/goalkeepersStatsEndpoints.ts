import { getMatchesByGroupId, type Match, type MatchPlayer } from '../../repositories/matches/matchesRepository';
import { getPlayersByIds, type Player } from '../../repositories/players/playerSeasonStatsRepository';

export type GoalkeeperStats = {
  id: string; // playerId
  name: string | null;
  originalName?: string | null;
  photoURL: string | null;
  goalsConceded: number;
  cleanSheets: number;
  matches: number;
};

/**
 * Prepare goalkeeper statistics from matches, grouped by year
 * Returns a record where keys are years (or 'historico') and values are arrays of stats
 */
export async function prepareGoalkeeperStatsFromMatches(
  groupId: string,
): Promise<Record<string, GoalkeeperStats[]>> {
  // Get all matches for the group
  const matches = await getMatchesByGroupId(groupId);

  // Group matches by year
  const matchesByYear: Record<string, Match[]> = {
    historico: matches,
  };

  matches.forEach(match => {
    const year = new Date(match.date).getFullYear().toString();
    if (!matchesByYear[year]) {
      matchesByYear[year] = [];
    }
    matchesByYear[year].push(match);
  });

  // Process stats for each year
  const statsByYear: Record<string, GoalkeeperStats[]> = {};

  for (const [year, yearMatches] of Object.entries(matchesByYear)) {
    const goalkeeperMap = new Map<string, {
      goalsConceded: number;
      cleanSheets: number;
      matches: number;
    }>();

    // Collect all goalkeeper IDs for this year
    const goalkeeperIds = new Set<string>();

    // Process each match
    for (const match of yearMatches) {
      // Process team 1 goalkeepers
      const team1Goalkeepers = match.players1.filter(p => p.position === 'POR');
      team1Goalkeepers.forEach(gk => {
        goalkeeperIds.add(gk.id);
        const current = goalkeeperMap.get(gk.id) || {
          goalsConceded: 0,
          cleanSheets: 0,
          matches: 0,
        };

        goalkeeperMap.set(gk.id, {
          goalsConceded: current.goalsConceded + match.goalsTeam2,
          cleanSheets: current.cleanSheets + (match.goalsTeam2 === 0 ? 1 : 0),
          matches: current.matches + 1,
        });
      });

      // Process team 2 goalkeepers
      const team2Goalkeepers = match.players2.filter(p => p.position === 'POR');
      team2Goalkeepers.forEach(gk => {
        goalkeeperIds.add(gk.id);
        const current = goalkeeperMap.get(gk.id) || {
          goalsConceded: 0,
          cleanSheets: 0,
          matches: 0,
        };

        goalkeeperMap.set(gk.id, {
          goalsConceded: current.goalsConceded + match.goalsTeam1,
          cleanSheets: current.cleanSheets + (match.goalsTeam1 === 0 ? 1 : 0),
          matches: current.matches + 1,
        });
      });
    }

    // Fetch all goalkeeper player info in one batch
    const playersMap = await getPlayersByIds(Array.from(goalkeeperIds));

    // Convert map to array with player details
    const statsArray: GoalkeeperStats[] = [];
    
    for (const [playerId, stats] of goalkeeperMap.entries()) {
      const player = playersMap.get(playerId);
      
      statsArray.push({
        id: playerId,
        name: player?.name || null,
        originalName: player?.originalName || null,
        photoURL: player?.photoURL || null,
        goalsConceded: stats.goalsConceded,
        cleanSheets: stats.cleanSheets,
        matches: stats.matches,
      });
    }

    statsByYear[year] = statsArray;
  }

  return statsByYear;
}
