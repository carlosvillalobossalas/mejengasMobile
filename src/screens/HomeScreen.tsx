import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useAppSelector } from '../app/hooks';

export default function HomeScreen() {
  const { groups, selectedGroupId } = useAppSelector(state => state.groups);
  const activeGroupName =
    groups.find(g => g.id === selectedGroupId)?.name ?? '—';

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall">Inicio</Text>
      <Text variant="bodyMedium">Grupo activo: {activeGroupName}</Text>
      <Text variant="bodyMedium">Próximamente…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 8,
  },
});
