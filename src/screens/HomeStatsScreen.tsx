import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text, Button, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';

import { useAppDispatch, useAppSelector } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';
import { selectGroup } from '../features/groups/groupsSlice';
import TableGroupSelectDialog from '../components/homeStats/TableGroupSelectDialog';

type TableType = 'PlayersTable' | 'GoalkeepersTable' | 'TeamStandings';

export default function HomeStatsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { groups } = useAppSelector(state => state.groups);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const currentUser = useAppSelector(state => state.auth.firestoreUser);
  const authUserId = firebaseUser?.uid ?? currentUser?.uid ?? null;

  const [pendingTable, setPendingTable] = useState<TableType | null>(null);

  const handleOpenTable = useCallback((tableType: TableType) => {
    setPendingTable(tableType);
  }, []);

  const handleGroupSelect = useCallback(
    (groupId: string) => {
      if (!authUserId || !pendingTable) return;
      const route = pendingTable;
      dispatch(selectGroup({ userId: authUserId, groupId }));
      setPendingTable(null);
      // Small delay to let Redux update before the screen reads selectedGroupId
      setTimeout(() => navigation.navigate(route), 150);
    },
    [authUserId, pendingTable, dispatch, navigation],
  );

  const handleDismissDialog = useCallback(() => {
    setPendingTable(null);
  }, []);

  // Show TeamStandings only if there are groups with fixed teams
  const hasTeamsGroups = groups.some(g => g.hasFixedTeams);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="titleLarge" style={styles.title}>Estadísticas</Text>
      <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Accede rápido a tablas y resultados.
      </Text>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}>
            <Icon name="soccer" size={22} color={theme.colors.primary} />
            <Text variant="titleMedium">Partidos</Text>
          </View>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onSecondary}
            onPress={() => navigation.navigate('MyMatches')}
          >
            Ver partidos
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}>
            <Icon name="account-group" size={22} color={theme.colors.primary} />
            <Text variant="titleMedium">Tabla de Jugadores</Text>
          </View>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onSecondary}
            onPress={() => handleOpenTable('PlayersTable')}
          >
            Abrir tabla
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}>
            <Icon name="hand-back-right" size={22} color={theme.colors.primary} />
            <Text variant="titleMedium">Tabla de Porteros</Text>
          </View>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onSecondary}
            onPress={() => handleOpenTable('GoalkeepersTable')}
          >
            Abrir tabla
          </Button>
        </Card.Content>
      </Card>

      {hasTeamsGroups && (
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Icon name="shield-star" size={22} color={theme.colors.primary} />
              <Text variant="titleMedium">Tabla de Equipos</Text>
            </View>
            <Button
              mode="contained"
              buttonColor={theme.colors.secondary}
              textColor={theme.colors.onSecondary}
              onPress={() => handleOpenTable('TeamStandings')}
            >
              Abrir tabla
            </Button>
          </Card.Content>
        </Card>
      )}

      <TableGroupSelectDialog
        visible={pendingTable !== null}
        tableType={pendingTable}
        groups={groups}
        onSelect={handleGroupSelect}
        onDismiss={handleDismissDialog}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontWeight: '700' },
  subtitle: { marginBottom: 4 },
  card: { borderRadius: 14, backgroundColor: '#FFFFFF' },
  cardContent: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
