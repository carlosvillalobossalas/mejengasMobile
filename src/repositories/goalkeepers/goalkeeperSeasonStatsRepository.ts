import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type GoalkeeperSeasonStats = {
  id: string;
  playerId: string;
  userId: string;
  groupId: string;
  season: number;
  cleanSheets: number;
  goalsReceived: number;
  matches: number;
  won: number;
  draw: number;
  lost: number;
  mvp: number;
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
    season: Number(data.season ?? 0),
    cleanSheets: Number(data.cleanSheets ?? 0),
    goalsReceived: Number(data.goalsReceived ?? 0),
    matches: Number(data.matches ?? 0),
    won: Number(data.won ?? 0),
    draw: Number(data.draw ?? 0),
    lost: Number(data.lost ?? 0),
    mvp: Number(data.mvp ?? 0),
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

/**
 * Get all goalkeeper season stats for a specific user
 */
export async function getAllGoalkeeperSeasonStatsByUserId(
  userId: string,
): Promise<GoalkeeperSeasonStats[]> {
  const statsRef = firestore().collection(GOALKEEPER_SEASON_STATS_COLLECTION);
  const q = statsRef.where('userId', '==', userId);
  const snapshot = await q.get();

  return snapshot.docs.map(mapGoalkeeperSeasonStatsDoc);
}

/**
 * Get all goalkeeper season stats by playerId
 */
export async function getAllGoalkeeperSeasonStatsByPlayerId(
  playerId: string,
): Promise<GoalkeeperSeasonStats[]> {
  const statsRef = firestore().collection(GOALKEEPER_SEASON_STATS_COLLECTION);
  const q = statsRef.where('playerId', '==', playerId);
  const snapshot = await q.get();

  return snapshot.docs.map(mapGoalkeeperSeasonStatsDoc);
}
