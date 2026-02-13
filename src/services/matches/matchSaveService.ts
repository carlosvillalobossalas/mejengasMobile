import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type TeamPlayer = {
  position: 'POR' | 'DEF' | 'MED' | 'DEL';
  playerId: string | null;
  playerName: string;
  goals: string;
  assists: string;
  ownGoals: string;
};

export type MatchToSave = {
  date: Date;
  groupId: string;
  team1Players: TeamPlayer[];
  team2Players: TeamPlayer[];
  team1Goals: number;
  team2Goals: number;
};

type UpdateStats = {
  goals: number;
  assists: number;
  ownGoals: number;
};

const MATCHES_COLLECTION = 'Matches';
const PLAYER_SEASON_STATS_COLLECTION = 'PlayerSeasonStats';
const GOALKEEPER_SEASON_STATS_COLLECTION = 'GoalkeeperSeasonStats';
const PLAYERS_COLLECTION = 'Players';

/**
 * Get batch player info for multiple playerIds
 */
async function getPlayersInfo(playerIds: string[]): Promise<Map<string, string | undefined>> {
  const result = new Map<string, string | undefined>();

  // Batch fetch in groups of 10 (Firestore limit)
  const batchSize = 10;
  for (let i = 0; i < playerIds.length; i += batchSize) {
    const batch = playerIds.slice(i, i + batchSize);
    try {
      const snapshot = await firestore()
        .collection(PLAYERS_COLLECTION)
        .where(firestore.FieldPath.documentId(), 'in', batch)
        .get();

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        result.set(doc.id, data?.userId as string | undefined);
      });
    } catch (error) {
      console.error('Error fetching players batch:', error);
    }
  }

  return result;
}

/**
 * Get existing season stats for a player
 */
async function getPlayerSeasonStats(
  playerId: string,
  groupId: string,
  season: string,
): Promise<FirebaseFirestoreTypes.DocumentData | null> {
  try {
    const docId = `${playerId}_${season}_${groupId}`;
    const doc = await firestore()
      .collection(PLAYER_SEASON_STATS_COLLECTION)
      .doc(docId)
      .get();

    return doc.exists() ? (doc.data() ?? null) : null;
  } catch (error) {
    console.error('Error fetching player season stats:', error);
    return null;
  }
}

/**
 * Get existing goalkeeper season stats
 */
async function getGoalkeeperSeasonStats(
  playerId: string,
  groupId: string,
  season: string,
): Promise<FirebaseFirestoreTypes.DocumentData | null> {
  try {
    const docId = `${playerId}_${season}_${groupId}`;
    const doc = await firestore()
      .collection(GOALKEEPER_SEASON_STATS_COLLECTION)
      .doc(docId)
      .get();

    return doc.exists() ? (doc.data() ?? null) : null;
  } catch (error) {
    console.error('Error fetching goalkeeper season stats:', error);
    return null;
  }
}

/**
 * Save or update goalkeeper stats for a season
 */
