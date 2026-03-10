import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text, Button, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';

import { useAppSelector } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';

export default function HomeManageScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { groups, selectedGroupId } = useAppSelector(state => state.groups);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const currentUser = useAppSelector(state => state.auth.firestoreUser);

  const authUserId = firebaseUser?.uid ?? currentUser?.uid ?? null;
  const activeGroup = useMemo(
    () => groups.find(group => group.id === selectedGroupId),
    [groups, selectedGroupId],
  );
  const canAdmin = Boolean(activeGroup && authUserId && activeGroup.ownerId === authUserId);

  const openApplications = () => {
    navigation.navigate('PublicMatchApplications');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="titleLarge" style={styles.title}>Gestión</Text>
      <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Configuración y accesos de cuenta/grupo.</Text>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}><Icon name="account-circle" size={22} color={theme.colors.primary} /><Text variant="titleMedium">Mi Perfil</Text></View>
          <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onSecondary} onPress={() => navigation.navigate('Profile')}>Abrir perfil</Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}><Icon name="email-multiple" size={22} color={theme.colors.primary} /><Text variant="titleMedium">Invitaciones</Text></View>
          <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onSecondary} onPress={() => navigation.navigate('Invitations')}>Ver invitaciones</Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}><Icon name="account-group" size={22} color={theme.colors.primary} /><Text variant="titleMedium">Grupos</Text></View>
          <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onSecondary} onPress={() => navigation.navigate('Groups')}>Gestionar grupos</Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}>
            <Icon name="account-check-outline" size={22} color={theme.colors.primary} />
            <Text variant="titleMedium">Postulaciones recibidas (grupo activo)</Text>
          </View>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onSecondary}
            onPress={openApplications}
          >
            Ver postulaciones
          </Button>
        </Card.Content>
      </Card>

      {canAdmin && (
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}><Icon name="cog" size={22} color={theme.colors.primary} /><Text variant="titleMedium">Administrar Grupo</Text></View>
            <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onSecondary} onPress={() => navigation.navigate('Admin')}>Abrir administración</Button>
          </Card.Content>
        </Card>
      )}
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
