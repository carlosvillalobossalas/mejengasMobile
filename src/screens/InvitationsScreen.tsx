import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
  Divider,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { useAppSelector } from '../app/hooks';
import { type InviteWithGroup } from '../endpoints/invites/invitesEndpoints';
import { getGroupsByIds } from '../repositories/groups/groupsRepository';
import {
  acceptInvite,
  rejectInvite,
  subscribeToInvitesByEmail,
} from '../repositories/invites/invitesRepository';

export default function InvitationsScreen() {
  const theme = useTheme();
  const { firestoreUser } = useAppSelector(state => state.auth);

  const [invites, setInvites] = useState<InviteWithGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);

  useEffect(() => {
    if (!firestoreUser?.email) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Subscribe to pending invites — auto-updates when status changes
    const unsubscribe = subscribeToInvitesByEmail(
      firestoreUser.email,
      async rawInvites => {
        try {
          if (rawInvites.length === 0) {
            setInvites([]);
            return;
          }
          const groupIds = [...new Set(rawInvites.map(i => i.groupId))];
          const groupsMap = await getGroupsByIds(groupIds);
          setInvites(rawInvites.map(inv => ({ ...inv, group: groupsMap.get(inv.groupId) ?? null })));
        } catch (err) {
          console.error('Error enriching invites with group info:', err);
          setError('Error al cargar las invitaciones');
        } finally {
          setIsLoading(false);
        }
      },
      err => {
        console.error('Invite subscription error:', err);
        setError('Error al cargar las invitaciones');
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [firestoreUser?.email]);

  // Reload after accept/reject to let the snapshot update handle the UI
  const reloadAfterAction = () => {
    // No-op: the onSnapshot listener automatically reflects status changes
  };

  const handleAccept = (inviteId: string) => {
    const invite = invites.find(i => i.id === inviteId);
    if (!invite) return;

    Alert.alert(
      'Aceptar Invitación',
      `¿Deseas unirte al grupo "${invite.group?.name || 'Grupo'}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar',
          onPress: async () => {
            if (!firestoreUser?.uid || !firestoreUser?.email) {
              Alert.alert('Error', 'No se pudo obtener la información del usuario');
              return;
            }

            setProcessingInviteId(inviteId);
            try {
              await acceptInvite(
                inviteId,
                firestoreUser.uid,
                firestoreUser.email.trim().toLowerCase(),
              );
              Alert.alert('Éxito', `Te has unido al grupo "${invite.group?.name || 'Grupo'}"`);
              reloadAfterAction();
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'No se pudo aceptar la invitación';
              Alert.alert('Error', msg);
            } finally {
              setProcessingInviteId(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = (inviteId: string) => {
    const invite = invites.find(i => i.id === inviteId);
    if (!invite) return;

    Alert.alert(
      'Rechazar Invitación',
      `¿Estás seguro que deseas rechazar la invitación al grupo "${invite.group?.name || 'Grupo'}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            setProcessingInviteId(inviteId);
            try {
              await rejectInvite(inviteId);
              Alert.alert('Éxito', 'Invitación rechazada');
              reloadAfterAction();
            } catch (error) {
              console.error('Error rejecting invite:', error);
              Alert.alert('Error', 'No se pudo rechazar la invitación');
            } finally {
              setProcessingInviteId(null);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles(theme).loadingText}>Cargando invitaciones...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text style={styles(theme).errorText}>{error}</Text>
      </View>
    );
  }

  if (invites.length === 0) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="email-check" size={64} color={theme.colors.onSurfaceDisabled} />
        <Text style={styles(theme).emptyTitle}>No tienes invitaciones</Text>
        <Text style={styles(theme).emptySubtitle}>
          Cuando alguien te invite a un grupo, aparecerá aquí
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles(theme).container}>
      <View style={styles(theme).header}>
        <Icon name="email-multiple" size={32} color={theme.colors.primary} />
        <Text style={styles(theme).headerTitle}>Invitaciones Pendientes</Text>
        <Text style={styles(theme).headerSubtitle}>
          Tienes {invites.length} {invites.length === 1 ? 'invitación' : 'invitaciones'}
        </Text>
      </View>

      {invites.map((invite) => {
        const groupName = invite.group?.name || 'Grupo desconocido';
        const isProcessing = processingInviteId === invite.id;

        return (
          <Card key={invite.id} style={styles(theme).inviteCard}>
            <Card.Content>
              <View style={styles(theme).inviteHeader}>
                <View style={styles(theme).groupIcon}>
                  <Icon name="account-group" size={24} color={theme.colors.primary} />
                </View>
                <View style={styles(theme).inviteInfo}>
                  <Text style={styles(theme).groupName}>{groupName}</Text>
                  <View style={styles(theme).inviterRow}>
                    <Icon name="account" size={16} color={theme.colors.onSurfaceVariant} />
                    <Text style={styles(theme).inviterText}>
                      Invitado por {invite.invitedByName}
                    </Text>
                  </View>
                </View>
              </View>

              <Divider style={styles(theme).divider} />

              <View style={styles(theme).actions}>
                <Button
                  mode="contained"
                  onPress={() => handleAccept(invite.id)}
                  style={styles(theme).acceptButton}
                  icon="check"
                  buttonColor={theme.colors.secondary}
                  disabled={isProcessing}
                  loading={isProcessing}
                >
                  Aceptar
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => handleReject(invite.id)}
                  style={styles(theme).rejectButton}
                  icon="close"
                  textColor={theme.colors.error}
                  disabled={isProcessing}
                >
                  Rechazar
                </Button>
              </View>
            </Card.Content>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    color: theme.colors.error,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  header: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  inviteCard: {
    margin: 12,
    marginTop: 8,
    elevation: 2,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  inviteInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  inviterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inviterText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  divider: {
    marginVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
  },
  rejectButton: {
    flex: 1,
    borderColor: theme.colors.error,
  },
});
