import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';

import type { AppDrawerParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectGroup } from '../features/groups/groupsSlice';
import AdminGroupSelectDialog from '../components/admin/AdminGroupSelectDialog';

type NavigableRoute = 'ManageMembers' | 'JoinRequests' | 'GroupSettings' | 'ManageTeams';

type AdminOption = {
  id: string;
  title: string;
  description: string;
  icon: 'account-plus' | 'account-group' | 'account-clock' | 'cog-outline' | 'shield-account';
  color: string;
  route: NavigableRoute;
};

export default function AdminScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { groups } = useAppSelector(state => state.groups);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const authUserId = firebaseUser?.uid ?? null;

  const [pendingRoute, setPendingRoute] = useState<NavigableRoute | null>(null);

  const adminOptions: AdminOption[] = [
    {
      id: 'manage-members',
      title: 'Gestionar Miembros',
      description: 'Invitar o desvincular miembros del grupo',
      icon: 'account-group',
      color: theme.colors.secondary,
      route: 'ManageMembers',
    },
    {
      id: 'join-requests',
      title: 'Solicitudes de Unión',
      description: 'Revisar y gestionar solicitudes de jugadores para unirse al grupo',
      icon: 'account-clock',
      color: theme.colors.primary,
      route: 'JoinRequests',
    },
  ];

  const hasTeamsGroups = groups.some(g => g.hasFixedTeams);

  // Filter groups shown in the dialog depending on the pending route
  const dialogGroups = useMemo(() => {
    if (pendingRoute === 'ManageTeams') return groups.filter(g => g.hasFixedTeams);
    return groups;
  }, [pendingRoute, groups]);

  const dialogTitle = useMemo(() => {
    switch (pendingRoute) {
      case 'ManageMembers': return 'Gestionar Miembros';
      case 'JoinRequests': return 'Solicitudes de Unión';
      case 'GroupSettings': return 'Configuración del grupo';
      case 'ManageTeams': return 'Administrar Equipos';
      default: return 'Seleccionar grupo';
    }
  }, [pendingRoute]);

  const handleGroupSelect = useCallback(
    (groupId: string) => {
      if (!pendingRoute || !authUserId) return;
      const route = pendingRoute;
      dispatch(selectGroup({ userId: authUserId, groupId }));
      setPendingRoute(null);
      setTimeout(() => navigation.navigate(route), 150);
    },
    [pendingRoute, authUserId, dispatch, navigation],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Icon name="cog" size={32} color={theme.colors.primary} />
        <Text variant="headlineSmall" style={styles.headerTitle}>
          Administración
        </Text>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          Gestiona jugadores, miembros y configuraciones de tus grupos
        </Text>
      </View>

      {adminOptions.map(option => (
        <Card
          key={option.id}
          style={styles.optionCard}
          onPress={() => setPendingRoute(option.route)}
        >
          <Card.Content style={styles.cardContent}>
            <View style={[styles.iconContainer, { backgroundColor: option.color }]}>
              <Icon name={option.icon} size={32} color="#FFFFFF" />
            </View>
            <View style={styles.textContainer}>
              <Text variant="titleMedium" style={styles.optionTitle}>
                {option.title}
              </Text>
              <Text variant="bodyMedium" style={styles.optionDescription}>
                {option.description}
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
          </Card.Content>
        </Card>
      ))}

      {hasTeamsGroups && (
        <Card
          style={styles.optionCard}
          onPress={() => setPendingRoute('ManageTeams')}
        >
          <Card.Content style={styles.cardContent}>
            <View style={[styles.iconContainer, { backgroundColor: theme.colors.tertiary ?? theme.colors.secondary }]}>
              <Icon name="shield-account" size={32} color="#FFFFFF" />
            </View>
            <View style={styles.textContainer}>
              <Text variant="titleMedium" style={styles.optionTitle}>
                Administrar Equipos
              </Text>
              <Text variant="bodyMedium" style={styles.optionDescription}>
                Crear y editar los equipos fijos del grupo
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
          </Card.Content>
        </Card>
      )}

      <AdminGroupSelectDialog
        visible={pendingRoute !== null}
        title={dialogTitle}
        groups={dialogGroups}
        onSelect={handleGroupSelect}
        onDismiss={() => setPendingRoute(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#666',
    textAlign: 'center',
  },
  optionCard: {
    marginBottom: 12,
    borderRadius: 12,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontWeight: 'bold',
  },
  optionDescription: {
    color: '#666',
    fontSize: 13,
  },
});
