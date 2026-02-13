import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type GoalkeeperSeasonStats = {
  id: string;
  playerId: string;
  userId: string;
  groupId: string;
  season: string;
  cleanSheets: number;
  goalsReceived: number;
  matches: number;
  createdAt: string | null;
  updatedAt: string | null;
};

const GOALKEEPER_SEASON_STATS_COLLECTION = 'GoalkeeperSeasonStats';

const toIsoString = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  const maybeTimestamp = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof maybeTimestamp.toDate === 'function') {
    return maybeTimestamp.toDate().toISOString();
  }

  return null;
};

const mapGoalkeeperSeasonStatsDoc = (
  doc: FirebaseFirestoreTypes.DocumentSnapshot,
): GoalkeeperSeasonStats => {
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  return {
    id: doc.id,
    playerId: String(data.playerId ?? ''),
    userId: String(data.userId ?? ''),
    groupId: String(data.groupId ?? ''),
    season: String(data.season ?? ''),
    cleanSheets: Number(data.cleanSheets ?? 0),
    goalsReceived: Number(data.goalsReceived ?? 0),
    matches: Number(data.matches ?? 0),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
};

/**
 * Get all goalkeeper season stats for a specific group, organized by season
 */
export async function getAllGoalkeeperSeasonStatsByGroup(
  groupId: string,
): Promise<Record<string, GoalkeeperSeasonStats[]>> {
  const statsRef = firestore().collection(GOALKEEPER_SEASON_STATS_COLLECTION);
  const q = statsRef.where('groupId', '==', groupId);
  const snapshot = await q.get();

  const statsBySeason: Record<string, GoalkeeperSeasonStats[]> = {};

  snapshot.docs.forEach(doc => {
    const stat = mapGoalkeeperSeasonStatsDoc(doc);
    const { season } = stat;

    if (!statsBySeason[season]) {
      statsBySeason[season] = [];
    }

    statsBySeason[season].push(stat);
  });

  return statsBySeason;
}
