import React, { useEffect, useState, useMemo } from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useTheme } from 'react-native-paper';
import { Alert } from 'react-native';

import type { AppDrawerParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import GroupsScreen from '../screens/GroupsScreen';
import PlayersTableScreen from '../screens/PlayersTableScreen';
import GoalkeepersTableScreen from '../screens/GoalkeepersTableScreen';
import MatchesScreen from '../screens/MatchesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import InvitationsScreen from '../screens/InvitationsScreen';
import AdminScreen from '../screens/AdminScreen';
import AddMatchScreen from '../screens/AddMatchScreen';
import AddPlayerScreen from '../screens/AddPlayerScreen';
import ManageMembersScreen from '../screens/ManageMembersScreen';
import SplashScreen from '../screens/SplashScreen';
import { useAppSelector, useAppDispatch } from '../app/hooks';
import { getUserRoleInGroup } from '../repositories/groups/groupsRepository';
import { signOutFromFirebase } from '../features/auth/authSlice';
import { useNotificationNavigation } from '../hooks/useNotificationNavigation';

const Drawer = createDrawerNavigator<AppDrawerParamList>();

export default function AppNavigator() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { selectedGroupId, isHydrated, groups } = useAppSelector(state => state.groups);
  const currentUser = useAppSelector(state => state.auth.firestoreUser);
  const [userRole, setUserRole] = useState<string | null>(null);

  const activeGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  const isOwner = activeGroup?.ownerId === currentUser?.uid;
  const isAdmin = userRole === 'admin' || userRole === 'owner' || isOwner;

  // Navigate to the correct screen when a notification is tapped
  useNotificationNavigation();

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(signOutFromFirebase()).unwrap();
            } catch (error) {
              console.error('Error signing out:', error);
            }
          },
        },
      ],
    );
  };

  // Load user role when group or user changes
  useEffect(() => {
    const loadUserRole = async () => {
      if (!selectedGroupId || !currentUser?.uid) {
        setUserRole(null);
        return;
      }

      try {
        const role = await getUserRoleInGroup(selectedGroupId, currentUser.uid);
        setUserRole(role);
      } catch (error) {
        console.error('Error loading user role:', error);
        setUserRole(null);
      }
    };

    loadUserRole();
  }, [selectedGroupId, currentUser?.uid]);

  // Wait until we've loaded the selectedGroupId from storage
  if (!isHydrated) {
    return <SplashScreen />;
  }

  const initialRoute = selectedGroupId ? 'Home' : 'Groups';

  return (
    <Drawer.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.onSurfaceVariant,
        drawerActiveBackgroundColor: theme.colors.primaryContainer,
        headerTintColor: theme.colors.secondary,
        headerTitleStyle: { color: 'FFF' }
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Inicio' }}
      />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Mi Perfil' }}
      />
      <Drawer.Screen
        name="Groups"
        component={GroupsScreen}
        options={{ title: 'Grupos' }}
      />
      <Drawer.Screen
        name="PlayersTable"
        component={PlayersTableScreen}
        options={{ title: 'Jugadores' }}
      />
      <Drawer.Screen
        name="GoalkeepersTable"
        component={GoalkeepersTableScreen}
        options={{ title: 'Porteros' }}
      />
      <Drawer.Screen
        name="Matches"
        component={MatchesScreen}
        options={{ title: 'Partidos' }}
      />
      <Drawer.Screen
        name="Invitations"
        component={InvitationsScreen}
        options={{ title: 'Invitaciones' }}
      />
      <Drawer.Screen
        name="Admin"
        component={AdminScreen}
        options={{
          title: 'Administrar Grupo',
          drawerItemStyle: isAdmin ? undefined : { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="AddMatch"
        component={AddMatchScreen}
        options={{
          title: 'Agregar Partido',
          drawerItemStyle: isAdmin ? undefined : { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="AddPlayer"
        component={AddPlayerScreen}
        options={{
          title: 'Agregar Jugador',
          drawerItemStyle: isAdmin ? undefined : { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="ManageMembers"
        component={ManageMembersScreen}
        options={{
          title: 'Gestionar Miembros',
          drawerItemStyle: isAdmin ? undefined : { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="Logout"
        component={HomeScreen}
        options={{
          title: 'Cerrar Sesión',
          drawerItemStyle: { marginTop: 20, backgroundColor: theme.colors.primary },
          drawerLabelStyle: { color: '#FFF', fontWeight: 'bold' },
        }}

        listeners={{
          drawerItemPress: (e) => {
            e.preventDefault();
            handleLogout();
          },
        }}
      />
    </Drawer.Navigator>
  );
}
