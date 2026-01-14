import React, { useEffect } from 'react';

import { useAppDispatch } from '../../app/hooks';
import { startAuthListener } from './authSlice';
import { configureGoogleSignIn } from '../../repositories/auth/authRepository';

export default function AuthBootstrapper() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    configureGoogleSignIn();
    dispatch(startAuthListener());
  }, [dispatch]);

  return null;
}
