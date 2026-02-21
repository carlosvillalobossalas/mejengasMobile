import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type PlayerStatsAggregate = {
    id: string; // groupMemberId
    goals: number;
    assists: number;
    ownGoals: number;
    matches: number;
    won: number;
    draw: number;
    lost: number;
    mvp: number;
    name?: string;    // displayName from groupMembers_v2
    photoURL?: string;
    userId?: string;
};

type MemberInfo = {
    displayName: string;
    photoUrl: string | null;
    userId: string | null;
};

const SEASON_STATS_COLLECTION = 'seasonStats';
const GROUP_MEMBERS_COLLECTION = 'groupMembers_v2';

/**
 * Pure function that recomputes the full stats result from the two latest
 * snapshots. Called whenever either snapshot changes.
 */
function buildStats(
    membersMap: Map<string, MemberInfo>,
    statsSnapshot: FirebaseFirestoreTypes.QuerySnapshot,
): Record<string, PlayerStatsAggregate[]> {
    const bySeason: Record<string, Record<string, PlayerStatsAggregate>> = {};
    const historicMap: Record<string, PlayerStatsAggregate> = {};

    statsSnapshot.docs.forEach(doc => {
        const d = doc.data() as {
            groupMemberId: string;
            season: number;
            playerStats?: Record<string, number>;
        };

        const { groupMemberId, season, playerStats } = d;

        // Skip goalkeeper-only docs (no playerStats block)
        if (!playerStats || !groupMemberId) return;

        const member = membersMap.get(groupMemberId);
        const seasonKey = String(season);

        const entry: PlayerStatsAggregate = {
            id: groupMemberId,
            matches: playerStats.matches ?? 0,
            goals: playerStats.goals ?? 0,
            assists: playerStats.assists ?? 0,
            ownGoals: playerStats.ownGoals ?? 0,
            won: playerStats.won ?? 0,
            draw: playerStats.draw ?? 0,
            lost: playerStats.lost ?? 0,
            mvp: playerStats.mvps ?? 0,
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
        historicMap[groupMemberId].goals += entry.goals;
        historicMap[groupMemberId].assists += entry.assists;
        historicMap[groupMemberId].ownGoals += entry.ownGoals;
        historicMap[groupMemberId].won += entry.won;
        historicMap[groupMemberId].draw += entry.draw;
        historicMap[groupMemberId].lost += entry.lost;
        historicMap[groupMemberId].mvp += entry.mvp;
    });

    const result: Record<string, PlayerStatsAggregate[]> = {
        historico: Object.values(historicMap),
    };

    Object.keys(bySeason).forEach(seasonKey => {
        result[seasonKey] = Object.values(bySeason[seasonKey]);
    });

    return result;
}

/**
 * Subscribe to real-time player stats for a group.
 *
 * Opens TWO concurrent onSnapshot listeners:
 *   1. groupMembers_v2 - provides displayName, photoUrl, userId per member.
 *   2. seasonStats     - provides playerStats blocks per season.
 *
 * Both listeners share state via closure. Whenever either fires, buildStats()
 * recomputes the full result from the latest data of both collections.
 * This means a rename in groupMembers_v2 instantly updates the table without
 * waiting for a seasonStats change.
 *
 * Returns an unsubscribe function that tears down both listeners.
 */
export function subscribeToPlayerStats(
    groupId: string,
    callback: (stats: Record<string, PlayerStatsAggregate[]>) => void,
): () => void {
    // Shared state between the two listeners
    let membersMap = new Map<string, MemberInfo>();
    let latestStatsSnapshot: FirebaseFirestoreTypes.QuerySnapshot | null = null;

    const recompute = () => {
        // Wait until the first stats snapshot has arrived before publishing
        if (!latestStatsSnapshot) return;
        callback(buildStats(membersMap, latestStatsSnapshot));
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
                console.error('Error in groupMembers_v2 subscription:', error);
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
                console.error('Error in seasonStats subscription:', error);
                callback({ historico: [] });
            },
        );

    return () => {
        unsubscribeMembers();
        unsubscribeStats();
    };
}
