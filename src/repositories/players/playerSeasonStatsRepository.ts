import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type PlayerSeasonStats = {
  id: string;
  playerId: string;
  userId: string;
  groupId: string;
  season: string;
  goals: number;
  assists: number;
  matches: number;
  won: number;
  draw: number;
  lost: number;
  mvp: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Player = {
  id: string;
  name: string;
  originalName?: string;
  userId?: string;
  photoURL?: string;
};

export type PlayerStatsWithInfo = PlayerSeasonStats & Player;

const PLAYER_SEASON_STATS_COLLECTION = 'PlayerSeasonStats';
const PLAYERS_COLLECTION = 'Players';

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

const mapPlayerSeasonStatsDoc = (
  doc: FirebaseFirestoreTypes.DocumentSnapshot,
): PlayerSeasonStats => {
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  return {
    id: doc.id,
    playerId: String(data.playerId ?? ''),
    userId: String(data.userId ?? ''),
    groupId: String(data.groupId ?? ''),
    season: String(data.season ?? ''),
    goals: Number(data.goals ?? 0),
    assists: Number(data.assists ?? 0),
    matches: Number(data.matches ?? 0),
    won: Number(data.won ?? 0),
    draw: Number(data.draw ?? 0),
    lost: Number(data.lost ?? 0),
    mvp: Number(data.mvp ?? 0),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
};

const mapPlayerDoc = (
  doc: FirebaseFirestoreTypes.DocumentSnapshot,
): Player => {
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  return {
    id: doc.id,
    name: String(data.name ?? ''),
    originalName: data.originalName ? String(data.originalName) : undefined,
    userId: data.userId ? String(data.userId) : undefined,
    photoURL: data.photoURL ? String(data.photoURL) : undefined,
  };
};

/**
 * Get all player season stats for a specific group, organized by season
 */
export async function getAllPlayerSeasonStatsByGroup(
  groupId: string,
): Promise<Record<string, PlayerSeasonStats[]>> {
  const statsRef = firestore().collection(PLAYER_SEASON_STATS_COLLECTION);
  const q = statsRef.where('groupId', '==', groupId);
  const snapshot = await q.get();

  const statsBySeason: Record<string, PlayerSeasonStats[]> = {};

  snapshot.docs.forEach(doc => {
    const stat = mapPlayerSeasonStatsDoc(doc);
    const { season } = stat;

    if (!statsBySeason[season]) {
      statsBySeason[season] = [];
    }

    statsBySeason[season].push(stat);
  });

  return statsBySeason;
}

/**
 * Get all player season stats for a specific user
 */
export async function getAllPlayerSeasonStatsByUserId(
  userId: string,
): Promise<PlayerSeasonStats[]> {
  const statsRef = firestore().collection(PLAYER_SEASON_STATS_COLLECTION);
  const q = statsRef.where('userId', '==', userId);
  const snapshot = await q.get();

  return snapshot.docs.map(mapPlayerSeasonStatsDoc);
}

/**
 * Get all players from the players collection
 */
export async function getAllPlayers(): Promise<Player[]> {
  const playersRef = firestore().collection(PLAYERS_COLLECTION);
  const snapshot = await playersRef.get();

  return snapshot.docs.map(mapPlayerDoc);
}

/**
 * Get all players for a specific group
 */
export async function getAllPlayersByGroup(
  groupId: string,
): Promise<Player[]> {
  const playersRef = firestore().collection(PLAYERS_COLLECTION);
  const q = playersRef.where('groupId', '==', groupId);
  const snapshot = await q.get();

  return snapshot.docs.map(mapPlayerDoc);
}

/**
 * Get a specific player by ID
 */
export async function getPlayerById(playerId: string): Promise<Player | null> {
  const playerRef = firestore()
    .collection(PLAYERS_COLLECTION)
    .doc(playerId);
  const doc = await playerRef.get();

  if (!doc.exists) {
    return null;
  }

  return mapPlayerDoc(doc);
}

/**
 * Get multiple players by IDs
 */
export async function getPlayersByIds(
  playerIds: string[],
): Promise<Map<string, Player>> {
  if (playerIds.length === 0) {
    return new Map();
  }

  // Firestore has a limit of 10 items per 'in' query, so we batch
  const batchSize = 10;
  const batches: string[][] = [];

  for (let i = 0; i < playerIds.length; i += batchSize) {
    batches.push(playerIds.slice(i, i + batchSize));
  }

  const playersMap = new Map<string, Player>();

  await Promise.all(
    batches.map(async batch => {
      const playersRef = firestore().collection(PLAYERS_COLLECTION);
      const q = playersRef.where(firestore.FieldPath.documentId(), 'in', batch);
      const snapshot = await q.get();

      snapshot.docs.forEach(doc => {
        const player = mapPlayerDoc(doc);
        playersMap.set(player.id, player);
      });
    }),
  );

  return playersMap;
}

/**
 * Update player name for all players associated with a userId
 */
export async function updatePlayerNameByUserId(
  userId: string,
  newName: string,
): Promise<void> {
  console.log(userId)
  const playersRef = firestore().collection(PLAYERS_COLLECTION);
  const q = playersRef.where('userId', '==', userId);
  const snapshot = await q.get();
  console.log(snapshot)

  const batch = firestore().batch();

  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      name: newName,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}
