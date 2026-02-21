import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type GoalkeeperStats = {
    id: string; // groupMemberId
    name?: string;   // displayName from groupMembers_v2
    photoURL?: string;
    userId?: string;
    cleanSheets: number;
    goalsReceived: number;
    matches: number;
    goals: number;
    assists: number;
    ownGoals: number;
    won: number;
    draw: number;
    lost: number;
    mvp: number;
};

type MemberInfo = {
    displayName: string;
    photoUrl: string | null;
    userId: string | null;
};

const SEASON_STATS_COLLECTION = 'seasonStats';
const GROUP_MEMBERS_COLLECTION = 'groupMembers_v2';

/**
 * Pure function that recomputes goalkeeper stats from both snapshots.
 * Uses only the goalkeeperStats block per seasonStats document.
 * Docs without a goalkeeperStats block (field players) are skipped.
 */
function buildGoalkeeperStats(
    membersMap: Map<string, MemberInfo>,
    statsSnapshot: FirebaseFirestoreTypes.QuerySnapshot,
): Record<string, GoalkeeperStats[]> {
    const bySeason: Record<string, Record<string, GoalkeeperStats>> = {};
    const historicMap: Record<string, GoalkeeperStats> = {};

    statsSnapshot.docs.forEach(doc => {
        const d = doc.data() as {
            groupMemberId: string;
            season: number;
            goalkeeperStats?: Record<string, number>;
        };

        const { groupMemberId, season, goalkeeperStats } = d;

        // Skip field-player-only docs (no goalkeeperStats block)
        if (!goalkeeperStats || !groupMemberId) return;

        // Skip goalkeepers with no matches in this season
        if ((goalkeeperStats.matches ?? 0) === 0) return;

        const member = membersMap.get(groupMemberId);
        const seasonKey = String(season);

        const entry: GoalkeeperStats = {
            id: groupMemberId,
            matches: goalkeeperStats.matches ?? 0,
            cleanSheets: goalkeeperStats.cleanSheets ?? 0,
            goalsReceived: goalkeeperStats.goalsConceded ?? 0,
            goals: goalkeeperStats.goals ?? 0,
            assists: goalkeeperStats.assists ?? 0,
            ownGoals: goalkeeperStats.ownGoals ?? 0,
            won: goalkeeperStats.won ?? 0,
            draw: goalkeeperStats.draw ?? 0,
            lost: goalkeeperStats.lost ?? 0,
            mvp: goalkeeperStats.mvps ?? 0,
            name: member?.displayName,
            photoURL: member?.photoUrl ?? undefined,
            userId: member?.userId ?? undefined,
        };

        // Accumulate per season
        if (!bySeason[seasonKey]) {
            bySeason[seasonKey] = {};
        }
        bySeason[seasonKey][groupMemberId] = entry;

        // Accumulate historic totals across all seasons
        if (!historicMap[groupMemberId]) {
            historicMap[groupMemberId] = {
                id: groupMemberId,
                matches: 0,
                cleanSheets: 0,
                goalsReceived: 0,
                goals: 0,
                assists: 0,
                ownGoals: 0,
                won: 0,
                draw: 0,
                lost: 0,
                mvp: 0,
                name: member?.displayName,
                photoURL: member?.photoUrl ?? undefined,
                userId: member?.userId ?? undefined,
            };
        }

        historicMap[groupMemberId].matches += entry.matches;
        historicMap[groupMemberId].cleanSheets += entry.cleanSheets;
        historicMap[groupMemberId].goalsReceived += entry.goalsReceived;
        historicMap[groupMemberId].goals += entry.goals;
        historicMap[groupMemberId].assists += entry.assists;
        historicMap[groupMemberId].ownGoals += entry.ownGoals;
        historicMap[groupMemberId].won += entry.won;
        historicMap[groupMemberId].draw += entry.draw;
        historicMap[groupMemberId].lost += entry.lost;
        historicMap[groupMemberId].mvp += entry.mvp;
    });

    const result: Record<string, GoalkeeperStats[]> = {
        historico: Object.values(historicMap),
    };

    Object.keys(bySeason).forEach(seasonKey => {
        result[seasonKey] = Object.values(bySeason[seasonKey]);
    });

    return result;
}

/**
 * Subscribe to real-time goalkeeper stats for a group.
 *
 * Opens TWO concurrent onSnapshot listeners:
 *   1. groupMembers_v2 - provides displayName, photoUrl, userId per member.
 *   2. seasonStats     - provides goalkeeperStats blocks per season.
 *
 * Whenever either listener fires, buildGoalkeeperStats() recomputes the
 * full result from the latest data of both collections, so a rename in
 * groupMembers_v2 instantly updates the table.
 *
 * Returns an unsubscribe function that tears down both listeners.
 */
export function subscribeToGoalkeeperStats(
    groupId: string,
    callback: (stats: Record<string, GoalkeeperStats[]>) => void,
): () => void {
    let membersMap = new Map<string, MemberInfo>();
    let latestStatsSnapshot: FirebaseFirestoreTypes.QuerySnapshot | null = null;

    const recompute = () => {
        // Wait until the first stats snapshot has arrived before publishing
        if (!latestStatsSnapshot) return;
        callback(buildGoalkeeperStats(membersMap, latestStatsSnapshot));
    };

    // Listener 1: groupMembers_v2 - react to renames, photo changes, etc.
    const unsubscribeMembers = firestore()
        .collection(GROUP_MEMBERS_COLLECTION)
        .where('groupId', '==', groupId)
        .onSnapshot(
            snapshot => {
                membersMap = new Map(
                    snapshot.docs.map(doc => {
                        const d = doc.data();
                        return [
                            doc.id,
                            {
                                displayName: String(d.displayName ?? ''),
                                photoUrl: d.photoUrl ? String(d.photoUrl) : null,
                                userId: d.userId ? String(d.userId) : null,
                            },
                        ];
                    }),
                );
                recompute();
            },
            error => {
                console.error('Error in groupMembers_v2 subscription (goalkeepers):', error);
            },
        );

    // Listener 2: seasonStats - react to new matches being saved
    const unsubscribeStats = firestore()
        .collection(SEASON_STATS_COLLECTION)
        .where('groupId', '==', groupId)
        .onSnapshot(
            snapshot => {
                latestStatsSnapshot = snapshot;
                recompute();
            },
            error => {
                console.error('Error in seasonStats subscription (goalkeepers):', error);
                callback({ historico: [] });
            },
        );

    return () => {
        unsubscribeMembers();
        unsubscribeStats();
    };
}
