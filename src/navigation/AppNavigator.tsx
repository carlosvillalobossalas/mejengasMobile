import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';

import type { AppDrawerParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import GroupsScreen from '../screens/GroupsScreen';

const Drawer = createDrawerNavigator<AppDrawerParamList>();

export default function AppNavigator() {
  return (
    <Drawer.Navigator initialRouteName="Home">
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
