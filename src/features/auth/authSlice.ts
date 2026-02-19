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
} from '../../repositories/auth/authRepository';
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

export const signInWithEmail = createAsyncThunk<
  {
    userEmail: string | null;
    firebaseUser: FirebaseAuthTypes.User;
    firestoreUser: FirestoreUser;
  },
  { email: string; password: string }
>('auth/signInWithEmail', async ({ email, password }, { rejectWithValue }) => {
  try {
    const credential = await signInWithEmailAndPassword({ email, password });
    const firebaseUser = credential.user;
    const firestoreUser = await ensureFirestoreUserForAuthUser(firebaseUser);

    return {
      userEmail: firebaseUser.email ?? email.trim().toLowerCase(),
      firebaseUser,
      firestoreUser,
    };
  } catch (e) {
    return rejectWithValue(toSpanishAuthErrorMessage(e));
  }
});

export const registerWithEmail = createAsyncThunk<
  {
    userEmail: string | null;
    firebaseUser: FirebaseAuthTypes.User;
    firestoreUser: FirestoreUser;
  },
  { email: string; password: string }
>('auth/registerWithEmail', async ({ email, password }, { rejectWithValue }) => {
  try {
    const credential = await registerWithEmailAndPassword({ email, password });
    const firebaseUser = credential.user;
    const firestoreUser = await ensureFirestoreUserForAuthUser(firebaseUser);

    return {
      userEmail: firebaseUser.email ?? email.trim().toLowerCase(),
      firebaseUser,
      firestoreUser,
    };
  } catch (e) {
    return rejectWithValue(toSpanishAuthErrorMessage(e));
  }
});

export const signInWithGoogle = createAsyncThunk<
  {
    userEmail: string | null;
    firebaseUser: FirebaseAuthTypes.User;
    firestoreUser: FirestoreUser;
  },
  void
>('auth/signInWithGoogle', async (_, { rejectWithValue }) => {
  try {
    const credential = await signInWithGoogleRepo();
    const firebaseUser = credential.user;
    const firestoreUser = await ensureFirestoreUserForAuthUser(firebaseUser);

    return {
      userEmail: firebaseUser.email ?? null,
      firebaseUser,
      firestoreUser,
    };
  } catch (e) {
    return rejectWithValue(toSpanishAuthErrorMessage(e));
  }
});

export const signInWithApple = createAsyncThunk<
  {
    userEmail: string | null;
    firebaseUser: FirebaseAuthTypes.User;
    firestoreUser: FirestoreUser;
  },
  void
>('auth/signInWithApple', async (_, { rejectWithValue }) => {
  try {
    const credential = await signInWithAppleRepo();
    const firebaseUser = credential.user;
    const firestoreUser = await ensureFirestoreUserForAuthUser(firebaseUser);

    return {
      userEmail: firebaseUser.email ?? null,
      firebaseUser,
      firestoreUser,
    };
  } catch (e) {
    return rejectWithValue(toSpanishAuthErrorMessage(e));
  }
});

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
      .addCase(signInWithEmail.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.userEmail = action.payload.userEmail;
        state.firebaseUser = action.payload.firebaseUser;
        state.firestoreUser = action.payload.firestoreUser;
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
      .addCase(registerWithEmail.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.userEmail = action.payload.userEmail;
        state.firebaseUser = action.payload.firebaseUser;
        state.firestoreUser = action.payload.firestoreUser;
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
      .addCase(signInWithGoogle.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.userEmail = action.payload.userEmail;
        state.firebaseUser = action.payload.firebaseUser;
        state.firestoreUser = action.payload.firestoreUser;
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
      .addCase(signInWithApple.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.userEmail = action.payload.userEmail;
        state.firebaseUser = action.payload.firebaseUser;
        state.firestoreUser = action.payload.firestoreUser;
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
