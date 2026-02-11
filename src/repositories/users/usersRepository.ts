import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

export type User = {
  id: string;
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const USERS_COLLECTION = 'users';

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

const mapUserDoc = (
  doc: FirebaseFirestoreTypes.DocumentSnapshot,
): User => {
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  return {
    id: doc.id,
    uid: String(data.uid ?? doc.id),
    email: data.email ? String(data.email) : null,
    displayName: data.displayName ? String(data.displayName) : null,
    photoURL: data.photoURL ? String(data.photoURL) : null,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
};

/**
 * Get a user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const userRef = firestore().collection(USERS_COLLECTION).doc(userId);
  const doc = await userRef.get();

  if (!doc.exists) {
    return null;
  }

  return mapUserDoc(doc);
}

/**
 * Update user photo URL
 */
export async function updateUserPhotoURL(
  userId: string,
  photoURL: string,
): Promise<void> {
  const userRef = firestore().collection(USERS_COLLECTION).doc(userId);
  await userRef.update({
    photoURL,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}
