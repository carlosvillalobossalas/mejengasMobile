import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

export type Invite = {
  id: string;
  groupId: string;
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
