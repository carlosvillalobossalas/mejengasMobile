import React, { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View, TouchableOpacity } from 'react-native';
import { Card, Text, Button, useTheme, Portal } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';

import { useAppDispatch, useAppSelector } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';
import { selectGroup } from '../features/groups/groupsSlice';
import type { Group } from '../repositories/groups/groupsRepository';

export default function HomeStatsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const currentUser = useAppSelector(state => state.auth.firestoreUser);

  const activeGroup = groups.find(group => group.id === selectedGroupId);
  const activeGroupName = activeGroup?.name ?? 'Sin grupo activo';
  const authUserId = firebaseUser?.uid ?? currentUser?.uid ?? null;
  const groupSwitcherRef = useRef<BottomSheet | null>(null);

  const handleSwitchGroup = useCallback(
    (groupId: string) => {
      if (!authUserId) return;
      dispatch(selectGroup({ userId: authUserId, groupId }));
      groupSwitcherRef.current?.close();
    },
    [authUserId, dispatch],
  );

  const renderGroupBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  const goToMatches = () => {
    navigation.navigate('MyMatches');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="titleLarge" style={styles.title}>Estadísticas</Text>
      <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Accede rápido a tablas y resultados.</Text>
      <View style={styles.groupContextRow}>
        <Text variant="labelLarge" style={[styles.groupContext, { color: theme.colors.primary }]}>Grupo activo: {activeGroupName}</Text>
        <Button compact mode="text" onPress={() => groupSwitcherRef.current?.expand()}>
          Cambiar grupo
        </Button>
      </View>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}><Icon name="soccer" size={22} color={theme.colors.primary} /><Text variant="titleMedium">Partidos</Text></View>
          <Button mode="contained" buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} onPress={goToMatches}>Ver partidos</Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}><Icon name="account-group" size={22} color={theme.colors.primary} /><Text variant="titleMedium">Tabla de Jugadores</Text></View>
          <Button mode="contained" buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} onPress={() => navigation.navigate('PlayersTable')}>Abrir tabla</Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}><Icon name="hand-back-right" size={22} color={theme.colors.primary} /><Text variant="titleMedium">Tabla de Porteros</Text></View>
          <Button mode="contained" buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} onPress={() => navigation.navigate('GoalkeepersTable')}>Abrir tabla</Button>
        </Card.Content>
      </Card>

      {activeGroup?.hasFixedTeams && (
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}><Icon name="shield-star" size={22} color={theme.colors.primary} /><Text variant="titleMedium">Tabla de Equipos</Text></View>
            <Button mode="contained" buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} onPress={() => navigation.navigate('TeamStandings')}>Abrir tabla</Button>
          </Card.Content>
        </Card>
      )}

      <Portal>
        <BottomSheet
          ref={groupSwitcherRef}
          index={-1}
          snapPoints={['50%']}
          enablePanDownToClose
          backdropComponent={renderGroupBackdrop}
        >
          <View style={styles.groupSheetContent}>
            <Text variant="titleMedium" style={styles.groupSheetTitle}>Cambiar Grupo</Text>
            <BottomSheetFlatList
              data={groups}
              keyExtractor={(item: Group) => item.id}
              renderItem={({ item }: { item: Group }) => {
                const isSelected = item.id === selectedGroupId;
                return (
                  <TouchableOpacity style={styles.groupSheetItem} onPress={() => handleSwitchGroup(item.id)}>
                    <View style={styles.groupSheetItemInfo}>
                      <Text variant="titleSmall" style={[styles.groupSheetItemName, isSelected && { color: theme.colors.primary }]}>
                        {item.name}
                      </Text>
                      {item.description ? (
                        <Text variant="bodySmall" style={styles.groupSheetItemDesc} numberOfLines={1}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected && <Icon name="check-circle" size={22} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </BottomSheet>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontWeight: '700' },
  subtitle: { marginBottom: 4 },
  groupContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupContext: { fontWeight: '700', marginBottom: 2 },
  card: { borderRadius: 14, backgroundColor: '#FFFFFF' },
  cardContent: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupSheetContent: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  groupSheetTitle: { textAlign: 'center', marginBottom: 12, fontWeight: 'bold' },
  groupSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  groupSheetItemInfo: { flex: 1 },
  groupSheetItemName: { fontWeight: '600' },
  groupSheetItemDesc: { color: '#888', marginTop: 2 },
});
