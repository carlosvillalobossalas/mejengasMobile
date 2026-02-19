import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type Group = {
  id: string;
  name: string;
  ownerId: string;
  description: string;
  isActive: boolean;
  type: string;
  visibility: string;
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
  const membersRef = firestore().collection(GROUP_MEMBERS_COLLECTION);

  // Some projects use `userId`, others `userid`. We try both.
  const membersByUserIdSnap = await membersRef.where('userId', '==', userId).get();
  const membersDocs =
    membersByUserIdSnap.size > 0
      ? membersByUserIdSnap.docs
      : (await membersRef.where('userid', '==', userId).get()).docs;

  const members = membersDocs.map(mapMemberDoc);
  const groupIds = uniqueNonEmpty(members.map(m => m.groupId));

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
  const membersRef = firestore().collection(GROUP_MEMBERS_COLLECTION);

  // Subscribe to group members for this user
  const unsubscribe = membersRef
    .where('userId', '==', userId)
    .onSnapshot(
      async (snapshot) => {
        try {
          const members = snapshot.docs.map(mapMemberDoc);
          const groupIds = uniqueNonEmpty(members.map(m => m.groupId));

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
  const membersRef = firestore().collection(GROUP_MEMBERS_COLLECTION);
  
  // Try with userId field
  let snapshot = await membersRef
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  // If not found, try with userid field (lowercase)
  if (snapshot.empty) {
    snapshot = await membersRef
      .where('groupId', '==', groupId)
      .where('userid', '==', userId)
      .limit(1)
      .get();
  }

  if (snapshot.empty) {
    return null;
  }

  const member = mapMemberDoc(snapshot.docs[0]);
  return member.role;
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
 */
export async function linkPlayerToMember(
  memberId: string,
  playerId: string,
): Promise<void> {
  const memberRef = firestore()
    .collection(GROUP_MEMBERS_COLLECTION)
    .doc(memberId);

  await memberRef.update({
    playerId,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Unlink a player from a group member
 */
export async function unlinkPlayerFromMember(
  memberId: string,
): Promise<void> {
  const memberRef = firestore()
    .collection(GROUP_MEMBERS_COLLECTION)
    .doc(memberId);

  await memberRef.update({
    playerId: firestore.FieldValue.delete(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
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
): Promise<string> {
  const groupsRef = firestore().collection(GROUPS_COLLECTION);
  
  const docRef = await groupsRef.add({
    name,
    description,
    ownerId,
    isActive: true,
    type: 'futbol_7',
    visibility: 'public',
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Create owner as first member with owner role
  const membersRef = firestore().collection(GROUP_MEMBERS_COLLECTION);
  await membersRef.add({
    groupId: docRef.id,
    userId: ownerId,
    playerId: null,
    role: 'owner',
    status: 'active',
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
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
