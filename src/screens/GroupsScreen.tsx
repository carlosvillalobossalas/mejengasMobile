import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Divider,
  HelperText,
  Text,
  ActivityIndicator,
} from 'react-native-paper';

import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectGroup } from '../features/groups/groupsSlice';
import { getUserById } from '../repositories/users/usersRepository';
import { subscribeToGroupsForUser, type Group } from '../repositories/groups/groupsRepository';

export default function GroupsScreen() {
  const dispatch = useAppDispatch();
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [groups, setGroupsLocal] = useState<Group[]>([]);

  const userId = useAppSelector(state => state.auth.firebaseUser?.uid ?? null);
  const { selectedGroupId } = useAppSelector(state => state.groups);
  const reduxGroups = useAppSelector(state => state.groups.groups);

  const selectedGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  // Initialize groups from Redux
  useEffect(() => {
    if (reduxGroups.length > 0 && groups.length === 0) {
      setGroupsLocal(reduxGroups);
    }
  }, [reduxGroups, groups.length]);

  useEffect(() => {
    if (!userId) return;

    // Subscribe to real-time updates of groups
    const unsubscribe = subscribeToGroupsForUser(userId, (groupsData) => {
      setGroupsLocal(groupsData);
    });

    return () => {
      unsubscribe();
    };
  }, [userId]);

  // Fetch owner names for all groups
  useEffect(() => {
    const fetchOwners = async () => {
      const ownerIds = [...new Set(groups.map(g => g.ownerId).filter(Boolean))];
      const ownersMap: Record<string, string> = {};

      for (const ownerId of ownerIds) {
        try {
          const owner = await getUserById(ownerId);
          if (owner) {
            ownersMap[ownerId] = owner.displayName || owner.email || 'Usuario';
          }
        } catch (error) {
          console.error('Error fetching owner:', error);
        }
      }

      setOwners(ownersMap);
    };

    if (groups.length > 0) {
      fetchOwners();
    }
  }, [groups]);

  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const onSelectGroup = (groupId: string) => {
    if (!userId) return;
    dispatch(selectGroup({ userId, groupId }));
  };

  return (
    <View style={styles.container}>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text variant="bodyMedium" style={styles.loadingText}>
            Cargando grupos…
          </Text>
        </View>
      ) : null}

      {error ? (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      ) : null}

      {groups.length === 0 && !isLoading ? (
        <Card style={styles.emptyCard}>
          <Card.Content>
            <Text variant="titleMedium">No tenés grupos todavía</Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Pedí acceso a un grupo o creá uno desde la consola/admin.
            </Text>
          </Card.Content>
        </Card>
      ) : null}

      {groups.map(group => {
        const isSelected = group.id === selectedGroupId;
        const ownerName = group.ownerId ? owners[group.ownerId] || 'Cargando...' : 'Desconocido';

        return (
          <Card key={group.id} style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={styles.textContainer}>
                  <Text variant="titleMedium" style={styles.groupName}>
                    {group.name}
                  </Text>
                  
                  {group.description ? (
                    <Text variant="bodySmall" style={styles.description}>
                      {group.description}
                    </Text>
                  ) : null}

                  <Text variant="labelSmall" style={styles.ownerText}>
                    Dueño: {ownerName}
                  </Text>
                </View>

                <Button
                  mode={isSelected ? 'contained' : 'elevated'}
                  onPress={() => onSelectGroup(group.id)}
                  compact
                >
                  {isSelected ? 'Seleccionado' : 'Seleccionar'}
                </Button>
              </View>
            </Card.Content>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    opacity: 0.75,
  },
  emptyCard: {
    borderRadius: 12,
  },
  emptyText: {
    opacity: 0.6,
    marginTop: 4,
  },
  card: {
    borderRadius: 8,
    elevation: 1,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  groupName: {
    fontWeight: '600',
  },
  description: {
    opacity: 0.7,
    lineHeight: 18,
  },
  ownerText: {
    opacity: 0.5,
    marginTop: 2,
  },
});
