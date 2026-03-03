import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const COLLECTION = 'challengeSeasonStats';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChallengePlayerStats = {
  matches: number;
  goals: number;
  assists: number;
  ownGoals: number;
  won: number;
  draw: number;
  lost: number;
  mvp: number;
};

export type ChallengeGoalkeeperStats = {
  matches: number;
  goalsConceded: number;
  cleanSheets: number;
  goals: number;
  assists: number;
  ownGoals: number;
  won: number;
  draw: number;
  lost: number;
  mvp: number;
};

export type ChallengeSeasonStats = {
  /** Document ID: `${groupId}_${season}_${groupMemberId}` */
  id: string;
  groupId: string;
  season: number;
  groupMemberId: string;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
  playerStats: ChallengePlayerStats | null;
  goalkeeperStats: ChallengeGoalkeeperStats | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toTimestamp = (v: unknown): FirebaseFirestoreTypes.Timestamp | null => {
  if (!v) return null;
  const t = v as Partial<FirebaseFirestoreTypes.Timestamp>;
  return typeof t.toMillis === 'function' ? (t as FirebaseFirestoreTypes.Timestamp) : null;
};

const mapPlayerStats = (raw: unknown): ChallengePlayerStats | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  return {
    matches: Number(d.matches ?? 0),
    goals: Number(d.goals ?? 0),
    assists: Number(d.assists ?? 0),
    ownGoals: Number(d.ownGoals ?? 0),
    won: Number(d.won ?? 0),
    draw: Number(d.draw ?? 0),
    lost: Number(d.lost ?? 0),
    mvp: Number(d.mvp ?? 0),
  };
};

const mapGoalkeeperStats = (raw: unknown): ChallengeGoalkeeperStats | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  return {
    matches: Number(d.matches ?? 0),
    goalsConceded: Number(d.goalsConceded ?? 0),
    cleanSheets: Number(d.cleanSheets ?? 0),
    goals: Number(d.goals ?? 0),
    assists: Number(d.assists ?? 0),
    ownGoals: Number(d.ownGoals ?? 0),
    won: Number(d.won ?? 0),
    draw: Number(d.draw ?? 0),
    lost: Number(d.lost ?? 0),
    mvp: Number(d.mvp ?? 0),
  };
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): ChallengeSeasonStats => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    season: Number(d.season ?? new Date().getFullYear()),
    groupMemberId: String(d.groupMemberId ?? ''),
    updatedAt: toTimestamp(d.updatedAt),
    playerStats: mapPlayerStats(d.playerStats),
    goalkeeperStats: mapGoalkeeperStats(d.goalkeeperStats),
  };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Subscribe to all challenge season stats for a group in real-time,
 * grouped by season number.
 * Returns an unsubscribe function.
 */
export function subscribeToChallengeSeasonStatsByGroupId(
  groupId: string,
  onNext: (statsBySeason: Record<number, ChallengeSeasonStats[]>) => void,
  onError?: (error: Error) => void,
): () => void {
  return firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .onSnapshot(
      snap => {
        const statsBySeason: Record<number, ChallengeSeasonStats[]> = {};
        snap.docs.forEach(doc => {
          const stat = mapDoc(doc);
          if (!statsBySeason[stat.season]) {
            statsBySeason[stat.season] = [];
          }
          statsBySeason[stat.season].push(stat);
        });
        onNext(statsBySeason);
      },
      err => onError?.(err),
    );
}

/**
 * Get all challenge season stats for a specific group member across all seasons.
 */
export async function getChallengeSeasonStatsByGroupMemberId(
  groupMemberId: string,
): Promise<ChallengeSeasonStats[]> {
  const snap = await firestore()
    .collection(COLLECTION)
    .where('groupMemberId', '==', groupMemberId)
    .get();
  return snap.docs.map(mapDoc);
}

/**
 * Get a single challenge season stats document for a specific group member and season.
 * Uses the deterministic document ID: `${groupId}_${season}_${groupMemberId}`.
 */
export async function getChallengeSeasonStatsById(
  groupId: string,
  season: number,
  groupMemberId: string,
): Promise<ChallengeSeasonStats | null> {
  const docId = `${groupId}_${season}_${groupMemberId}`;
  const doc = await firestore().collection(COLLECTION).doc(docId).get();
  if (!doc.exists) return null;
  return mapDoc(doc);
}
