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
 * Create a new guest member in groupMembers_v2.
 * Used when manually adding a player to a group who doesn't have an account.
 */
export async function createGuestGroupMemberV2(
  groupId: string,
  displayName: string,
): Promise<string> {
  const docRef = await firestore().collection(COLLECTION).add({
    groupId,
    displayName,
    userId: null,
    photoUrl: null,
    isGuest: true,
    role: "member",
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

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
 * Subscribe to all groupMembers_v2 for a group with real-time updates.
 * Returns an unsubscribe function.
 */
export function subscribeToGroupMembersV2ByGroupId(
  groupId: string,
  onNext: (members: GroupMemberV2[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .orderBy('displayName', 'asc')
    .onSnapshot(
      snap => onNext(snap.docs.map(mapDoc)),
      err => onError?.(err),
    );
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
 * Update photoUrl on every groupMember_v2 that belongs to this user.
 * Called after the user changes their profile photo so all groups reflect the new photo.
 */
export async function updatePhotoUrlByUserId(
  userId: string,
  photoUrl: string,
): Promise<void> {
  const snap = await firestore()
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .get();

  if (snap.empty) return;

  const batch = firestore().batch();
  snap.docs.forEach(doc => {
    batch.update(doc.ref, {
      photoUrl,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Update displayName on every groupMember_v2 that belongs to this user.
 * Called after the user changes their display name so all groups reflect the new name.
 */
export async function updateDisplayNameByUserId(
  userId: string,
  displayName: string,
): Promise<void> {
  const snap = await firestore()
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .get();

  if (snap.empty) return;

  const batch = firestore().batch();
  snap.docs.forEach(doc => {
    batch.update(doc.ref, {
      displayName,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Unlink a user from ALL their groupMembers_v2 records across all groups.
 * Sets userId = null and isGuest = true on every record so historical
 * match data and season stats (which reference groupMemberId, not userId) are preserved.
 * Called as part of account deletion.
 */
export async function unlinkAllGroupMembersV2ByUserId(userId: string): Promise<void> {
  const snap = await firestore()
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .get();

  if (snap.empty) return;

  const batch = firestore().batch();
  snap.docs.forEach(doc => {
    batch.update(doc.ref, {
      userId: null,
      isGuest: true,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Search groupMembers_v2 by displayName within a specific group.
 * Performs client-side filtering since Firestore does not support
 * case-insensitive "contains" queries natively.
 */
export async function searchGroupMembersByDisplayName(
  groupId: string,
  searchTerm: string,
): Promise<GroupMemberV2[]> {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return [];

  const snap = await firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .orderBy('displayName', 'asc')
    .get();

  return snap.docs
    .map(mapDoc)
    .filter(member => member.displayName.toLowerCase().includes(normalized));
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

export type GroupMemberRole = 'member' | 'admin' | 'owner';

/**
 * Update the role of a groupMember_v2.
 * Only 'member' and 'admin' are valid values.
 */
export async function updateGroupMemberRole(
  memberId: string,
  role: GroupMemberRole,
): Promise<void> {
  await firestore()
    .collection(COLLECTION)
    .doc(memberId)
    .update({
      role,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
}
