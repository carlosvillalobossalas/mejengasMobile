import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  Divider,
  useTheme,
  MD3Theme,
  Portal,
  Modal,
  List,
  Searchbar,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { useAppSelector } from '../app/hooks';
import {
  getGroupMembersByGroupId,
  linkPlayerToMember,
  unlinkPlayerFromMember,
  type GroupMember,
} from '../repositories/groups/groupsRepository';
import { getAllPlayersByGroup, type Player } from '../repositories/players/playerSeasonStatsRepository';
import { getUserById, type User } from '../repositories/users/usersRepository';

type MemberWithUser = GroupMember & {
  userName?: string;
  userEmail?: string;
  linkedPlayerName?: string;
};

type PlayerWithLink = Player & {
  isLinked: boolean;
  linkedMemberName?: string;
};

export default function LinkPlayersScreen() {
  const theme = useTheme();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [players, setPlayers] = useState<PlayerWithLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<MemberWithUser | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedGroupId]);

  const loadData = async () => {
    if (!selectedGroupId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [membersData, playersData] = await Promise.all([
        getGroupMembersByGroupId(selectedGroupId),
        getAllPlayersByGroup(selectedGroupId),
      ]);

      // Load user info and linked player info for members
      const membersWithUserInfo = await Promise.all(
        membersData.map(async (member) => {
          try {
            const user = await getUserById(member.userId);
            let linkedPlayerName: string | undefined;
            
            if (member.playerId) {
              const player = playersData.find(p => p.id === member.playerId);
              linkedPlayerName = player?.originalName || player?.name;
            }
            
            return {
              ...member,
              userName: user?.displayName || undefined,
              userEmail: user?.email || undefined,
              linkedPlayerName,
            };
          } catch (error) {
            return member;
          }
        }),
      );

      // Mark players as linked or not
      const linkedPlayerIds = new Set(
        membersData.filter((m) => m.playerId).map((m) => m.playerId!),
      );

      const playersWithLinkStatus: PlayerWithLink[] = playersData.map((player) => {
        const linkedMember = membersWithUserInfo.find((m) => m.playerId === player.id) as MemberWithUser | undefined;
        return {
          ...player,
          isLinked: linkedPlayerIds.has(player.id),
          linkedMemberName: linkedMember ? (linkedMember.userName || linkedMember.userEmail) : undefined,
        };
      });

      setMembers(membersWithUserInfo);
      setPlayers(playersWithLinkStatus);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkPlayer = (member: MemberWithUser) => {
    setSelectedMember(member);
    setShowPlayerModal(true);
  };

  const handleUnlinkPlayer = (member: MemberWithUser) => {
    Alert.alert(
      'Desenlazar Jugador',
      `¿Estás seguro que deseas desenlazar el jugador de ${member.userName || member.userEmail}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desenlazar',
          style: 'destructive',
          onPress: async () => {
            setIsLinking(true);
            try {
              await unlinkPlayerFromMember(member.id);
              await loadData();
            } catch (error) {
              console.error('Error unlinking player:', error);
              Alert.alert('Error', 'No se pudo desenlazar el jugador');
            } finally {
              setIsLinking(false);
            }
          },
        },
      ],
    );
  };

  const handleConfirmLink = async (player: Player) => {
    if (!selectedMember) return;

    setIsLinking(true);
    setShowPlayerModal(false);

    try {
      await linkPlayerToMember(selectedMember.id, player.id);
      await loadData();
      Alert.alert('Éxito', 'Jugador enlazado correctamente');
    } catch (error) {
      console.error('Error linking player:', error);
      Alert.alert('Error', 'No se pudo enlazar el jugador');
    } finally {
      setIsLinking(false);
      setSelectedMember(null);
    }
  };

  const filteredPlayers = players.filter(
    (player) =>
      !player.isLinked &&
      (player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        player.originalName?.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  if (!selectedGroupId) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No hay grupo seleccionado
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>
          Cargando datos...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles(theme).container}>
      <View style={styles(theme).content}>
        {/* Members Section */}
        <View style={styles(theme).section}>
          <View style={styles(theme).sectionHeader}>
            <Icon name="account-group" size={24} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles(theme).sectionTitle}>
              Miembros del Grupo
            </Text>
          </View>
          <Text variant="bodySmall" style={styles(theme).sectionSubtitle}>
            Usuarios registrados en el grupo
          </Text>

          {members.length === 0 ? (
            <Card style={styles(theme).emptyCard}>
              <Card.Content>
                <Text style={styles(theme).emptyText}>No hay miembros</Text>
              </Card.Content>
            </Card>
          ) : (
            members.map((member) => (
              <Card key={member.id} style={styles(theme).card}>
                <Card.Content style={styles(theme).cardContent}>
                  <View style={styles(theme).memberInfo}>
                    <View style={styles(theme).memberDetails}>
                      <Text variant="titleMedium" style={styles(theme).memberName}>
                        {member.userName || member.userEmail || 'Usuario'}
                      </Text>
                      {member.userEmail && member.userName && (
                        <Text variant="bodySmall" style={styles(theme).memberEmail}>
                          {member.userEmail}
                        </Text>
                      )}
                      {member.linkedPlayerName && (
                        <Text variant="bodySmall" style={styles(theme).linkedPlayerText}>
                          Enlazado con: {member.linkedPlayerName}
                        </Text>
                      )}
                      <View style={styles(theme).chipContainer}>
                        <Chip
                          icon={member.playerId ? 'link' : 'link-off'}
                          style={[
                            styles(theme).statusChip,
                            member.playerId
                              ? styles(theme).linkedChip
                              : styles(theme).unlinkedChip,
                          ]}
                          textStyle={styles(theme).statusChipText}
                          compact
                        >
                          {member.playerId ? 'Enlazado' : 'Sin enlazar'}
                        </Chip>
                      </View>
                    </View>
                    <Button
                      mode={member.playerId ? 'outlined' : 'contained'}
                      onPress={() =>
                        member.playerId
                          ? handleUnlinkPlayer(member)
                          : handleLinkPlayer(member)
                      }
                      compact
                      disabled={isLinking}
                    >
                      {member.playerId ? 'Desenlazar' : 'Enlazar'}
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            ))
          )}
        </View>

        <Divider style={styles(theme).divider} />

        {/* Players Section */}
        <View style={styles(theme).section}>
          <View style={styles(theme).sectionHeader}>
            <Icon name="soccer" size={24} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles(theme).sectionTitle}>
              Jugadores Registrados
            </Text>
          </View>
          <Text variant="bodySmall" style={styles(theme).sectionSubtitle}>
            Registros de jugadores en el grupo
          </Text>

          {players.length === 0 ? (
            <Card style={styles(theme).emptyCard}>
              <Card.Content>
                <Text style={styles(theme).emptyText}>No hay jugadores</Text>
              </Card.Content>
            </Card>
          ) : (
            players.map((player) => (
              <Card key={player.id} style={styles(theme).card}>
                <Card.Content style={styles(theme).cardContent}>
                  <View style={styles(theme).playerInfo}>
                    <View style={styles(theme).playerDetails}>
                      <Text variant="titleMedium" style={styles(theme).playerName}>
                        {player.originalName}
                      </Text>
                      
                      <View style={styles(theme).chipContainer}>
                        <Chip
                          icon={player.isLinked ? 'link' : 'link-off'}
                          style={[
                            styles(theme).statusChip,
                            player.isLinked
                              ? styles(theme).linkedChip
                              : styles(theme).unlinkedChip,
                          ]}
                          textStyle={styles(theme).statusChipText}
                          compact
                        >
                          {player.isLinked
                            ? `Enlazado con ${player.linkedMemberName}`
                            : 'Sin enlazar'}
                        </Chip>
                      </View>
                    </View>
                  </View>
                </Card.Content>
              </Card>
            ))
          )}
        </View>
      </View>

      {/* Player Selection Modal */}
      <Portal>
        <Modal
          visible={showPlayerModal}
          onDismiss={() => setShowPlayerModal(false)}
          contentContainerStyle={styles(theme).modalContent}
        >
          <View style={styles(theme).modalHeader}>
            <Text variant="titleLarge" style={styles(theme).modalTitle}>
              Seleccionar Jugador
            </Text>
            <Text variant="bodyMedium" style={styles(theme).modalSubtitle}>
              Enlazar con: {selectedMember?.userName || selectedMember?.userEmail}
            </Text>
          </View>

          <Searchbar
            placeholder="Buscar jugador..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles(theme).searchBar}
          />

          <ScrollView style={styles(theme).modalList}>
            {filteredPlayers.length === 0 ? (
              <View style={styles(theme).emptyModalContent}>
                <Icon name="account-off" size={48} color={theme.colors.onSurfaceVariant} />
                <Text style={styles(theme).emptyText}>
                  No hay jugadores disponibles
                </Text>
              </View>
            ) : (
              filteredPlayers.map((player) => (
                <List.Item
                  key={player.id}
                  title={player.name || player.originalName}
                //   description={
                //     player.originalName && player.name
                //       ? `Original: ${player.originalName}`
                //       : undefined
                //   }
                  left={(props) => <List.Icon {...props} icon="account" />}
                  onPress={() => handleConfirmLink(player)}
                />
              ))
            )}
          </ScrollView>

          <Button
            mode="outlined"
            onPress={() => {
              setShowPlayerModal(false);
              setSearchQuery('');
            }}
            style={styles(theme).modalButton}
          >
            Cancelar
          </Button>
        </Modal>
      </Portal>
    </ScrollView>
  );
}

const styles = (theme: MD3Theme) => StyleSheet.create({
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
    textAlign: 'center',
    color: theme.colors.error,
  },
  loadingText: {
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  sectionSubtitle: {
    color: '#666',
    marginBottom: 12,
  },
  card: {
    marginBottom: 8,
    borderRadius: 8,
  },
  cardContent: {
    paddingVertical: 12,
  },
  emptyCard: {
    borderRadius: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  memberDetails: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    fontWeight: '600',
  },
  memberEmail: {
    color: '#666',
  },
  linkedPlayerText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  chipContainer: {
    marginTop: 4,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  statusChipText: {
    fontSize: 11,
  },
  linkedChip: {
    backgroundColor: theme.colors.inversePrimary,
  },
  unlinkedChip: {
    backgroundColor: theme.colors.errorContainer,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  playerDetails: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    fontWeight: '600',
  },
  originalName: {
    color: '#666',
  },
  divider: {
    marginVertical: 16,
  },
  modalContent: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    height: '80%',
  },
  modalHeader: {
    padding: 20,
    paddingBottom: 12,
  },
  modalTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#666',
  },
  searchBar: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  modalList: {
    maxHeight: 300,
    paddingHorizontal: 8,
  },
  emptyModalContent: {
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  modalButton: {
    margin: 20,
    marginTop: 12,
  },
});
