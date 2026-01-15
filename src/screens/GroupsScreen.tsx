import React, { useEffect, useMemo } from 'react';
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
import { fetchMyGroups, setSelectedGroupId } from '../features/groups/groupsSlice';

export default function GroupsScreen() {
  const dispatch = useAppDispatch();

  const userId = useAppSelector(state => state.auth.firebaseUser?.uid ?? null);
  const { status, error, groups, selectedGroupId } = useAppSelector(
    state => state.groups,
  );

  const selectedGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  useEffect(() => {
    if (!userId) return;
    if (status === 'loading') return;
    if (groups.length > 0) return;

    dispatch(fetchMyGroups({ userId }));
  }, [dispatch, groups.length, status, userId]);

  const onReload = () => {
    if (!userId) return;
    dispatch(fetchMyGroups({ userId }));
  };

  const onSelectGroup = (groupId: string) => {
    dispatch(setSelectedGroupId(groupId));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineSmall">Grupos</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Seleccioná el grupo con el que querés trabajar.
        </Text>
        {selectedGroup ? (
          <Text variant="labelLarge">Activo: {selectedGroup.name}</Text>
        ) : (
          <Text variant="labelLarge">Activo: —</Text>
        )}
      </View>

      <Divider />

      {status === 'loading' ? (
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

      <View style={styles.actionsRow}>
        <Button mode="outlined" onPress={onReload} disabled={!userId || status === 'loading'}>
          Recargar
        </Button>
      </View>

      {groups.length === 0 && status !== 'loading' ? (
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium">No tenés grupos todavía</Text>
            <Text variant="bodyMedium" style={styles.muted}>
              Pedí acceso a un grupo o creá uno desde la consola/admin.
            </Text>
          </Card.Content>
        </Card>
      ) : null}

      {groups.map(group => {
        const isSelected = group.id === selectedGroupId;

        return (
          <Card key={group.id} style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">{group.name}</Text>
              {group.description ? (
                <Text variant="bodyMedium" style={styles.muted}>
                  {group.description}
                </Text>
              ) : null}

              <View style={styles.metaRow}>
                <Text variant="labelSmall" style={styles.meta}>
                  Tipo: {group.type || '—'}
                </Text>
                <Text variant="labelSmall" style={styles.meta}>
                  Visibilidad: {group.visibility || '—'}
                </Text>
              </View>

              <View style={styles.cardActions}>
                <Button
                  mode={isSelected ? 'contained' : 'outlined'}
                  onPress={() => onSelectGroup(group.id)}
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
  header: {
    gap: 4,
  },
  subtitle: {
    opacity: 0.75,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
  card: {
    borderRadius: 12,
  },
  cardContent: {
    gap: 8,
  },
  muted: {
    opacity: 0.75,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  meta: {
    opacity: 0.75,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
