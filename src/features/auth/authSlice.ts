import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

import type { FirestoreUser } from '../../repositories/auth/authRepository';
import {
  ensureFirestoreUserForAuthUser,
  fetchFirestoreUserByUid,
  registerWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithGoogle as signInWithGoogleRepo,
  signInWithApple as signInWithAppleRepo,
  signOut as signOutRepo,
  deleteUserAccount as deleteUserAccountRepo,
  reauthenticateWithPassword,
  reauthenticateWithGoogle,
  reauthenticateWithApple,
} from '../../repositories/auth/authRepository';
import { unlinkAllGroupMembersV2ByUserId } from '../../repositories/groupMembersV2/groupMembersV2Repository';
import { deleteUserById } from '../../repositories/users/usersRepository';
import { deleteProfilePhoto } from '../../services/storage/profilePhotoService';
import { hydrateSelectedGroupId } from '../groups/groupsSlice';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

export type AuthState = {
  isInitialized: boolean;
  status: AuthStatus;
  error: string | null;
  userEmail: string | null;
  firebaseUser: FirebaseAuthTypes.User | null;
  firestoreUser: FirestoreUser | null;
};

const initialState: AuthState = {
  isInitialized: false,
  status: 'idle',
  error: null,
  userEmail: null,
  firebaseUser: null,
  firestoreUser: null,
};

function toSpanishAuthErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  switch (err.code) {
    case 'auth/invalid-email':
      return 'El correo no es válido.';
    case 'auth/user-disabled':
      return 'Este usuario está deshabilitado.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use':
      return 'Este correo ya está registrado.';
    case 'auth/weak-password':
      return 'La contraseña es muy débil.';
    case 'auth/network-request-failed':
      return 'Problema de red. Verificá tu conexión.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Se canceló el inicio de sesión.';
    default:
      return err.message ?? 'Ocurrió un error inesperado.';
  }
}

let authUnsubscribe: null | (() => void) = null;

export const startAuthListener = createAsyncThunk<void, void>(
  'auth/startAuthListener',
  async (_, { dispatch }) => {
    if (authUnsubscribe) return;

    authUnsubscribe = auth().onAuthStateChanged(async user => {
      dispatch(firebaseUserChanged(user));

      if (!user) {
        dispatch(firestoreUserChanged(null));
        dispatch(authStatusChanged('idle'));
        dispatch(setInitialized(true));
        return;
      }

      try {
        const userDoc = await ensureFirestoreUserForAuthUser(user);
        dispatch(firestoreUserChanged(userDoc));
        dispatch(authStatusChanged('authenticated'));
        dispatch(hydrateSelectedGroupId({ userId: user.uid }));
        // Fetch groups after hydrating the selected group ID
        const { fetchMyGroups } = await import('../groups/groupsSlice');
        dispatch(fetchMyGroups({ userId: user.uid }));
      } catch (e) {
        dispatch(authErrorChanged(toSpanishAuthErrorMessage(e)));
        dispatch(authStatusChanged('error'));
      } finally {
        dispatch(setInitialized(true));
      }
    });
  },
);

export const refreshFirestoreUser = createAsyncThunk<
  { firestoreUser: FirestoreUser | null },
  void
>('auth/refreshFirestoreUser', async () => {
  const current = auth().currentUser;
  if (!current) return { firestoreUser: null };
  const doc = await fetchFirestoreUserByUid(current.uid);
  return { firestoreUser: doc };
});

export const signInWithEmail = createAsyncThunk<void, { email: string; password: string }>(
  'auth/signInWithEmail',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      await signInWithEmailAndPassword({ email, password });
    } catch (e) {
      return rejectWithValue(toSpanishAuthErrorMessage(e));
    }
  },
);

export const registerWithEmail = createAsyncThunk<void, { email: string; password: string }>(
  'auth/registerWithEmail',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      await registerWithEmailAndPassword({ email, password });
    } catch (e) {
      return rejectWithValue(toSpanishAuthErrorMessage(e));
    }
  },
);

export const signInWithGoogle = createAsyncThunk<void, void>(
  'auth/signInWithGoogle',
  async (_, { rejectWithValue }) => {
    try {
      await signInWithGoogleRepo();
    } catch (e) {
      return rejectWithValue(toSpanishAuthErrorMessage(e));
    }
  },
);

export const signInWithApple = createAsyncThunk<void, void>(
  'auth/signInWithApple',
  async (_, { rejectWithValue }) => {
    try {
      await signInWithAppleRepo();
    } catch (e) {
      return rejectWithValue(toSpanishAuthErrorMessage(e));
    }
  },
);

export const signOutFromFirebase = createAsyncThunk<void, void>(
  'auth/signOutFromFirebase',
  async (_, { rejectWithValue }) => {
    try {
      await signOutRepo();
    } catch (e) {
      return rejectWithValue(toSpanishAuthErrorMessage(e));
    }
  },
);

