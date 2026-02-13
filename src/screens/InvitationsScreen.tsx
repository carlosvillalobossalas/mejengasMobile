import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
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
import {
  getInvitesWithGroupInfo,
  type InviteWithGroup,
} from '../endpoints/invites/invitesEndpoints';

export default function InvitationsScreen() {
  const theme = useTheme();
  const { firestoreUser } = useAppSelector(state => state.auth);

  const [invites, setInvites] = useState<InviteWithGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInvites = async () => {
      if (!firestoreUser?.email) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = await getInvitesWithGroupInfo(firestoreUser.email);
        setInvites(data);
      } catch (err) {
        console.error('Error loading invites:', err);
        setError('Error al cargar las invitaciones');
      } finally {
        setIsLoading(false);
      }
    };

    loadInvites();
  }, [firestoreUser?.email]);

  const handleAccept = (inviteId: string) => {
    console.log('Accept invite:', inviteId);
    // TODO: Implementar funcionalidad
  };

  const handleReject = (inviteId: string) => {
    console.log('Reject invite:', inviteId);
    // TODO: Implementar funcionalidad
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

      {invites.map((invite, index) => {
        const groupName = invite.group?.name || 'Grupo desconocido';

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
                >
                  Aceptar
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => handleReject(invite.id)}
                  style={styles(theme).rejectButton}
                  icon="close"
                  textColor={theme.colors.error}
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
