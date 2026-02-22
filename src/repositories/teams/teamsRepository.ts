import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const COLLECTION = 'teams';

export type TeamPlayer = {
  groupMemberId: string;
  defaultPosition: 'POR' | 'DEF' | 'MED' | 'DEL';
};

export type Team = {
  id: string;
  groupId: string;
  name: string;
  color: string;
  photoUrl: string | null;
  players: TeamPlayer[];
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string;
  updatedBy: string;
};

export type CreateTeamInput = {
  groupId: string;
  name: string;
  color: string;
  photoUrl: string | null;
  players: TeamPlayer[];
  createdBy: string;
};

export type UpdateTeamInput = {
  name: string;
  color: string;
  photoUrl: string | null;
  players: TeamPlayer[];
  updatedBy: string;
};

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return null;
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): Team => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  const rawPlayers = Array.isArray(d.players)
    ? (d.players as Record<string, unknown>[])
    : [];

  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    name: String(d.name ?? ''),
    color: String(d.color ?? '#2196F3'),
    photoUrl: d.photoUrl ? String(d.photoUrl) : null,
    players: rawPlayers.map(p => ({
      groupMemberId: String(p.groupMemberId ?? ''),
      defaultPosition: String(
        p.defaultPosition ?? 'DEF',
      ) as TeamPlayer['defaultPosition'],
    })),
    createdAt: toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt),
    createdBy: String(d.createdBy ?? ''),
    updatedBy: String(d.updatedBy ?? ''),
  };
};

/**
 * Get all teams for a group, ordered by name.
 */
export async function getTeamsByGroupId(groupId: string): Promise<Team[]> {
  const snap = await firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .get();
  return snap.docs.map(mapDoc);
}

/**
 * Get a single team by its document ID.
 */
export async function getTeamById(teamId: string): Promise<Team | null> {
  const doc = await firestore().collection(COLLECTION).doc(teamId).get();
  if (!doc.exists) return null;
  return mapDoc(doc);
}

/**
 * Create a new team document. Returns the generated document ID.
 */
export async function createTeam(input: CreateTeamInput): Promise<string> {
  const docRef = await firestore().collection(COLLECTION).add({
    groupId: input.groupId,
    name: input.name,
    color: input.color,
    photoUrl: input.photoUrl,
    players: input.players,
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Update an existing team. Never modifies createdAt or createdBy.
 */
export async function updateTeam(
  teamId: string,
  input: UpdateTeamInput,
): Promise<void> {
  await firestore().collection(COLLECTION).doc(teamId).update({
    name: input.name,
    color: input.color,
    photoUrl: input.photoUrl,
    players: input.players,
    updatedBy: input.updatedBy,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}