export const deleteAccount = createAsyncThunk<
  void,
  { userId: string; provider: 'password' | 'google' | 'apple'; password?: string }
>('auth/deleteAccount', async ({ userId, provider, password }, { rejectWithValue }) => {
  try {
    // Reauthenticate based on provider
    if (provider === 'password') {
      if (!password) {
        throw new Error('Se requiere contraseña');
      }
      await reauthenticateWithPassword(password);
    } else if (provider === 'google') {
      await reauthenticateWithGoogle();
    } else if (provider === 'apple') {
      await reauthenticateWithApple();
    }

    // 1. Unlink user from all groupMembers_v2 across all groups.
    //    Sets userId = null so historical match data and season stats are preserved.
    await unlinkAllGroupMembersV2ByUserId(userId);

    // 2. Delete the user document from the users collection.
    await deleteUserById(userId);

    // 3. Delete the profile photo from Firebase Storage.
    //    Called after Firestore writes so a storage failure doesn't orphan the user doc.
    await deleteProfilePhoto(userId);

    // 4. Delete the Firebase Auth account last — Firestore operations above
    //    require the user to still be authenticated.
    await deleteUserAccountRepo();
  } catch (e) {
    return rejectWithValue(toSpanishAuthErrorMessage(e));
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Local reset for UI; prefer `signOutFromFirebase` for real sign-out.
    signOut(state) {
      state.status = 'idle';
      state.userEmail = null;
      state.error = null;
      state.firebaseUser = null;
      state.firestoreUser = null;
    },
    clearAuthError(state) {
      state.error = null;
      if (state.status === 'error') state.status = 'idle';
    },
    setInitialized(state, action: PayloadAction<boolean>) {
      state.isInitialized = action.payload;
    },
    authStatusChanged(state, action: PayloadAction<AuthStatus>) {
      state.status = action.payload;
    },
    authErrorChanged(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    firebaseUserChanged(
      state,
      action: PayloadAction<FirebaseAuthTypes.User | null>,
    ) {
      state.firebaseUser = action.payload;
      state.userEmail = action.payload?.email ?? null;
    },
    firestoreUserChanged(state, action: PayloadAction<FirestoreUser | null>) {
      state.firestoreUser = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(startAuthListener.pending, state => {
        state.error = null;
      })
      .addCase(startAuthListener.rejected, (state, action) => {
        state.status = 'error';
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          'Ocurrió un error inesperado.';
        state.isInitialized = true;
      })
      .addCase(signInWithEmail.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(signInWithEmail.fulfilled, () => {
        // onAuthStateChanged handles firebaseUser, firestoreUser, and status
      })
      .addCase(signInWithEmail.rejected, (state, action) => {
        state.status = 'error';
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          'No se pudo iniciar sesión';
      })
      .addCase(registerWithEmail.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerWithEmail.fulfilled, () => {
        // onAuthStateChanged handles firebaseUser, firestoreUser, and status
      })
      .addCase(registerWithEmail.rejected, (state, action) => {
        state.status = 'error';
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          'No se pudo completar el registro';
      })
      .addCase(signInWithGoogle.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(signInWithGoogle.fulfilled, () => {
        // onAuthStateChanged handles firebaseUser, firestoreUser, and status
      })
      .addCase(signInWithGoogle.rejected, (state, action) => {
        state.status = 'error';
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          'Falló el inicio con Google';
      })
      .addCase(signInWithApple.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(signInWithApple.fulfilled, () => {
        // onAuthStateChanged handles firebaseUser, firestoreUser, and status
      })
      .addCase(signInWithApple.rejected, (state, action) => {
        state.status = 'error';
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          'Falló el inicio con Apple';
      })
      .addCase(refreshFirestoreUser.pending, state => {
        state.error = null;
      })
      .addCase(refreshFirestoreUser.fulfilled, (state, action) => {
        state.firestoreUser = action.payload.firestoreUser;
      })
      .addCase(refreshFirestoreUser.rejected, (state, action) => {
        state.error = action.error.message ?? 'No se pudo cargar el usuario';
      })
      .addCase(signOutFromFirebase.fulfilled, state => {
        state.status = 'idle';
        state.userEmail = null;
        state.error = null;
        state.firebaseUser = null;
        state.firestoreUser = null;
      })
      .addCase(deleteAccount.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(deleteAccount.fulfilled, state => {
        state.status = 'idle';
        state.userEmail = null;
        state.error = null;
        state.firebaseUser = null;
        state.firestoreUser = null;
      })
      .addCase(deleteAccount.rejected, (state, action) => {
        state.status = 'error';
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          'No se pudo eliminar la cuenta';
      });
  },
});

export const {
  signOut,
  clearAuthError,
  setInitialized,
  authStatusChanged,
  authErrorChanged,
  firebaseUserChanged,
  firestoreUserChanged,
} = authSlice.actions;
export default authSlice.reducer;
