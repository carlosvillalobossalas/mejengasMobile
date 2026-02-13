import { getAllGoalkeeperSeasonStatsByGroup, type GoalkeeperSeasonStats } from '../../repositories/goalkeepers/goalkeeperSeasonStatsRepository';
import { getPlayersByIds, type Player } from '../../repositories/players/playerSeasonStatsRepository';

export type GoalkeeperStats = {
    id: string; // playerId
    name: string | null;
    originalName?: string | null;
    photoURL: string | null;
    cleanSheets: number;
    goalsReceived: number;
    matches: number;
    mvp: number;
};

/**
 * Prepare goalkeeper statistics from GoalkeeperSeasonStats collection, grouped by season
 * Returns a record where keys are seasons (including 'historico' for all-time) and values are arrays of stats
 */
export async function prepareGoalkeeperStatsFromMatches(
    groupId: string,
): Promise<Record<string, GoalkeeperStats[]>> {
    // Get all goalkeeper season stats for the group
    const statsBySeason = await getAllGoalkeeperSeasonStatsByGroup(groupId);

    // Collect all playerId from all seasons for batch fetch
    const allPlayerIds = new Set<string>();
    Object.values(statsBySeason).forEach(seasonStats => {
        seasonStats.forEach(stat => {
            allPlayerIds.add(stat.playerId);
        });
    });

    // Fetch all goalkeeper player info in one batch
    const playersMap = await getPlayersByIds(Array.from(allPlayerIds));

    // Convert stats to GoalkeeperStats format with player details
    const result: Record<string, GoalkeeperStats[]> = { historico: [] };

    for (const [season, stats] of Object.entries(statsBySeason)) {
        const statsArray: GoalkeeperStats[] = stats.map(stat => {
            const player = playersMap.get(stat.playerId);

            return {
                id: stat.playerId,
                name: player?.name || null,
                originalName: player?.originalName || null,
                photoURL: player?.photoURL || null,
                cleanSheets: stat.cleanSheets,
                goalsReceived: stat.goalsReceived,
                matches: stat.matches,
                mvp: stat.mvp || 0,
            };
        });

        result[season] = statsArray;

        // Add to historico (all-time stats)
        result.historico.push(...statsArray);
    }

    // Aggregate historico stats by playerId
    const historicoMap = new Map<string, GoalkeeperStats>();
    result.historico.forEach(stat => {
        const existing = historicoMap.get(stat.id);
        if (existing) {
            historicoMap.set(stat.id, {
                ...stat,
                cleanSheets: existing.cleanSheets + stat.cleanSheets,
                goalsReceived: existing.goalsReceived + stat.goalsReceived,
                matches: existing.matches + stat.matches,
            });
        } else {
            historicoMap.set(stat.id, stat);
        }
    });

    result.historico = Array.from(historicoMap.values());

    return result;
}
