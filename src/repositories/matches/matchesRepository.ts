import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type MatchPlayer = {
  groupMemberId: string;
  position: 'POR' | 'DEF' | 'MED' | 'DEL';
  goals: number;
  assists: number;
  ownGoals: number;
};

export type Match = {
  id: string;
  groupId: string;
  season: number;
  date: string;
  goalsTeam1: number;
  goalsTeam2: number;
  players1: MatchPlayer[];
  players2: MatchPlayer[];
  mvpGroupMemberId?: string | null;
  registeredDate: string | null;
};

const MATCHES_COLLECTION = 'matches';

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

const mapPlayerArray = (data: unknown): MatchPlayer[] => {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(player => ({
      groupMemberId: String(player.groupMemberId ?? ''),
      position: (player.position as 'POR' | 'DEF' | 'MED' | 'DEL') ?? 'DEF',
      goals: Number(player.goals ?? 0),
      assists: Number(player.assists ?? 0),
      ownGoals: Number(player.ownGoals ?? 0),
    }));
};

const mapMatchDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): Match => {
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  return {
    id: doc.id,
    groupId: String(data.groupId ?? ''),
    season: Number(data.season ?? 0),
    date: toIsoString(data.date) ?? new Date().toISOString(),
    goalsTeam1: Number(data.goalsTeam1 ?? 0),
    goalsTeam2: Number(data.goalsTeam2 ?? 0),
    players1: mapPlayerArray(data.players1),
    players2: mapPlayerArray(data.players2),
    mvpGroupMemberId: data.mvpGroupMemberId ? String(data.mvpGroupMemberId) : null,
    registeredDate: toIsoString(data.registeredDate),
  };
};

/**
 * Get all matches for a specific group, ordered by date descending
 */
export async function getMatchesByGroupId(
  groupId: string,
): Promise<Match[]> {
  const matchesRef = firestore().collection(MATCHES_COLLECTION);
  const q = matchesRef
    .where('groupId', '==', groupId)
    .orderBy('date', 'desc');

  const snapshot = await q.get();
  return snapshot.docs.map(mapMatchDoc);
}

/**
 * Subscribe to matches for a specific group with real-time updates
 * Returns an unsubscribe function
 */
export function subscribeToMatchesByGroupId(
  groupId: string,
  callback: (matches: Match[]) => void,
): () => void {
  const matchesRef = firestore().collection(MATCHES_COLLECTION);
  const q = matchesRef
    .where('groupId', '==', groupId)
    .orderBy('date', 'desc');

  return q.onSnapshot(
    snapshot => {
      const matches = snapshot.docs.map(mapMatchDoc);
      callback(matches);
    },
    error => {
      console.error('Error in matches subscription:', error);
    },
  );
}

/**
 * Get a single match by ID
 */
export async function getMatchById(matchId: string): Promise<Match | null> {
  const matchRef = firestore()
    .collection(MATCHES_COLLECTION)
    .doc(matchId);

  const doc = await matchRef.get();

  if (!doc.exists) {
    return null;
  }

  return mapMatchDoc(doc);
}
