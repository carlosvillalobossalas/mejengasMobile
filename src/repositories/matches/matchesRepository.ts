import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type MvpVotingStatus = 'open' | 'calculated';

export type MvpVoting = {
  status: MvpVotingStatus;
  opensAt: FirebaseFirestoreTypes.Timestamp | null;
  closesAt: FirebaseFirestoreTypes.Timestamp | null;
  calculatedAt: FirebaseFirestoreTypes.Timestamp | null;
};

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
  registeredDate: FirebaseFirestoreTypes.Timestamp | null;
  mvpVoting: MvpVoting | null;
  /** Map of { [voterGroupMemberId]: votedGroupMemberId } */
  mvpVotes: Record<string, string>;
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

  const votingRaw = data.mvpVoting as Record<string, unknown> | undefined;
  const toTimestamp = (v: unknown): FirebaseFirestoreTypes.Timestamp | null => {
    if (!v) return null;
    const t = v as Partial<FirebaseFirestoreTypes.Timestamp>;
    return typeof t.toMillis === 'function' ? (t as FirebaseFirestoreTypes.Timestamp) : null;
  };
  const mvpVoting: MvpVoting | null = votingRaw
    ? {
        status: (votingRaw.status as MvpVotingStatus) ?? 'open',
        opensAt: toTimestamp(votingRaw.opensAt),
        closesAt: toTimestamp(votingRaw.closesAt),
        calculatedAt: toTimestamp(votingRaw.calculatedAt),
      }
    : null;

  const mvpVotesRaw = data.mvpVotes;
  const mvpVotes: Record<string, string> =
    mvpVotesRaw && typeof mvpVotesRaw === 'object' && !Array.isArray(mvpVotesRaw)
      ? Object.fromEntries(
          Object.entries(mvpVotesRaw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
      : {};

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
    registeredDate: toTimestamp(data.registeredDate),
    mvpVoting,
    mvpVotes,
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

/**
 * Cast or update a vote for the MVP of a match.
 *
 * Rules enforced client-side (mirrored in Firestore Security Rules):
 * - voterGroupMemberId must appear in players1 or players2.
 * - mvpVoting.status must be "open".
 * - Current time must be before mvpVoting.closesAt.
 *
 * Using the voter's groupMemberId as the map key guarantees idempotency:
 * calling this twice just overwrites the previous vote.
 */
export async function castMvpVote(
  matchId: string,
  voterGroupMemberId: string,
  votedGroupMemberId: string,
): Promise<void> {
  const matchRef = firestore().collection(MATCHES_COLLECTION).doc(matchId);

  const doc = await matchRef.get();
  if (!doc.exists) throw new Error(`Match "${matchId}" no existe`);

  const match = mapMatchDoc(doc);

  // Validate voting window
  if (match.mvpVoting?.status !== 'open') {
    throw new Error('La votación ya está cerrada para este partido');
  }

  const now = Date.now();
  const closesAt = match.mvpVoting.closesAt ? match.mvpVoting.closesAt.toMillis() : 0;
  if (now > closesAt) {
    throw new Error('El período de votación ha expirado');
  }

  // Validate voter is a participant
  const allParticipants = [
    ...match.players1.map(p => p.groupMemberId),
    ...match.players2.map(p => p.groupMemberId),
  ];
  if (!allParticipants.includes(voterGroupMemberId)) {
    throw new Error('Solo los jugadores del partido pueden votar');
  }

  // Validate votee is also a participant
  if (!allParticipants.includes(votedGroupMemberId)) {
    throw new Error('Solo puedes votar por un jugador que participó en el partido');
  }

  await matchRef.update({
    [`mvpVotes.${voterGroupMemberId}`]: votedGroupMemberId,
  });
}
