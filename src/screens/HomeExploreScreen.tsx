import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text, Button, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';

import type { AppDrawerParamList } from '../navigation/types';

export default function HomeExploreScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="titleLarge" style={styles.title}>Explorar</Text>
      <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Descubre nuevas oportunidades para jugar. Esta sección crecerá en próximas versiones.
      </Text>

      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.row}>
            <Icon name="soccer-field" size={22} color={theme.colors.primary} />
            <Text variant="titleMedium">Partidos públicos buscando jugadores</Text>
          </View>
          <Text style={[styles.helper, { color: theme.colors.onSurfaceVariant }]}>Próximamente podrás ver y unirte a partidos abiertos.</Text>
          <Button mode="outlined" icon="clock-outline" disabled>
            Próximamente
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.row}>
            <Icon name="account-search-outline" size={22} color={theme.colors.primary} />
            <Text variant="titleMedium">Jugadores buscando partido</Text>
          </View>
          <Text style={[styles.helper, { color: theme.colors.onSurfaceVariant }]}>Próximamente podrás encontrar jugadores disponibles por zona o nivel.</Text>
          <Button mode="outlined" icon="clock-outline" disabled>
            Próximamente
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.row}>
            <Icon name="account-group" size={22} color={theme.colors.primary} />
            <Text variant="titleMedium">Gestionar mis grupos</Text>
          </View>
          <Text style={[styles.helper, { color: theme.colors.onSurfaceVariant }]}>Puedes cambiar de grupo o explorar grupos públicos.</Text>
          <Button mode="contained" buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} onPress={() => navigation.navigate('Groups')}>
            Ir a Grupos
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontWeight: '700' },
  subtitle: { marginBottom: 4 },
  card: { borderRadius: 14, backgroundColor: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  helper: { marginBottom: 12 },
});
