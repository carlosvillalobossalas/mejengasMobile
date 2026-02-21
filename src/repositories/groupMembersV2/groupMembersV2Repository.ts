import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type GroupMemberV2 = {
  id: string;
  groupId: string;
  userId: string | null;
  displayName: string;
  photoUrl: string | null;
  isGuest: boolean;
  role: string;
  legacyPlayerId: string;
  legacyPlayerIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

const COLLECTION = 'groupMembers_v2';

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return null;
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): GroupMemberV2 => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    userId: d.userId ? String(d.userId) : null,
    displayName: String(d.displayName ?? ''),
    photoUrl: d.photoUrl ? String(d.photoUrl) : null,
    isGuest: Boolean(d.isGuest ?? true),
    role: String(d.role ?? 'member'),
    legacyPlayerId: String(d.legacyPlayerId ?? ''),
    legacyPlayerIds: Array.isArray(d.legacyPlayerIds)
      ? (d.legacyPlayerIds as string[]).map(String)
      : [],
    createdAt: toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt),
  };
};

/**
 * Get all groupMembers_v2 for a group
 */
export async function getGroupMembersV2ByGroupId(
  groupId: string,
): Promise<GroupMemberV2[]> {
  const snap = await firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .orderBy('displayName', 'asc')
    .get();
  return snap.docs.map(mapDoc);
}

/**
 * Unlink a user from a groupMember_v2.
 * Only sets userId = null and isGuest = true.
 * Does NOT touch matches or seasonStats (they reference groupMemberId, not userId).
 * Idempotent: calling it multiple times is safe.
 */
export async function unlinkUserFromGroupMemberV2(memberId: string): Promise<void> {
  const ref = firestore().collection(COLLECTION).doc(memberId);
  await firestore().runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error(`groupMember_v2 "${memberId}" no existe`);
    // Already unlinked — idempotent, no-op
    const current = (doc.data() ?? {}) as Record<string, unknown>;
    if (!current.userId) return;
    tx.update(ref, {
      userId: null,
      isGuest: true,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Check if a groupMember_v2 with the given userId already exists in a group.
 * Used before accepting an invite to prevent duplicate membership.
 */
export async function getGroupMemberV2ByUserId(
  groupId: string,
  userId: string,
): Promise<GroupMemberV2 | null> {
  const snap = await firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return mapDoc(snap.docs[0]);
}
