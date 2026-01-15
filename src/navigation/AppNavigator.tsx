import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';

import type { AppDrawerParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import GroupsScreen from '../screens/GroupsScreen';
import SplashScreen from '../screens/SplashScreen';
import { useAppSelector } from '../app/hooks';

const Drawer = createDrawerNavigator<AppDrawerParamList>();

export default function AppNavigator() {
  const { selectedGroupId, isHydrated } = useAppSelector(state => state.groups);

  // Wait until we've loaded the selectedGroupId from storage
  if (!isHydrated) {
    return <SplashScreen />;
  }

  const initialRoute = selectedGroupId ? 'Home' : 'Groups';
  console.log("🚀 ~ AppNavigator ~ initialRoute:", initialRoute, selectedGroupId)

  return (
    <Drawer.Navigator initialRouteName={initialRoute}>
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Inicio' }}
      />
      <Drawer.Screen
        name="Groups"
        component={GroupsScreen}
        options={{ title: 'Grupos' }}
      />
    </Drawer.Navigator>
  );
}
