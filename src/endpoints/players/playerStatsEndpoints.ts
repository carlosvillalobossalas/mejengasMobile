import {
    getAllPlayerSeasonStatsByGroup,
    getAllPlayersByGroup,
} from '../../repositories/players/playerSeasonStatsRepository';

type PlayerStatsAggregate = {
    id: string;
    goals: number;
    assists: number;
    matches: number;
    won: number;
    draw: number;
    lost: number;
    name?: string;
    photoURL?: string;
    originalName?: string;
    userId?: string;
};


/**
 * Combine stats from PlayerSeasonStats with player info
 * Returns stats grouped by season plus a historic aggregate
 */
export async function preparePlayerStatsFromSeasonStats(
    groupId: string,
): Promise<Record<string, PlayerStatsAggregate[]>> {
    try {
        // Get stats and players in parallel
        const [statsBySeason, players] = await Promise.all([
            getAllPlayerSeasonStatsByGroup(groupId),
            getAllPlayersByGroup(groupId),
        ]);

        // Convert players array to Map for fast lookup
        const playersMap = new Map(players.map(p => [p.id, p]));

        const stats: Record<string, PlayerStatsAggregate[]> = {
            historico: [],
        };

        // Calculate historic totals for each player
        const historicTotals: Record<string, PlayerStatsAggregate> = {};

        Object.keys(statsBySeason).forEach(season => {
            statsBySeason[season].forEach(stat => {
                if (!historicTotals[stat.playerId]) {
                    historicTotals[stat.playerId] = {
                        id: stat.playerId,
                        goals: 0,
                        assists: 0,
                        matches: 0,
                        won: 0,
                        draw: 0,
                        lost: 0,
                    };
                }

                historicTotals[stat.playerId].goals += stat.goals || 0;
                historicTotals[stat.playerId].assists += stat.assists || 0;
                historicTotals[stat.playerId].matches += stat.matches || 0;
                historicTotals[stat.playerId].won += stat.won || 0;
                historicTotals[stat.playerId].draw += stat.draw || 0;
                historicTotals[stat.playerId].lost += stat.lost || 0;
            });
        });

        // Convert historic to array and combine with player data
        stats.historico = Object.values(historicTotals).map(stat => {
            const fullPlayer = playersMap.get(stat.id);
            return {
                ...stat,
                name: fullPlayer?.name,
                photoURL: fullPlayer?.photoURL,
                originalName: fullPlayer?.originalName,
                userId: fullPlayer?.userId,
            };
        });

        // For each season, combine with player data
        Object.keys(statsBySeason).forEach(season => {
            stats[season] = statsBySeason[season].map(stat => {
                const fullPlayer = playersMap.get(stat.playerId);
                return {
                    id: stat.playerId,
                    goals: stat.goals || 0,
                    assists: stat.assists || 0,
                    matches: stat.matches || 0,
                    won: stat.won || 0,
                    draw: stat.draw || 0,
                    lost: stat.lost || 0,
                    name: fullPlayer?.name,
                    photoURL: fullPlayer?.photoURL,
                    originalName: fullPlayer?.originalName,
                    userId: fullPlayer?.userId,
                };
            });
        });

        return stats;
    } catch (error) {
        console.error('Error preparing player stats:', error);
        return { historico: [] };
    }
}
