import React from 'react';

import { useAppSelector } from '../app/hooks';
import AppNavigator from './AppNavigator';
import AuthNavigator from './AuthNavigator';
import SplashScreen from '../screens/SplashScreen';

export default function RootNavigator() {
  const { isInitialized, firebaseUser } = useAppSelector(state => state.auth);

  if (!isInitialized) {
    return <SplashScreen />;
  }

  return firebaseUser ? <AppNavigator /> : <AuthNavigator />;
}
