import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const COLLECTION = 'matchesByChallenge';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChallengeMatchPlayer = {
  groupMemberId: string | null;
  position: 'POR' | 'DEF' | 'MED' | 'DEL';
  goals: number;
  assists: number;
  ownGoals: number;
  isSub: boolean;
};

export type ChallengeMatchMvpVoting = {
  status: 'open' | 'closed' | 'calculated';
  opensAt: FirebaseFirestoreTypes.Timestamp | null;
  closesAt: FirebaseFirestoreTypes.Timestamp | null;
  calculatedAt: FirebaseFirestoreTypes.Timestamp | null;
};

export type ChallengeMatch = {
  id: string;
  groupId: string;
  createdByUserId?: string | null;
  createdByGroupMemberId?: string | null;
  season: number;
  /** ISO date string */
  date: string;
  status: 'scheduled' | 'finished' | 'cancelled';

  // Group's team
  players: ChallengeMatchPlayer[];
  goalsTeam: number;
  teamColor?: string | null;
  opponentColor?: string | null;

  // Opponent — no lineup, just a name and goals
  opponentName: string;
  goalsOpponent: number;

  // MVP
  mvpGroupMemberId: string | null;
  /** Map of { [voterGroupMemberId]: votedGroupMemberId } */
  mvpVotes: Record<string, string>;
  mvpVoting: ChallengeMatchMvpVoting | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toIsoString = (value: unknown): string => {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return new Date().toISOString();
};

const toTimestamp = (v: unknown): FirebaseFirestoreTypes.Timestamp | null => {
  if (!v) return null;
  const t = v as Partial<FirebaseFirestoreTypes.Timestamp>;
  return typeof t.toMillis === 'function' ? (t as FirebaseFirestoreTypes.Timestamp) : null;
};

const mapPlayerArray = (data: unknown): ChallengeMatchPlayer[] => {
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(p => ({
      groupMemberId: p.groupMemberId != null ? String(p.groupMemberId) : null,
      position: (p.position as ChallengeMatchPlayer['position']) ?? 'DEF',
      goals: Number(p.goals ?? 0),
      assists: Number(p.assists ?? 0),
      ownGoals: Number(p.ownGoals ?? 0),
      isSub: Boolean(p.isSub ?? false),
    }));
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): ChallengeMatch => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  const votingRaw = d.mvpVoting as Record<string, unknown> | undefined;

  const mvpVoting: ChallengeMatchMvpVoting | null = votingRaw
    ? {
        status: (votingRaw.status as ChallengeMatchMvpVoting['status']) ?? 'open',
        opensAt: toTimestamp(votingRaw.opensAt),
        closesAt: toTimestamp(votingRaw.closesAt),
        calculatedAt: toTimestamp(votingRaw.calculatedAt),
      }
    : null;

  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    createdByUserId: d.createdByUserId ? String(d.createdByUserId) : null,
    createdByGroupMemberId: d.createdByGroupMemberId ? String(d.createdByGroupMemberId) : null,
    season: Number(d.season ?? new Date().getFullYear()),
    date: toIsoString(d.date),
    status: (d.status as ChallengeMatch['status']) ?? 'finished',
    players: mapPlayerArray(d.players),
    goalsTeam: Number(d.goalsTeam ?? 0),
    teamColor: d.teamColor ? String(d.teamColor) : null,
    opponentColor: d.opponentColor ? String(d.opponentColor) : null,
    opponentName: String(d.opponentName ?? ''),
    goalsOpponent: Number(d.goalsOpponent ?? 0),
    mvpGroupMemberId: d.mvpGroupMemberId ? String(d.mvpGroupMemberId) : null,
    mvpVotes: (d.mvpVotes as Record<string, string>) ?? {},
    mvpVoting,
  };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Subscribe to all challenge matches for a group, ordered by date descending.
 * Returns an unsubscribe function.
 */
export function subscribeToMatchesByChallengeByGroupId(
  groupId: string,
  onNext: (matches: ChallengeMatch[]) => void,
  onError?: (error: Error) => void,
): () => void {
    console.log(groupId)
  return firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .orderBy('date', 'desc')
    .onSnapshot(
      snap => onNext(snap.docs.map(mapDoc)),
      err => onError?.(err),
    );
}

/**
 * Get a single challenge match by ID.
 */
export async function getChallengeMatchById(
  matchId: string,
): Promise<ChallengeMatch | null> {
  const doc = await firestore().collection(COLLECTION).doc(matchId).get();
  if (!doc.exists) return null;
  return mapDoc(doc);
}

/**
 * Cast or update an MVP vote for a challenge match.
 * Using the voter's groupMemberId as the key guarantees idempotency.
 */
export async function castMvpVoteByChallengeMatch(
  matchId: string,
  voterGroupMemberId: string,
  votedGroupMemberId: string,
): Promise<void> {
  if (voterGroupMemberId === votedGroupMemberId) {
    throw new Error('No puedes votar por ti mismo');
  }

  const matchRef = firestore().collection(COLLECTION).doc(matchId);
  const doc = await matchRef.get();
  if (!doc.exists) throw new Error(`Partido "${matchId}" no existe`);

  const match = mapDoc(doc);

  if (match.mvpVoting?.status !== 'open') {
    throw new Error('La votación ya está cerrada para este partido');
  }

  const closesAt = match.mvpVoting.closesAt ? match.mvpVoting.closesAt.toMillis() : 0;
  if (Date.now() > closesAt) {
    throw new Error('El período de votación ha expirado');
  }

  // Only players from the group's team can vote and be voted for
  const participants = match.players.map(p => p.groupMemberId);

  if (!participants.includes(voterGroupMemberId)) {
    throw new Error('Solo los jugadores del partido pueden votar');
  }

  if (!participants.includes(votedGroupMemberId)) {
    throw new Error('Solo puedes votar por un jugador que participó en el partido');
  }

  await matchRef.update({
    [`mvpVotes.${voterGroupMemberId}`]: votedGroupMemberId,
  });
}
