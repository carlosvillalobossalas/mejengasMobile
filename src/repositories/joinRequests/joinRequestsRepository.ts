import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type JoinRequestStatus = 'pending' | 'accepted' | 'rejected';

export type JoinRequest = {
  id: string;
  groupId: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  userPhotoURL: string | null;
  status: JoinRequestStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

const COLLECTION = 'joinRequests';
const INVITES_COLLECTION = 'invites';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';
const USERS_COLLECTION = 'users';

const looksLikeEmail = (value: string): boolean => /.+@.+\..+/.test(value.trim());

const getValidDisplayName = (...candidates: Array<string | null | undefined>): string | null => {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    if (looksLikeEmail(trimmed)) continue;
    return trimmed;
  }
  return null;
};

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return null;
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): JoinRequest => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    userId: String(d.userId ?? ''),
    userDisplayName: String(d.userDisplayName ?? ''),
    userEmail: String(d.userEmail ?? ''),
    userPhotoURL: d.userPhotoURL ? String(d.userPhotoURL) : null,
    status: (d.status as JoinRequestStatus) ?? 'pending',
    createdAt: toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt),
  };
};

/**
 * Create a join request for a user to join a public group.
 * Validates:
 *  - user is not already a member
 *  - no pending join request already exists for user+group
 *  - no pending invite already exists for user email+group
 */
export async function createJoinRequest(params: {
  groupId: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  userPhotoURL: string | null;
}): Promise<string> {
  const { groupId, userId, userDisplayName, userEmail, userPhotoURL } = params;
  const normalizedEmail = userEmail.trim().toLowerCase();

  // Check user is not already a member
  const memberSnap = await firestore()
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!memberSnap.empty) {
    throw new Error('Ya eres miembro de este grupo.');
  }

  // Check no pending join request exists
  const existingRequest = await firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!existingRequest.empty) {
    throw new Error('Ya tienes una solicitud pendiente para este grupo.');
  }

  // Check no pending invite exists for this user+group (admin already invited them)
  const existingInvite = await firestore()
    .collection(INVITES_COLLECTION)
    .where('groupId', '==', groupId)
    .where('email', '==', normalizedEmail)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!existingInvite.empty) {
    throw new Error('Ya fuiste invitado a este grupo. Revisa tus invitaciones.');
  }

  const ref = firestore().collection(COLLECTION).doc();
  await ref.set({
    groupId,
    userId,
    userDisplayName,
    userEmail: normalizedEmail,
    userPhotoURL: userPhotoURL ?? null,
    status: 'pending',
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return ref.id;
}

/**
 * Get the current join request status for a user+group combination.
 * Returns null if none exists.
 */
export async function getJoinRequestForUser(
  groupId: string,
  userId: string,
): Promise<JoinRequest | null> {
  // Avoid orderBy to prevent requiring a composite Firestore index.
  // Sort client-side instead and prioritise the most recent request.
  const snap = await firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .get();
  if (snap.empty) return null;
  const docs = snap.docs.map(mapDoc);
  // Prefer any pending request; otherwise return the most recently updated one
  const pending = docs.find(d => d.status === 'pending');
  if (pending) return pending;
  docs.sort((a, b) => {
    const ta = a.updatedAt ?? a.createdAt ?? '';
    const tb = b.updatedAt ?? b.createdAt ?? '';
    return tb.localeCompare(ta);
  });
  return docs[0] ?? null;
}

/**
 * Subscribe to all pending join requests for a group.
 * Used by admins in JoinRequestsScreen.
 */
export function subscribeToPendingJoinRequestsByGroupId(
  groupId: string,
  onNext: (requests: JoinRequest[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return firestore()
    .collection(COLLECTION)
    .where('groupId', '==', groupId)
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .onSnapshot(
      snap => onNext(snap.docs.map(mapDoc)),
      err => {
        console.log(err)
        onError?.(err)},
    );
}

/**
 * Accept a join request and create or link a groupMember_v2.
 * If existingMemberId is provided, links userId to that member.
 * Otherwise creates a new groupMember_v2 linked to the user.
 */
export async function acceptJoinRequest(params: {
  requestId: string;
  groupId: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  existingMemberId?: string;
}): Promise<void> {
  const { requestId, groupId, userId, existingMemberId } = params;

  // Always read the latest user document so displayName/photoURL reflect the
  // current value in Firestore — the join request might have been created with
  // a stale/missing displayName (e.g. Apple Sign-In hidden-email fallback).
  const userDoc = await firestore().collection(USERS_COLLECTION).doc(userId).get();
  const userData = (userDoc.data() ?? {}) as Record<string, unknown>;
  const resolvedDisplayName = getValidDisplayName(
    userData.displayName as string | undefined,
    params.userDisplayName,
  );
  const userPhotoURL =
    (userData.photoURL as string | undefined) ?? params.userPhotoURL ?? null;

  const requestRef = firestore().collection(COLLECTION).doc(requestId);

  await firestore().runTransaction(async tx => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new Error('La solicitud no existe.');
    const data = (requestSnap.data() ?? {}) as Record<string, unknown>;
    if (data.status !== 'pending') throw new Error('Esta solicitud ya fue procesada.');

    if (existingMemberId) {
      // Link userId to an existing guest groupMember_v2
      const memberRef = firestore()
        .collection(GROUP_MEMBERS_V2_COLLECTION)
        .doc(existingMemberId);
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists) throw new Error('El jugador seleccionado no existe.');
      const member = (memberSnap.data() ?? {}) as Record<string, unknown>;
      if (member.userId) throw new Error('Este jugador ya tiene una cuenta vinculada.');

      const currentMemberName = String(member.displayName ?? '').trim();
      const finalDisplayName =
        resolvedDisplayName ??
        (looksLikeEmail(currentMemberName) ? '' : currentMemberName);

      tx.update(memberRef, {
        userId,
        isGuest: false,
        ...(finalDisplayName ? { displayName: finalDisplayName } : {}),
        ...(userPhotoURL && { photoUrl: userPhotoURL }),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Create a new groupMember_v2 already linked to the user
      const newMemberRef = firestore().collection(GROUP_MEMBERS_V2_COLLECTION).doc();
      const finalDisplayName = resolvedDisplayName ?? 'Jugador';
      tx.set(newMemberRef, {
        groupId,
        userId,
        displayName: finalDisplayName,
        photoUrl: userPhotoURL ?? null,
        isGuest: false,
        role: 'member',
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    }

    tx.update(requestRef, {
      status: 'accepted',
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Reject a join request.
 */
export async function rejectJoinRequest(requestId: string): Promise<void> {
  await firestore().collection(COLLECTION).doc(requestId).update({
    status: 'rejected',
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}
