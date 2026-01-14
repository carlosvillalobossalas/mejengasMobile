import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

export type AuthState = {
  status: AuthStatus;
  error: string | null;
  userEmail: string | null;
};

const initialState: AuthState = {
  status: 'idle',
  error: null,
  userEmail: null,
};

export const signInWithEmail = createAsyncThunk<
  { userEmail: string },
  { email: string; password: string }
>('auth/signInWithEmail', async ({ email }) => {
  // Wire this to Firebase/Auth later.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 350));
  return { userEmail: email.trim().toLowerCase() };
});

export const registerWithEmail = createAsyncThunk<
  { userEmail: string },
  { email: string; password: string }
>('auth/registerWithEmail', async ({ email }) => {
  // Wire this to Firebase/Auth later.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 350));
  return { userEmail: email.trim().toLowerCase() };
});

export const signInWithGoogle = createAsyncThunk<{ userEmail: string }, void>(
  'auth/signInWithGoogle',
  async () => {
    // Wire this to Google Sign-In later.
    await new Promise<void>(resolve => setTimeout(() => resolve(), 350));
    return { userEmail: 'google.user@example.com' };
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signOut(state) {
      state.status = 'idle';
      state.userEmail = null;
      state.error = null;
    },
    clearAuthError(state) {
      state.error = null;
      if (state.status === 'error') state.status = 'idle';
    },
  },
  extraReducers: builder => {
    builder
      .addCase(signInWithEmail.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(signInWithEmail.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.userEmail = action.payload.userEmail;
      })
      .addCase(signInWithEmail.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message ?? 'No se pudo iniciar sesión';
      })
      .addCase(registerWithEmail.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerWithEmail.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.userEmail = action.payload.userEmail;
      })
      .addCase(registerWithEmail.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message ?? 'No se pudo completar el registro';
      })
      .addCase(signInWithGoogle.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(signInWithGoogle.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.userEmail = action.payload.userEmail;
      })
      .addCase(signInWithGoogle.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message ?? 'Falló el inicio con Google';
      });
  },
});

export const { signOut, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
