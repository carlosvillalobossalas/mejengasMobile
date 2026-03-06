import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { ensureGroupNotificationDefaults } from '../users/notificationPreferencesRepository';

export type Group = {
  id: string;
  name: string;
  ownerId: string;
  description: string;
  isActive: boolean;
  type: string;
  visibility: string;
  hasFixedTeams: boolean;
  /** When true the group operates in challenge mode: only the group's own team
   *  is tracked, opponents are identified by name only. Mutually exclusive with
   *  hasFixedTeams — isChallengeMode implies no fixed teams. */
  isChallengeMode: boolean;
  defaultTeam1Color: string;
  defaultTeam2Color: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  playerId?: string | null;
  status: string;
  role: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type { GroupMember };

const GROUPS_COLLECTION = 'groups';
const GROUP_MEMBERS_COLLECTION = 'groupMembers';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';
const DEFAULT_TEAM_1_COLOR = '#000000';
const DEFAULT_TEAM_2_COLOR = '#FFFFFF';

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

const mapGroupDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): Group => {
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  return {
    id: doc.id,
    name: String(data.name ?? ''),
    ownerId: String(data.ownerId ?? data.ownerid ?? ''),
    description: String(data.description ?? ''),
    isActive: Boolean(data.isactive ?? data.isActive ?? false),
    createdAt: toIsoString(data.createdat ?? data.createdAt),
    updatedAt: toIsoString(data.updatedat ?? data.updatedAt),
    type: String(data.type ?? ''),
    visibility: String(data.visibility ?? ''),
    hasFixedTeams: Boolean(data.hasFixedTeams ?? false),
    isChallengeMode: Boolean(data.isChallengeMode ?? false),
    defaultTeam1Color: String(data.defaultTeam1Color ?? DEFAULT_TEAM_1_COLOR),
    defaultTeam2Color: String(data.defaultTeam2Color ?? DEFAULT_TEAM_2_COLOR),
  };
};

const mapMemberDoc = (doc: FirebaseFirestoreTypes.QueryDocumentSnapshot): GroupMember => {
  const data = doc.data() as Record<string, unknown>;

  return {
    id: doc.id,
    groupId: String(data.groupId ?? ''),
    userId: String(data.userId ?? data.userid ?? ''),
    playerId: data.playerId ? String(data.playerId) : null,
    status: String(data.status ?? ''),
    role: String(data.role ?? ''),
    createdAt: toIsoString(data.createdAt ?? data.createdat),
    updatedAt: toIsoString(data.updatedAt ?? data.updatedat),
  };
};

const uniqueNonEmpty = (values: Array<string>): Array<string> => {
  const result = new Set<string>();
  for (const value of values) {
    if (value) {
      result.add(value);
    }
  }
  return Array.from(result);
};

