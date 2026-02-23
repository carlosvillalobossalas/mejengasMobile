import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const COLLECTION = 'seasonStatsByTeams';

export type TeamSeasonStats = {
  id: string;
  groupId: string;
  teamId: string;
  season: number;
  matches: number;
  won: number;
  lost: number;
  draw: number;
  points: number;
  goals: number;
  goalsConceded: number;
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): TeamSeasonStats => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    teamId: String(d.teamId ?? ''),
    season: Number(d.season ?? new Date().getFullYear()),
    matches: Number(d.matches ?? 0),
    won: Number(d.won ?? 0),
    lost: Number(d.lost ?? 0),
    draw: Number(d.draw ?? 0),
    points: Number(d.points ?? 0),
    goals: Number(d.goals ?? 0),
    goalsConceded: Number(d.goalsConceded ?? 0),
  };
};

/**
 * Subscribe to all team season stats for a group in real-time.
 * Returns an unsubscribe function.
 */
export function subscribeToTeamSeasonStatsByGroupId(
  groupId: string,
  onNext: (stats: TeamSeasonStats[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .onSnapshot(
      snap => onNext(snap.docs.map(mapDoc)),
      err => onError?.(err),
    );
}
