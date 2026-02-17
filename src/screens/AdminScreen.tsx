import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import { Card, Text, useTheme, Portal, Modal, TextInput, Button } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';

import type { AppDrawerParamList } from '../navigation/types';
import { useAppSelector } from '../app/hooks';
import { createInvite } from '../repositories/invites/invitesRepository';

type AdminOption = {
  id: string;
  title: string;
  description: string;
  icon: 'soccer' | 'account-plus' | 'link-variant' | 'email-plus';
  color: string;
  onPress: () => void;
};

export default function AdminScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const currentUser = useAppSelector(state => state.auth.firestoreUser);
  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Error', 'Por favor ingresa un correo electrónico');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      Alert.alert('Error', 'Por favor ingresa un correo electrónico válido');
      return;
    }

    if (!selectedGroupId || !selectedGroup || !currentUser) {
      Alert.alert('Error', 'No se pudo obtener la información necesaria');
      return;
    }

    setIsSending(true);
    try {
      await createInvite(
        inviteEmail.trim().toLowerCase(),
        selectedGroupId,
        selectedGroup.name,
        currentUser.uid,
        currentUser.displayName || currentUser.email || 'Usuario',
      );
      
      Alert.alert('Éxito', 'Invitación enviada correctamente');
      setInviteEmail('');
      setShowInviteModal(false);
    } catch (error) {
      console.error('Error sending invite:', error);
      const errorMessage = error instanceof Error ? error.message : 'No se pudo enviar la invitación';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const adminOptions: AdminOption[] = [
    {
      id: 'add-match',
      title: 'Agregar Partido',
      description: 'Registrar un nuevo partido con alineaciones y resultados',
      icon: 'soccer',
      color: theme.colors.primary,
      onPress: () => navigation.navigate('AddMatch'),
    },
    {
      id: 'add-player',
      title: 'Agregar Jugador',
      description: 'Añadir un nuevo jugador al grupo',
      icon: 'account-plus',
      color: theme.colors.secondary,
      onPress: () => navigation.navigate('AddPlayer'),
    },
    {
      id: 'link-players',
      title: 'Enlazar Jugadores',
      description: 'Conectar jugadores con cuentas de usuario',
      icon: 'link-variant',
      color: theme.colors.primary,
      onPress: () => navigation.navigate('LinkPlayers'),
    },
    {
      id: 'invite-users',
      title: 'Invitar Usuarios',
      description: 'Enviar invitación para unirse al grupo',
      icon: 'email-plus',
      color: theme.colors.secondary,
      onPress: () => setShowInviteModal(true),
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
        {selectedGroup && (
          <Text variant="titleMedium" style={styles.groupName}>
            {selectedGroup.name}
          </Text>
        )}
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

      <Portal>
        <Modal
          visible={showInviteModal}
          onDismiss={() => {
            setShowInviteModal(false);
            setInviteEmail('');
          }}
          contentContainerStyle={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Icon name="email-plus" size={32} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.modalTitle}>
              Invitar Usuario
            </Text>
            <Text variant="bodyMedium" style={styles.modalSubtitle}>
              Envía una invitación para unirse a {selectedGroup?.name}
            </Text>
          </View>

          <TextInput
            label="Correo electrónico"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            disabled={isSending}
            style={styles.emailInput}
          />

          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={() => {
                setShowInviteModal(false);
                setInviteEmail('');
              }}
              disabled={isSending}
              style={styles.modalButton}
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              onPress={handleSendInvite}
              loading={isSending}
              disabled={isSending}
              style={styles.modalButton}
            >
              Enviar
            </Button>
          </View>
        </Modal>
      </Portal>
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
  groupName: {
    fontWeight: '600',
    color: '#333',
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
  modalContent: {
    backgroundColor: 'white',
    margin: 20,
    padding: 24,
    borderRadius: 12,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  modalTitle: {
    fontWeight: 'bold',
  },
  modalSubtitle: {
    color: '#666',
    textAlign: 'center',
  },
  emailInput: {
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
});
