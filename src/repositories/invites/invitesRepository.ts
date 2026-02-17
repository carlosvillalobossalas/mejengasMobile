import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

export type Invite = {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
  invitedByName: string;
  invitedById: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const INVITES_COLLECTION = 'invites';

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

const mapInviteDoc = (
  doc: FirebaseFirestoreTypes.DocumentSnapshot,
): Invite => {
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  return {
    id: doc.id,
    groupId: String(data.groupId ?? ''),
    groupName: String(data.groupName ?? ''),
    email: String(data.email ?? ''),
    invitedByName: String(data.invitedByName ?? ''),
    invitedById: String(data.invitedById ?? ''),
    status: String(data.status ?? 'pending'),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
};

/**
 * Get all pending invites for a user by email
 */
export async function getInvitesByEmail(email: string): Promise<Invite[]> {
  const invitesRef = firestore().collection(INVITES_COLLECTION);
  const q = invitesRef
    .where('email', '==', email)
    .where('status', '==', 'pending');
  const snapshot = await q.get();

  return snapshot.docs.map(mapInviteDoc);
}

/**
 * Accept an invite
 */
export async function acceptInvite(inviteId: string): Promise<void> {
  const inviteRef = firestore().collection(INVITES_COLLECTION).doc(inviteId);
  await inviteRef.update({
    status: 'accepted',
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Reject an invite
 */
export async function rejectInvite(inviteId: string): Promise<void> {
  const inviteRef = firestore().collection(INVITES_COLLECTION).doc(inviteId);
  await inviteRef.update({
    status: 'rejected',
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Create a new invite
 */
export async function createInvite(
  email: string,
  groupId: string,
  groupName: string,
  invitedById: string,
  invitedByName: string,
): Promise<string> {
  const invitesRef = firestore().collection(INVITES_COLLECTION);
  
  // Check if there's already a pending invite for this email and group
  const existingInvite = await invitesRef
    .where('email', '==', email)
    .where('groupId', '==', groupId)
    .where('status', '==', 'pending')
    .get();

  if (!existingInvite.empty) {
    throw new Error('Ya existe una invitación pendiente para este usuario');
  }

  const docRef = await invitesRef.add({
    email,
    groupId,
    groupName,
    invitedById,
    invitedByName,
    status: 'pending',
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Delete an invite
 */
export async function deleteInvite(inviteId: string): Promise<void> {
  const inviteRef = firestore().collection(INVITES_COLLECTION).doc(inviteId);
  await inviteRef.delete();
}
