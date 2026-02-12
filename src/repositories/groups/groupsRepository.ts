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
  status: string;
  role: string;
  createdAt: string | null;
  updatedAt: string | null;
};

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
