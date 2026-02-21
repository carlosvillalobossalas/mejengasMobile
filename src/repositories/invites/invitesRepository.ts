import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type Invite = {
  id: string;
  groupId: string;
  groupMemberId: string;
  displayNameSnapshot: string;
  groupName: string;
  email: string;
  invitedById: string;
  invitedByName: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  acceptedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const INVITES_COLLECTION = 'invites';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return null;
};

const mapInviteDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): Invite => {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    groupId: String(data.groupId ?? ''),
    groupMemberId: String(data.groupMemberId ?? ''),
    displayNameSnapshot: String(data.displayNameSnapshot ?? ''),
    groupName: String(data.groupName ?? ''),
    email: String(data.email ?? ''),
    invitedById: String(data.invitedById ?? ''),
    invitedByName: String(data.invitedByName ?? ''),
    status: (data.status as Invite['status']) ?? 'pending',
    acceptedAt: toIsoString(data.acceptedAt),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
};

/**
 * Create an invite for a groupMember_v2 that has no userId yet.
 * Validates:
 *  - groupMember_v2 exists and userId is still null
 *  - no pending invite already exists for the same groupMemberId
 */
export async function createInvite(params: {
  groupId: string;
  groupMemberId: string;
  email: string;
  invitedById: string;
  invitedByName: string;
  displayNameSnapshot: string;
  groupName: string;
}): Promise<string> {
  const {
    groupId,
    groupMemberId,
    email,
    invitedById,
    invitedByName,
    displayNameSnapshot,
    groupName,
  } = params;
  const normalizedEmail = email.trim().toLowerCase();

  // Validate groupMember_v2 exists and has no userId
  const memberSnap = await firestore()
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .doc(groupMemberId)
    .get();

  if (!memberSnap.exists) {
    throw new Error('El jugador no existe en el grupo');
  }
  const memberData = (memberSnap.data() ?? {}) as Record<string, unknown>;
  if (memberData.userId) {
    throw new Error('Este jugador ya tiene una cuenta vinculada. No se puede invitar.');
  }

  // Check for existing pending invite for this groupMemberId
  const existing = await firestore()
    .collection(INVITES_COLLECTION)
    .where('groupMemberId', '==', groupMemberId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!existing.empty) {
    const existingEmail = String(
      ((existing.docs[0].data() as Record<string, unknown>).email) ?? '',
    );
    throw new Error(
      `Ya existe una invitacion pendiente para este jugador enviada a ${existingEmail}`,
    );
  }

  const ref = firestore().collection(INVITES_COLLECTION).doc();
  await ref.set({
    groupId,
    groupMemberId,
    email: normalizedEmail,
    invitedById,
    invitedByName,
    displayNameSnapshot,
    groupName,
    status: 'pending',
    acceptedAt: null,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return ref.id;
}

/**
 * Get all pending invites for a user by email.
 */
export async function getInvitesByEmail(email: string): Promise<Invite[]> {
  const normalizedEmail = email.trim().toLowerCase();
  const snap = await firestore()
    .collection(INVITES_COLLECTION)
    .where('email', '==', normalizedEmail)
    .where('status', '==', 'pending')
    .get();
  return snap.docs.map(mapInviteDoc);
}

/**
 * Subscribe to pending invites for a user by email.
 * Returns an unsubscribe function to stop listening.
 */
export function subscribeToInvitesByEmail(
  email: string,
  onNext: (invites: Invite[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const normalizedEmail = email.trim().toLowerCase();
  return firestore()
    .collection(INVITES_COLLECTION)
    .where('email', '==', normalizedEmail)
    .where('status', '==', 'pending')
    .onSnapshot(
      snap => onNext(snap.docs.map(mapInviteDoc)),
      err => onError?.(err),
    );
}

/**
 * Accept an invite via transaction.
 * Validates:
 *  - invite is still pending
 *  - email matches the current user's email
 *  - groupMember_v2.userId is still null
 *  - no other groupMember_v2 in the same group already has this userId
 * Then:
 *  - sets groupMember_v2.userId = currentUserId, isGuest = false
 *  - marks invite as accepted with acceptedAt
 */
export async function acceptInvite(
  inviteId: string,
  currentUserId: string,
  currentUserEmail: string,
): Promise<void> {
  const inviteRef = firestore().collection(INVITES_COLLECTION).doc(inviteId);

  await firestore().runTransaction(async tx => {
    // 1. Read and validate invite
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw new Error('La invitacion no existe');
    const invite = (inviteSnap.data() ?? {}) as Record<string, unknown>;

    if (invite.status !== 'pending') {
      throw new Error('Esta invitacion ya no esta disponible');
    }

    const inviteEmail = String(invite.email ?? '');
    if (inviteEmail !== currentUserEmail.trim().toLowerCase()) {
      throw new Error('Esta invitacion no pertenece a tu cuenta');
    }

    // 2. Read and validate groupMember_v2
    const memberRef = firestore()
      .collection(GROUP_MEMBERS_V2_COLLECTION)
      .doc(String(invite.groupMemberId ?? ''));
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) throw new Error('El jugador asociado no existe');
    const member = (memberSnap.data() ?? {}) as Record<string, unknown>;

    if (member.userId) {
      throw new Error('Este jugador ya tiene una cuenta vinculada');
    }

    const groupId = String(member.groupId ?? '');

    // 3. Read user profile to sync displayName and photoUrl
    const userRef = firestore().collection('users').doc(currentUserId);
    const userSnap = await tx.get(userRef);
    const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
    const userDisplayName = (userData.displayName as string | null) ?? null;
    const userPhotoUrl = (userData.photoURL as string | null) ?? null;

    // 4. Check for duplicate membership in the same group
    const duplicateSnap = await firestore()
      .collection(GROUP_MEMBERS_V2_COLLECTION)
      .where('groupId', '==', groupId)
      .where('userId', '==', currentUserId)
      .limit(1)
      .get();

    if (!duplicateSnap.empty) {
      throw new Error('Ya tienes una cuenta vinculada en este grupo');
    }

    // 5. Apply changes — link user and sync profile data from users collection
    tx.update(memberRef, {
      userId: currentUserId,
      isGuest: false,
      ...(userDisplayName !== null && { displayName: userDisplayName }),
      ...(userPhotoUrl !== null && { photoUrl: userPhotoUrl }),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    tx.update(inviteRef, {
      status: 'accepted',
      acceptedAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Reject an invite (marks as rejected, does not delete).
 */
export async function rejectInvite(inviteId: string): Promise<void> {
  await firestore().collection(INVITES_COLLECTION).doc(inviteId).update({
    status: 'rejected',
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Delete an invite document (legacy cleanup only).
 */
export async function deleteInvite(inviteId: string): Promise<void> {
  await firestore().collection(INVITES_COLLECTION).doc(inviteId).delete();
}

/**
 * Get a pending invite for a specific groupMemberId (for admin UI display).
 */
export async function getPendingInviteForMember(
  groupMemberId: string,
): Promise<Invite | null> {
  const snap = await firestore()
    .collection(INVITES_COLLECTION)
    .where('groupMemberId', '==', groupMemberId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return mapInviteDoc(snap.docs[0]);
}
