import React, { useMemo, useState } from 'react';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import { View, StyleSheet } from 'react-native';
import { List, Text, useTheme, Button } from 'react-native-paper';

import type { Group } from '../repositories/groups/groupsRepository';

type Props = DrawerContentComponentProps & {
  activeGroup?: Group;
  isAdmin: boolean;
  onLogout: () => void;
};

export default function AppDrawerContent({
  navigation,
  state,
  activeGroup,
  isAdmin,
  onLogout,
}: Props) {
  const theme = useTheme();
  const [statsOpen, setStatsOpen] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);

  const activeRouteName = state.routeNames[state.index];

  const matchesRoute = useMemo(() => 'MyMatches', []);

  const canShowTeamStandings = Boolean(activeGroup?.hasFixedTeams);

  return (
    <DrawerContentScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text variant="titleLarge" style={styles.headerTitle}>Menú</Text>
        {activeGroup?.name ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Grupo activo: {activeGroup.name}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <DrawerItem
          label="Inicio"
          focused={activeRouteName === 'Home'}
          onPress={() => navigation.navigate('Home')}
          icon={({ color, size }) => <List.Icon icon="home-outline" color={color} style={{ width: size }} />}
        />
        <DrawerItem
          label="Grupos"
          focused={activeRouteName === 'Groups'}
          onPress={() => navigation.navigate('Groups')}
          icon={({ color, size }) => <List.Icon icon="account-group-outline" color={color} style={{ width: size }} />}
        />
      </View>

      <List.Accordion
        title="Estadísticas"
        expanded={statsOpen}
        onPress={() => setStatsOpen(prev => !prev)}
        left={props => <List.Icon {...props} icon="chart-box-outline" />}
        style={styles.accordion}
      >
        <DrawerItem
          label="Partidos"
          focused={activeRouteName === matchesRoute}
          onPress={() => navigation.navigate(matchesRoute as never)}
          icon={({ color, size }) => <List.Icon icon="soccer" color={color} style={{ width: size }} />}
          style={styles.subItem}
        />
        <DrawerItem
          label="Tabla de Jugadores"
          focused={activeRouteName === 'PlayersTable'}
          onPress={() => navigation.navigate('PlayersTable')}
          icon={({ color, size }) => <List.Icon icon="account-group" color={color} style={{ width: size }} />}
          style={styles.subItem}
        />
        <DrawerItem
          label="Tabla de Porteros"
          focused={activeRouteName === 'GoalkeepersTable'}
          onPress={() => navigation.navigate('GoalkeepersTable')}
          icon={({ color, size }) => <List.Icon icon="hand-back-right" color={color} style={{ width: size }} />}
          style={styles.subItem}
        />
        {canShowTeamStandings && (
          <DrawerItem
            label="Tabla de Equipos"
            focused={activeRouteName === 'TeamStandings'}
            onPress={() => navigation.navigate('TeamStandings')}
            icon={({ color, size }) => <List.Icon icon="shield-star" color={color} style={{ width: size }} />}
            style={styles.subItem}
          />
        )}
      </List.Accordion>

      <List.Accordion
        title="Gestión"
        expanded={manageOpen}
        onPress={() => setManageOpen(prev => !prev)}
        left={props => <List.Icon {...props} icon="cog-outline" />}
        style={styles.accordion}
      >
        <DrawerItem
          label="Mi Perfil"
          focused={activeRouteName === 'Profile'}
          onPress={() => navigation.navigate('Profile')}
          icon={({ color, size }) => <List.Icon icon="account-circle-outline" color={color} style={{ width: size }} />}
          style={styles.subItem}
        />
        <DrawerItem
          label="Invitaciones"
          focused={activeRouteName === 'Invitations'}
          onPress={() => navigation.navigate('Invitations')}
          icon={({ color, size }) => <List.Icon icon="email-multiple-outline" color={color} style={{ width: size }} />}
          style={styles.subItem}
        />
        {isAdmin && (
          <DrawerItem
            label="Administrar Grupo"
            focused={activeRouteName === 'Admin'}
            onPress={() => navigation.navigate('Admin')}
            icon={({ color, size }) => <List.Icon icon="cog" color={color} style={{ width: size }} />}
            style={styles.subItem}
          />
        )}
      </List.Accordion>

      <View style={styles.logoutWrap}>
        <Button
          mode="contained"
          onPress={onLogout}
          buttonColor={theme.colors.secondary}
          textColor={theme.colors.onSecondary}
          icon="logout"
        >
          Cerrar Sesión
        </Button>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 4,
  },
  headerTitle: {
    fontWeight: '700',
  },
  section: {
    marginBottom: 6,
  },
  accordion: {
    paddingHorizontal: 4,
  },
  subItem: {
    paddingLeft: 8,
  },
  logoutWrap: {
    marginTop: 18,
    paddingHorizontal: 16,
  },
});
