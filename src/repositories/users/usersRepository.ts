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

/**
 * Search users by display name (case-insensitive partial match)
 * @param searchTerm Term to search for in displayName
 * @param limit Maximum number of results to return
 */
export async function searchUsersByName(
  searchTerm: string,
  limit: number = 10,
): Promise<User[]> {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();

  // Firestore doesn't support case-insensitive queries or partial matches directly
  // So we fetch all users and filter in memory
  // For large datasets, consider using Algolia or similar search service
  const snapshot = await firestore()
    .collection(USERS_COLLECTION)
    .limit(100) // Limit initial fetch to avoid performance issues
    .get();

  const users = snapshot.docs.map(mapUserDoc);

  // Filter by partial match (case-insensitive)
  const filtered = users.filter(user => {
    if (!user.displayName) {
      return false;
    }
    return user.displayName.toLowerCase().includes(normalizedSearch);
  });

  return filtered.slice(0, limit);
}

