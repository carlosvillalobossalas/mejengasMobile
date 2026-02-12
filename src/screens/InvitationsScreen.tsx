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
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Cargando invitaciones...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (invites.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="email-check" size={64} color={theme.colors.onSurfaceDisabled} />
        <Text style={styles.emptyTitle}>No tienes invitaciones</Text>
        <Text style={styles.emptySubtitle}>
          Cuando alguien te invite a un grupo, aparecerá aquí
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Icon name="email-multiple" size={32} color={theme.colors.primary} />
        <Text style={styles.headerTitle}>Invitaciones Pendientes</Text>
        <Text style={styles.headerSubtitle}>
          Tienes {invites.length} {invites.length === 1 ? 'invitación' : 'invitaciones'}
        </Text>
      </View>

      {invites.map((invite, index) => {
        const groupName = invite.group?.name || 'Grupo desconocido';

        return (
          <Card key={invite.id} style={styles.inviteCard}>
            <Card.Content>
              <View style={styles.inviteHeader}>
                <View style={styles.groupIcon}>
                  <Icon name="account-group" size={24} color={theme.colors.primary} />
                </View>
                <View style={styles.inviteInfo}>
                  <Text style={styles.groupName}>{groupName}</Text>
                  <View style={styles.inviterRow}>
                    <Icon name="account" size={16} color="#757575" />
                    <Text style={styles.inviterText}>
                      Invitado por {invite.invitedByName}
                    </Text>
                  </View>
                </View>
              </View>

              <Divider style={styles.divider} />

              <View style={styles.actions}>
                <Button
                  mode="contained"
                  onPress={() => handleAccept(invite.id)}
                  style={styles.acceptButton}
                  icon="check"
                  buttonColor="#4CAF50"
                >
                  Aceptar
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => handleReject(invite.id)}
                  style={styles.rejectButton}
                  icon="close"
                  textColor="#F44336"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
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
    color: '#F44336',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  header: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#757575',
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
    backgroundColor: '#E3F2FD',
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
    color: '#757575',
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
    borderColor: '#F44336',
  },
});
