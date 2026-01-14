import { configureStore } from '@reduxjs/toolkit';

import authReducer from '../features/auth/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredPaths: ['auth.firebaseUser'],
        ignoredActions: [
          'auth/firebaseUserChanged',
          'auth/startAuthListener/fulfilled',
          'auth/startAuthListener/pending',
          'auth/startAuthListener/rejected',
          'auth/signInWithEmail/fulfilled',
          'auth/registerWithEmail/fulfilled',
          'auth/signInWithGoogle/fulfilled',
        ],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
