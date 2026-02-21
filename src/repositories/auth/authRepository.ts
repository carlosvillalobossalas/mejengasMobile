import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';

import { googleWebClientId } from '../../config/auth';

export type FirestoreUser = {
  id: string;
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  [key: string]: unknown;
};

const usersCollection = () => firestore().collection('users');

function toMillis(
  value: FirebaseFirestoreTypes.Timestamp | null | undefined,
): number | null {
  if (!value) return null;
  return value.toMillis();
}

function mapUserDoc(
  snap: FirebaseFirestoreTypes.DocumentSnapshot,
): FirestoreUser {
  const data = (snap.data() ?? {}) as Record<string, unknown>;

  return {
    // Spread raw data first so we can override non-serializable fields below.
    ...data,
    id: snap.id,
    uid: (data.uid as string) ?? snap.id,
    email: (data.email as string) ?? null,
    displayName: (data.displayName as string) ?? null,
    photoURL: (data.photoURL as string) ?? null,
    createdAt: toMillis(data.createdAt as FirebaseFirestoreTypes.Timestamp),
    updatedAt: toMillis(data.updatedAt as FirebaseFirestoreTypes.Timestamp),
  };
}

export function configureGoogleSignIn() {
  if (!googleWebClientId) return;
  GoogleSignin.configure({ webClientId: googleWebClientId });
}

export async function fetchFirestoreUserByUid(
  uid: string,
): Promise<FirestoreUser | null> {
  const snap = await usersCollection().doc(uid).get();
  if (!snap.exists) return null;
  return mapUserDoc(snap);
}

export async function ensureFirestoreUserForAuthUser(
  user: FirebaseAuthTypes.User,
): Promise<FirestoreUser> {
  const ref = usersCollection().doc(user.uid);
  const existing = await ref.get();

  if (!existing.exists) {
    // Only create new user with auth data if document doesn't exist
    await ref.set(
      {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    // Only sync email — displayName and photoURL are managed by the user
    // through the profile screen and must not be overwritten from Firebase Auth,
    // which returns null for email/Apple providers.
    await ref.set(
      {
        email: user.email ?? null,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  const snap = await ref.get();
  return mapUserDoc(snap);
}

export async function updateUserFcmToken(
  userId: string,
  fcmToken: string,
): Promise<void> {
  if (!userId || !fcmToken) return;

  const ref = usersCollection().doc(userId);

  await ref.set(
    {
      fcmToken,
      fcmTokens: firestore.FieldValue.arrayUnion(fcmToken),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function signInWithEmailAndPassword(params: {
  email: string;
  password: string;
}) {
  return auth().signInWithEmailAndPassword(params.email.trim(), params.password);
}

export async function registerWithEmailAndPassword(params: {
  email: string;
  password: string;
}) {
  return auth().createUserWithEmailAndPassword(
    params.email.trim(),
    params.password,
  );
}

export async function signInWithGoogle() {
  if (!googleWebClientId) {
    throw new Error(
      'Falta configurar Google. Agregá el Web Client ID en src/config/auth.ts',
    );
  }

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const signInResult: unknown = await GoogleSignin.signIn();
  const resultRecord =
    typeof signInResult === 'object' && signInResult !== null
      ? (signInResult as Record<string, unknown>)
      : null;

  const directIdToken =
    resultRecord && typeof resultRecord.idToken === 'string'
      ? resultRecord.idToken
      : null;

  const data =
    resultRecord && typeof resultRecord.data === 'object' && resultRecord.data
      ? (resultRecord.data as Record<string, unknown>)
      : null;

  const nestedIdToken =
    data && typeof data.idToken === 'string' ? (data.idToken as string) : null;

  const idToken = directIdToken ?? nestedIdToken;

  if (!idToken) {
    throw new Error('No se pudo obtener el token de Google');
  }

  const credential = auth.GoogleAuthProvider.credential(idToken);
  return auth().signInWithCredential(credential);
}

export async function signInWithApple() {
  const appleAuthRequestResponse = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });

  if (!appleAuthRequestResponse.identityToken) {
    throw new Error('No se pudo obtener el token de Apple');
  }

  const { identityToken, nonce, fullName } = appleAuthRequestResponse;
  const appleCredential = auth.AppleAuthProvider.credential(identityToken, nonce);

  const userCredential = await auth().signInWithCredential(appleCredential);

  // Apple only provides fullName on the first sign-in — update Firebase Auth profile if needed.
  if (!userCredential.user.displayName && fullName) {
    const displayName = [fullName.givenName, fullName.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (displayName) {
      await userCredential.user.updateProfile({ displayName });
    }
  }

  return userCredential;
}

export async function signOut() {
  await auth().signOut();
  await GoogleSignin.signOut().catch(() => undefined);
}

/**
 * Delete the current user's Firebase Auth account
 */
export async function deleteUserAccount(): Promise<void> {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('No hay usuario autenticado');
  }
  
  await currentUser.delete();
}

/**
 * Reauthenticate user with email and password before sensitive operations
 */
export async function reauthenticateWithPassword(password: string): Promise<void> {
  const currentUser = auth().currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('No hay usuario autenticado');
  }

  const credential = auth.EmailAuthProvider.credential(
    currentUser.email,
    password,
  );

  await currentUser.reauthenticateWithCredential(credential);
}

/**
 * Reauthenticate user with Google before sensitive operations
 */
export async function reauthenticateWithGoogle(): Promise<void> {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('No hay usuario autenticado');
  }

  if (!googleWebClientId) {
    throw new Error('Falta configurar Google');
  }

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const signInResult: unknown = await GoogleSignin.signIn();
  const resultRecord =
    typeof signInResult === 'object' && signInResult !== null
      ? (signInResult as Record<string, unknown>)
      : null;

  const directIdToken =
    resultRecord && typeof resultRecord.idToken === 'string'
      ? resultRecord.idToken
      : null;

  const data =
    resultRecord && typeof resultRecord.data === 'object' && resultRecord.data
      ? (resultRecord.data as Record<string, unknown>)
      : null;

  const nestedIdToken =
    data && typeof data.idToken === 'string' ? (data.idToken as string) : null;

  const idToken = directIdToken ?? nestedIdToken;

  if (!idToken) {
    throw new Error('No se pudo obtener el token de Google');
  }

  const credential = auth.GoogleAuthProvider.credential(idToken);
  await currentUser.reauthenticateWithCredential(credential);
}

/**
 * Reauthenticate user with Apple before sensitive operations
 */
export async function reauthenticateWithApple(): Promise<void> {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('No hay usuario autenticado');
  }

  const appleAuthRequestResponse = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });

  if (!appleAuthRequestResponse.identityToken) {
    throw new Error('No se pudo obtener el token de Apple');
  }

  const { identityToken, nonce } = appleAuthRequestResponse;
  const appleCredential = auth.AppleAuthProvider.credential(identityToken, nonce);

  await currentUser.reauthenticateWithCredential(appleCredential);
}
