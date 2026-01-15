import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

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
    await ref.set(
      {
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  const snap = await ref.get();
  return mapUserDoc(snap);
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

export async function signOut() {
  await auth().signOut();
  await GoogleSignin.signOut().catch(() => undefined);
}
