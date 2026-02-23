import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const COLLECTION = 'matchesByTeams';

export type MatchByTeamsPlayer = {
  groupMemberId: string;
  position: 'POR' | 'DEF' | 'MED' | 'DEL';
  goals: number;
  assists: number;
  ownGoals: number;
  isSub: boolean;
};

export type MatchByTeamsMvpVoting = {
  status: 'open' | 'closed' | 'calculated';
  opensAt: FirebaseFirestoreTypes.Timestamp | null;
  closesAt: FirebaseFirestoreTypes.Timestamp | null;
  calculatedAt: FirebaseFirestoreTypes.Timestamp | null;
};

export type MatchByTeams = {
  id: string;
  groupId: string;
  season: number;
  /** ISO date string */
  date: string;
  team1Id: string;
  team2Id: string;
  goalsTeam1: number;
  goalsTeam2: number;
  players1: MatchByTeamsPlayer[];
  players2: MatchByTeamsPlayer[];
  mvpGroupMemberId: string | null;
  /** Map of { [voterGroupMemberId]: votedGroupMemberId } */
  mvpVotes: Record<string, string>;
  mvpVoting: MatchByTeamsMvpVoting | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const mapPlayerArray = (data: unknown): MatchByTeamsPlayer[] => {
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(p => ({
      groupMemberId: String(p.groupMemberId ?? ''),
      position: (p.position as MatchByTeamsPlayer['position']) ?? 'DEF',
      goals: Number(p.goals ?? 0),
      assists: Number(p.assists ?? 0),
      ownGoals: Number(p.ownGoals ?? 0),
      isSub: Boolean(p.isSub ?? false),
    }));
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): MatchByTeams => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  const votingRaw = d.mvpVoting as Record<string, unknown> | undefined;

  const mvpVoting: MatchByTeamsMvpVoting | null = votingRaw
    ? {
        status: (votingRaw.status as MatchByTeamsMvpVoting['status']) ?? 'open',
        opensAt: toTimestamp(votingRaw.opensAt),
        closesAt: toTimestamp(votingRaw.closesAt),
        calculatedAt: toTimestamp(votingRaw.calculatedAt),
      }
    : null;

  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    season: Number(d.season ?? new Date().getFullYear()),
    date: toIsoString(d.date),
    team1Id: String(d.team1Id ?? ''),
    team2Id: String(d.team2Id ?? ''),
    goalsTeam1: Number(d.goalsTeam1 ?? 0),
    goalsTeam2: Number(d.goalsTeam2 ?? 0),
    players1: mapPlayerArray(d.players1),
    players2: mapPlayerArray(d.players2),
    mvpGroupMemberId: d.mvpGroupMemberId ? String(d.mvpGroupMemberId) : null,
    mvpVotes: (d.mvpVotes as Record<string, string>) ?? {},
    mvpVoting,
  };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Subscribe to all team-based matches for a group, ordered by date descending.
 * Returns an unsubscribe function.
 */
export function subscribeToMatchesByTeamsByGroupId(
  groupId: string,
  onNext: (matches: MatchByTeams[]) => void,
  onError?: (error: Error) => void,
): () => void {
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
 * Cast or update an MVP vote for a team-based match.
 * Using the voter's groupMemberId as the key guarantees idempotency.
 */
export async function castMvpVoteByTeams(
  matchId: string,
  voterGroupMemberId: string,
  votedGroupMemberId: string,
): Promise<void> {
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

  const allParticipants = [
    ...match.players1.map(p => p.groupMemberId),
    ...match.players2.map(p => p.groupMemberId),
  ];

  if (!allParticipants.includes(voterGroupMemberId)) {
    throw new Error('Solo los jugadores del partido pueden votar');
  }
  if (!allParticipants.includes(votedGroupMemberId)) {
    throw new Error('Solo puedes votar por un jugador que participó en el partido');
  }

  await matchRef.update({
    [`mvpVotes.${voterGroupMemberId}`]: votedGroupMemberId,
  });
}
