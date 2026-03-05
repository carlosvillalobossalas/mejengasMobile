import React, { useEffect, useState, useMemo } from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useTheme, IconButton } from 'react-native-paper';
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
import JoinRequestsScreen from '../screens/JoinRequestsScreen';
import AddMatchScreen from '../screens/AddMatchScreen';
import AddMatchTeamsScreen from '../screens/AddMatchTeamsScreen';
import MatchesByTeamsScreen from '../screens/MatchesByTeamsScreen';
import AddPlayerScreen from '../screens/AddPlayerScreen';
import ManageMembersScreen from '../screens/ManageMembersScreen';
import ManageTeamsScreen from '../screens/ManageTeamsScreen';
import TeamStandingsScreen from '../screens/TeamStandingsScreen';
import TeamFormScreen from '../screens/TeamFormScreen';
import ChallengeMatchesScreen from '../screens/ChallengeMatchesScreen';
import AddChallengeMatchScreen from '../screens/AddChallengeMatchScreen';
import SplashScreen from '../screens/SplashScreen';
import { useAppSelector, useAppDispatch } from '../app/hooks';
import {
  subscribeToUserRoleInGroup,
  subscribeToGroupsForUser,
} from '../repositories/groups/groupsRepository';
import { signOutFromFirebase } from '../features/auth/authSlice';
import { setGroups } from '../features/groups/groupsSlice';
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

  // Subscribe to user groups in real-time so the group switcher updates immediately
  // (e.g. when a join request is accepted)
  useEffect(() => {
    if (!currentUser?.uid) {
      dispatch(setGroups([]));
      return;
    }

    const unsubscribe = subscribeToGroupsForUser(
      currentUser.uid,
      groups => dispatch(setGroups(groups)),
    );

    return () => unsubscribe();
  }, [currentUser?.uid, dispatch]);

  // Subscribe to user role in real-time so drawer items update immediately
  useEffect(() => {
    if (!selectedGroupId || !currentUser?.uid) {
      setUserRole(null);
      return;
    }

    const unsubscribe = subscribeToUserRoleInGroup(
      selectedGroupId,
      currentUser.uid,
      role => setUserRole(role),
      error => {
        console.error('Error subscribing to user role:', error);
        setUserRole(null);
      },
    );

    return () => unsubscribe();
  }, [selectedGroupId, currentUser?.uid]);

  // Wait until we've loaded the selectedGroupId from storage
  if (!isHydrated) {
    return <SplashScreen />;
  }

  const initialRoute = selectedGroupId ? 'Home' : 'Groups';

  return (
    <Drawer.Navigator
      initialRouteName={initialRoute}
      screenOptions={({ navigation }) => ({
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.onSurfaceVariant,
        drawerActiveBackgroundColor: theme.colors.primaryContainer,
        headerTintColor: theme.colors.secondary,
        headerTitleStyle: { color: 'FFF' },
        headerLeft: () => (
          <IconButton
            icon="chevron-left"
            iconColor={theme.colors.secondary}
            size={26}
            onPress={() => navigation.goBack()}
          />
        ),
      })}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'Inicio',
          headerLeft: () => (
            <IconButton
              icon="menu"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.openDrawer()}
            />
          ),
        })}
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
        name="TeamStandings"
        component={TeamStandingsScreen}
        options={{
          title: 'Tabla de Equipos',
          drawerItemStyle: activeGroup?.hasFixedTeams ? undefined : { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          title: 'Partidos',
          drawerItemStyle:
            !activeGroup?.hasFixedTeams && !activeGroup?.isChallengeMode
              ? undefined
              : { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="MatchesByTeams"
        component={MatchesByTeamsScreen}
        options={{
          title: 'Partidos',
          drawerItemStyle: activeGroup?.hasFixedTeams ? undefined : { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="ChallengeMatches"
        component={ChallengeMatchesScreen}
        options={{
          title: 'Partidos',
          drawerItemStyle: activeGroup?.isChallengeMode ? undefined : { display: 'none' },
        }}
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
        name="JoinRequests"
        component={JoinRequestsScreen}
        options={({ navigation }) => ({
          title: 'Solicitudes de Unión',
          drawerItemStyle: isAdmin ? undefined : { display: 'none' },
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.navigate('Admin')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="AddMatch"
        component={AddMatchScreen}
        options={({ navigation }) => ({
          title: 'Agregar Partido',
          drawerItemStyle:
            isAdmin && !activeGroup?.hasFixedTeams && !activeGroup?.isChallengeMode
              ? undefined
              : { display: 'none' },
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.navigate('Admin')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="AddMatchTeams"
        component={AddMatchTeamsScreen}
        options={({ navigation }) => ({
          title: 'Agregar Partido',
          drawerItemStyle: isAdmin && activeGroup?.hasFixedTeams ? undefined : { display: 'none' },
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.navigate('Admin')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="AddPlayer"
        component={AddPlayerScreen}
        options={({ navigation }) => ({
          title: 'Agregar Jugador',
          drawerItemStyle: isAdmin ? undefined : { display: 'none' },
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.navigate('Admin')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="ManageMembers"
        component={ManageMembersScreen}
        options={({ navigation }) => ({
          title: 'Gestionar Miembros',
          drawerItemStyle: isAdmin ? undefined : { display: 'none' },
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.navigate('Admin')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="ManageTeams"
        component={ManageTeamsScreen}
        options={({ navigation }) => ({
          title: 'Administrar Equipos',
          drawerItemStyle: isAdmin && activeGroup?.hasFixedTeams ? undefined : { display: 'none' },
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.navigate('Admin')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="TeamForm"
        component={TeamFormScreen}
        options={{
          title: 'Equipo',
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="EditMatch"
        component={AddMatchScreen}
        options={{
          title: 'Editar Partido',
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="AddChallengeMatch"
        component={AddChallengeMatchScreen}
        options={({ navigation }) => ({
          title: 'Agregar Partido',
          drawerItemStyle:
            isAdmin && activeGroup?.isChallengeMode ? undefined : { display: 'none' },
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.navigate('Admin')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="AddScheduledChallengeMatch"
        component={AddChallengeMatchScreen}
        options={({ navigation }) => ({
          title: 'Programar Partido',
          drawerItemStyle: { display: 'none' },
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              iconColor={theme.colors.secondary}
              size={26}
              onPress={() => navigation.navigate('Admin')}
            />
          ),
        })}
      />
      <Drawer.Screen
        name="EditChallengeMatch"
        component={AddChallengeMatchScreen}
        options={{
          title: 'Editar Partido',
          drawerItemStyle: { display: 'none' },
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
