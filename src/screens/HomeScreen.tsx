import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text variant="headlineSmall">Inicio</Text>
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
