import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';

import type { AppDrawerParamList } from '../navigation/types';
import { useAppSelector } from '../app/hooks';

type AdminOption = {
  id: string;
  title: string;
  description: string;
  icon: 'soccer' | 'account-plus' | 'link-variant';
  color: string;
  onPress: () => void;
};

export default function AdminScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  const adminOptions: AdminOption[] = [
    {
      id: 'add-match',
      title: 'Agregar Partido',
      description: 'Registrar un nuevo partido con alineaciones y resultados',
      icon: 'soccer',
      color: '#4CAF50',
      onPress: () => navigation.navigate('AddMatch'),
    },
    {
      id: 'add-player',
      title: 'Agregar Jugador',
      description: 'Añadir un nuevo jugador al grupo',
      icon: 'account-plus',
      color: '#2196F3',
      onPress: () => navigation.navigate('AddPlayer'),
    },
    {
      id: 'link-players',
      title: 'Enlazar Jugadores',
      description: 'Conectar jugadores con cuentas de usuario',
      icon: 'link-variant',
      color: '#FF9800',
      onPress: () => console.log('Link players'),
    },
  ];

  if (!selectedGroupId) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles.errorText}>
          No hay grupo seleccionado
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Icon name="cog" size={32} color={theme.colors.primary} />
        <Text variant="headlineSmall" style={styles.headerTitle}>
          Administración de Grupo
        </Text>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          Gestiona jugadores, partidos y configuraciones
        </Text>
      </View>

      {adminOptions.map(option => (
        <Card
          key={option.id}
          style={styles.optionCard}
          onPress={option.onPress}
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
            <Icon
              name="chevron-right"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          </Card.Content>
        </Card>
      ))}
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  errorText: {
    marginTop: 16,
    textAlign: 'center',
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