const chunk = <T,>(items: Array<T>, size: number): Array<Array<T>> => {
  if (size <= 0) {
    return [items];
  }

  const result: Array<Array<T>> = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

export async function fetchGroupsForUser(userId: string): Promise<Array<Group>> {
  const snap = await firestore()
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('userId', '==', userId)
    .get();

  const groupIds = uniqueNonEmpty(
    snap.docs.map(d => String((d.data() as Record<string, unknown>).groupId ?? '')),
  );

  if (groupIds.length === 0) {
    return [];
  }

  const groupsRef = firestore().collection(GROUPS_COLLECTION);
  const docId = firestore.FieldPath.documentId();

  // Firestore `in` queries are limited to 10 values, so we chunk.
  const groupDocs: Array<FirebaseFirestoreTypes.DocumentSnapshot> = [];

  for (const idsChunk of chunk(groupIds, 10)) {
    try {
      const snap = await groupsRef.where(docId, 'in', idsChunk).get();
      groupDocs.push(...snap.docs);
    } catch {
      // Fallback: fetch by doc ID one by one (slower but reliable).
      const docs = await Promise.all(idsChunk.map(id => groupsRef.doc(id).get()));
      for (const doc of docs) {
        const existsValue = (doc as unknown as { exists?: unknown }).exists;
        const exists =
          typeof existsValue === 'function'
            ? Boolean((existsValue as () => boolean)())
            : Boolean(existsValue);

        if (exists) groupDocs.push(doc);
      }
    }
  }

  const groups = groupDocs.map(mapGroupDoc);

  // Keep a stable order for UI.
  groups.sort((a, b) => a.name.localeCompare(b.name));

  return groups;
}

/**
 * Subscribe to groups for a user with real-time updates
 * Returns an unsubscribe function
 */
export function subscribeToGroupsForUser(
  userId: string,
  callback: (groups: Group[]) => void,
): () => void {
  // Subscribe to group members for this user in the v2 collection
  const unsubscribe = firestore()
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('userId', '==', userId)
    .onSnapshot(
      async (snapshot) => {
        try {
          const groupIds = uniqueNonEmpty(
            snapshot.docs.map(d =>
              String((d.data() as Record<string, unknown>).groupId ?? ''),
            ),
          );

          if (groupIds.length === 0) {
            callback([]);
            return;
          }

          const groupsRef = firestore().collection(GROUPS_COLLECTION);
          const docId = firestore.FieldPath.documentId();
          const groupDocs: Array<FirebaseFirestoreTypes.DocumentSnapshot> = [];

          for (const idsChunk of chunk(groupIds, 10)) {
            try {
              const snap = await groupsRef.where(docId, 'in', idsChunk).get();
              groupDocs.push(...snap.docs);
            } catch {
              const docs = await Promise.all(idsChunk.map(id => groupsRef.doc(id).get()));
              for (const doc of docs) {
                const existsValue = (doc as unknown as { exists?: unknown }).exists;
                const exists =
                  typeof existsValue === 'function'
                    ? Boolean((existsValue as () => boolean)())
                    : Boolean(existsValue);

                if (exists) groupDocs.push(doc);
              }
            }
          }

          const groups = groupDocs.map(mapGroupDoc);
          groups.sort((a, b) => a.name.localeCompare(b.name));

          callback(groups);
        } catch (error) {
          console.error('Error in groups subscription:', error);
        }
      },
      (error) => {
        console.error('Error in group members subscription:', error);
      },
    );

  return unsubscribe;
}

/**
 * Get multiple groups by IDs
 */
export async function getGroupsByIds(
  groupIds: string[],
): Promise<Map<string, Group>> {
  if (groupIds.length === 0) {
    return new Map();
  }

  const groupsRef = firestore().collection(GROUPS_COLLECTION);
  const docId = firestore.FieldPath.documentId();
  const groupsMap = new Map<string, Group>();

  // Firestore `in` queries are limited to 10 values, so we chunk.
  for (const idsChunk of chunk(groupIds, 10)) {
    try {
      const snap = await groupsRef.where(docId, 'in', idsChunk).get();
      snap.docs.forEach(doc => {
        const group = mapGroupDoc(doc);
        groupsMap.set(group.id, group);
      });
    } catch {
      // Fallback: fetch by doc ID one by one (slower but reliable).
      const docs = await Promise.all(idsChunk.map(id => groupsRef.doc(id).get()));
      for (const doc of docs) {
        const existsValue = (doc as unknown as { exists?: unknown }).exists;
        const exists =
          typeof existsValue === 'function'
            ? Boolean((existsValue as () => boolean)())
            : Boolean(existsValue);

        if (exists) {
          const group = mapGroupDoc(doc);
          groupsMap.set(group.id, group);
        }
      }
    }
  }

  return groupsMap;
}

/**
 * Get user role in a specific group
 */
export async function getUserRoleInGroup(
  groupId: string,
  userId: string,
): Promise<string | null> {
  const snapshot = await firestore()
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const data = (snapshot.docs[0].data() ?? {}) as Record<string, unknown>;
  return data.role ? String(data.role) : null;
}

/**
 * Subscribe to the user's role in a specific group with real-time updates.
 * Returns an unsubscribe function.
 */
export function subscribeToUserRoleInGroup(
  groupId: string,
  userId: string,
  onNext: (role: string | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return firestore()
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .limit(1)
    .onSnapshot(
      snapshot => {
        if (snapshot.empty) {
          onNext(null);
          return;
        }
        const data = (snapshot.docs[0].data() ?? {}) as Record<string, unknown>;
        onNext(data.role ? String(data.role) : null);
      },
      err => onError?.(err),
    );
}

/**
 * Get all group members for a specific group
 */
export async function getGroupMembersByGroupId(
  groupId: string,
): Promise<GroupMember[]> {
  const membersRef = firestore().collection(GROUP_MEMBERS_COLLECTION);
  const snapshot = await membersRef
    .where('groupId', '==', groupId)
    .get();

  return snapshot.docs.map(mapMemberDoc);
}

/**
 * Link a player to a group member
 * Updates groupMember, PlayerSeasonStats and GoalkeeperSeasonStats collections
 */
export async function linkPlayerToMember(
  memberId: string,
  playerId: string,
  userId: string,
): Promise<void> {
  const batch = firestore().batch();

  // Update groupMember with playerId
  const memberRef = firestore()
    .collection(GROUP_MEMBERS_COLLECTION)
    .doc(memberId);

  batch.update(memberRef, {
    playerId,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Update all PlayerSeasonStats with this playerId to have the new userId
  const playerStatsSnapshot = await firestore()
    .collection('PlayerSeasonStats')
    .where('playerId', '==', playerId)
    .get();

  playerStatsSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      userId,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  // Update all GoalkeeperSeasonStats with this playerId to have the new userId
  const goalkeeperStatsSnapshot = await firestore()
    .collection('GoalkeeperSeasonStats')
    .where('playerId', '==', playerId)
    .get();

  goalkeeperStatsSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      userId,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Unlink a player from a group member
 * Updates groupMember, PlayerSeasonStats and GoalkeeperSeasonStats collections
 */
export async function unlinkPlayerFromMember(
  memberId: string,
  playerId: string,
): Promise<void> {
  const batch = firestore().batch();

  // Remove playerId from groupMember
  const memberRef = firestore()
    .collection(GROUP_MEMBERS_COLLECTION)
    .doc(memberId);

  batch.update(memberRef, {
    playerId: firestore.FieldValue.delete(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Remove userId from all PlayerSeasonStats with this playerId
  const playerStatsSnapshot = await firestore()
    .collection('PlayerSeasonStats')
    .where('playerId', '==', playerId)
    .get();

  playerStatsSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      userId: firestore.FieldValue.delete(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  // Remove userId from all GoalkeeperSeasonStats with this playerId
  const goalkeeperStatsSnapshot = await firestore()
    .collection('GoalkeeperSeasonStats')
    .where('playerId', '==', playerId)
    .get();

  goalkeeperStatsSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      userId: firestore.FieldValue.delete(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Create a new group member
 */
export async function createGroupMember(
  groupId: string,
  userId: string,
): Promise<string> {
  const membersRef = firestore().collection(GROUP_MEMBERS_COLLECTION);

  const docRef = await membersRef.add({
    groupId,
    userId,
    playerId: null,
    role: 'member',
    status: 'active',
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Create a new group
 */
export async function createGroup(
  name: string,
  description: string,
  ownerId: string,
  type: string,
  hasFixedTeams: boolean,
  isChallengeMode: boolean = false,
  ownerDisplayName: string = '',
  ownerPhotoUrl: string | null = null,
): Promise<string> {
  const groupsRef = firestore().collection(GROUPS_COLLECTION);

  const docRef = await groupsRef.add({
    name,
    description,
    ownerId,
    isActive: true,
    type,
    // isChallengeMode is mutually exclusive with hasFixedTeams
    hasFixedTeams: isChallengeMode ? false : hasFixedTeams,
    isChallengeMode,
    defaultTeam1Color: DEFAULT_TEAM_1_COLOR,
    defaultTeam2Color: DEFAULT_TEAM_2_COLOR,
    visibility: 'public',
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Create owner as first member with owner role
  const membersRef = firestore().collection(GROUP_MEMBERS_V2_COLLECTION);
  await membersRef.add({
    groupId: docRef.id,
    userId: ownerId,
    displayName: ownerDisplayName,
    photoUrl: ownerPhotoUrl ?? null,
    isGuest: false,
    role: 'owner',
    status: 'active',
    legacyPlayerId: '',
    legacyPlayerIds: [],
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  await ensureGroupNotificationDefaults(ownerId, docRef.id);

  return docRef.id;
}

/**
 * Search public groups by name, excluding groups the user already belongs to.
 * Case-insensitive client-side filtering since Firestore lacks native contains search.
 */
export async function searchPublicGroupsByName(
  searchTerm: string,
  excludeGroupIds: string[],
): Promise<Array<Group>> {
  const normalized = searchTerm.trim().toLowerCase();
  if (normalized.length < 2) return [];

  const snap = await firestore()
    .collection(GROUPS_COLLECTION)
    .where('visibility', '==', 'public')
    .where('isActive', '==', true)
    .get();

  return snap.docs
    .map(mapGroupDoc)
    .filter(
      g =>
        !excludeGroupIds.includes(g.id) &&
        g.name.toLowerCase().includes(normalized),
    );
}

/**
 * Leave a group by stripping the userId and photoUrl from the groupMembers_v2
 * document. The displayName is kept for historical context. Throws if the user
 * is the group owner — owners must transfer ownership before leaving.
 */
export async function leaveGroup(
  groupId: string,
  userId: string,
): Promise<void> {
  const snapshot = await firestore()
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new Error('No se encontró la membresía del grupo.');
  }

  const memberDoc = snapshot.docs[0];
  const data = memberDoc.data() as Record<string, unknown>;

  if (data.role === 'owner') {
    throw new Error('El dueño del grupo no puede abandonarlo.');
  }

  await memberDoc.ref.update({
    userId: firestore.FieldValue.delete(),
    photoUrl: firestore.FieldValue.delete(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Delete all group members for a specific user
 */
export async function deleteAllGroupMembersByUserId(
  userId: string,
): Promise<void> {
  const membersRef = firestore().collection(GROUP_MEMBERS_COLLECTION);

  const snapshot = await membersRef.where('userId', '==', userId).get();

  const batch = firestore().batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}