async function saveGoalkeeperStats(
  batch: FirebaseFirestoreTypes.WriteBatch,
  playerId: string,
  userId: string | undefined,
  groupId: string,
  season: string,
  goalsReceived: number,
  cleanSheets: number,
  performance: { goals: number; assists: number; ownGoals: number },
  teamWon: boolean,
  teamLost: boolean,
  isDraw: boolean,
): Promise<void> {
  const docId = `${playerId}_${season}_${groupId}`;
  const docRef = firestore().collection(GOALKEEPER_SEASON_STATS_COLLECTION).doc(docId);

  const existing = await getGoalkeeperSeasonStats(playerId, groupId, season);

  if (existing) {
    // Update existing record - aggregate stats
    const updateData = {
      goalsReceived: (existing.goalsReceived ?? 0) + goalsReceived,
      cleanSheets: (existing.cleanSheets ?? 0) + cleanSheets,
      goals: (existing.goals ?? 0) + performance.goals,
      assists: (existing.assists ?? 0) + performance.assists,
      ownGoals: (existing.ownGoals ?? 0) + performance.ownGoals,
      matches: (existing.matches ?? 0) + 1,
      won: (existing.won ?? 0) + (teamWon ? 1 : 0),
      lost: (existing.lost ?? 0) + (teamLost ? 1 : 0),
      draw: (existing.draw ?? 0) + (isDraw ? 1 : 0),
      userId: userId ?? existing.userId,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    batch.update(docRef, updateData);
  } else {
    // Create new record
    const newData = {
      playerId,
      userId: userId ?? undefined,
      groupId,
      season,
      goalsReceived,
      cleanSheets,
      goals: performance.goals,
      assists: performance.assists,
      ownGoals: performance.ownGoals,
      matches: 1,
      won: teamWon ? 1 : 0,
      lost: teamLost ? 1 : 0,
      draw: isDraw ? 1 : 0,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    batch.set(docRef, newData);
  }
}

/**
 * Save or update player stats for a season
 */
async function savePlayerStats(
  batch: FirebaseFirestoreTypes.WriteBatch,
  playerId: string,
  userId: string | undefined,
  groupId: string,
  season: string,
  performance: { goals: number; assists: number; ownGoals: number },
  opponentGoals: number,
  teamWon: boolean,
  teamLost: boolean,
  isDraw: boolean,
): Promise<void> {
  const docId = `${playerId}_${season}_${groupId}`;
  const docRef = firestore().collection(PLAYER_SEASON_STATS_COLLECTION).doc(docId);

  const existing = await getPlayerSeasonStats(playerId, groupId, season);

  if (existing) {
    // Update existing record - aggregate stats
    const updateData = {
      goals: (existing.goals ?? 0) + performance.goals,
      assists: (existing.assists ?? 0) + performance.assists,
      ownGoals: (existing.ownGoals ?? 0) + performance.ownGoals,
      cleanSheets: (existing.cleanSheets ?? 0) + (opponentGoals === 0 ? 1 : 0),
      matches: (existing.matches ?? 0) + 1,
      won: (existing.won ?? 0) + (teamWon ? 1 : 0),
      lost: (existing.lost ?? 0) + (teamLost ? 1 : 0),
      draw: (existing.draw ?? 0) + (isDraw ? 1 : 0),
      userId: userId ?? existing.userId,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    batch.update(docRef, updateData);
  } else {
    // Create new record
    const newData = {
      playerId,
      userId: userId ?? undefined,
      groupId,
      season,
      goals: performance.goals,
      assists: performance.assists,
      ownGoals: performance.ownGoals,
      cleanSheets: opponentGoals === 0 ? 1 : 0,
      matches: 1,
      won: teamWon ? 1 : 0,
      lost: teamLost ? 1 : 0,
      draw: isDraw ? 1 : 0,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    batch.set(docRef, newData);
  }
}

/**
 * Save match and update all related statistics
 */
export async function saveMatch(match: MatchToSave): Promise<void> {
  const season = match.date.getFullYear().toString();
  const batch = firestore().batch();

  // Save match document
  const matchRef = firestore().collection(MATCHES_COLLECTION).doc();
  const matchData = {
    groupId: match.groupId,
    date: match.date.toISOString(),
    goalsTeam1: match.team1Goals,
    goalsTeam2: match.team2Goals,
    players1: match.team1Players.map(p => ({
      id: p.playerId,
      position: p.position,
      goals: parseInt(p.goals, 10) || 0,
      assists: parseInt(p.assists, 10) || 0,
      ownGoals: parseInt(p.ownGoals, 10) || 0,
    })),
    players2: match.team2Players.map(p => ({
      id: p.playerId,
      position: p.position,
      goals: parseInt(p.goals, 10) || 0,
      assists: parseInt(p.assists, 10) || 0,
      ownGoals: parseInt(p.ownGoals, 10) || 0,
    })),
    registeredDate: firestore.FieldValue.serverTimestamp(),
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  batch.set(matchRef, matchData);

  // Determine match result
  const team1Won = match.team1Goals > match.team2Goals;
  const team2Won = match.team2Goals > match.team1Goals;
  const isDraw = match.team1Goals === match.team2Goals;

  // Get all playerIds to fetch their info in batch
  const allPlayerIds = [
    ...match.team1Players.filter(p => p.playerId).map(p => p.playerId!),
    ...match.team2Players.filter(p => p.playerId).map(p => p.playerId!),
  ];
  const uniquePlayerIds = Array.from(new Set(allPlayerIds));
  const playersInfo = await getPlayersInfo(uniquePlayerIds);

  // Process Team 1 players
  for (const player of match.team1Players) {
    if (!player.playerId) continue;

    const userId = playersInfo.get(player.playerId);

    if (player.position === 'POR') {
      // Handle goalkeeper
      await saveGoalkeeperStats(
        batch,
        player.playerId,
        userId,
        match.groupId,
        season,
        match.team2Goals,
        match.team2Goals === 0 ? 1 : 0,
        {
          goals: parseInt(player.goals, 10) || 0,
          assists: parseInt(player.assists, 10) || 0,
          ownGoals: parseInt(player.ownGoals, 10) || 0,
        },
        team1Won,
        team2Won,
        isDraw,
      );
    } else {
      // Handle outfield player
      await savePlayerStats(
        batch,
        player.playerId,
        userId,
        match.groupId,
        season,
        {
          goals: parseInt(player.goals, 10) || 0,
          assists: parseInt(player.assists, 10) || 0,
          ownGoals: parseInt(player.ownGoals, 10) || 0,
        },
        match.team2Goals,
        team1Won,
        team2Won,
        isDraw,
      );
    }
  }

  // Process Team 2 players
  for (const player of match.team2Players) {
    if (!player.playerId) continue;

    const userId = playersInfo.get(player.playerId);

    if (player.position === 'POR') {
      // Handle goalkeeper
      await saveGoalkeeperStats(
        batch,
        player.playerId,
        userId,
        match.groupId,
        season,
        match.team1Goals,
        match.team1Goals === 0 ? 1 : 0,
        {
          goals: parseInt(player.goals, 10) || 0,
          assists: parseInt(player.assists, 10) || 0,
          ownGoals: parseInt(player.ownGoals, 10) || 0,
        },
        team2Won,
        team1Won,
        isDraw,
      );
    } else {
      // Handle outfield player
      await savePlayerStats(
        batch,
        player.playerId,
        userId,
        match.groupId,
        season,
        {
          goals: parseInt(player.goals, 10) || 0,
          assists: parseInt(player.assists, 10) || 0,
          ownGoals: parseInt(player.ownGoals, 10) || 0,
        },
        match.team1Goals,
        team2Won,
        team1Won,
        isDraw,
      );
    }
  }

  // Commit all changes in a single transaction
  await batch.commit();
}
