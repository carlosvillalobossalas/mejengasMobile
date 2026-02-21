import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
} from 'react-native';
import {
  Text,
  Avatar,
  useTheme,
  Divider,
  Chip,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProfileData, type ProfileData } from '../endpoints/profile/profileEndpoints';
import {
  getGroupMemberProfileData,
  type GroupMemberProfileData,
} from '../endpoints/groupMembers/groupMemberProfileEndpoints';

type PlayerProfileModalProps = {
  userId?: string | null;
  playerId?: string | null;
  /** When provided, stats are loaded from seasonStats by groupMemberId */
  groupMemberId?: string | null;
  playerName?: string;
  playerPhotoURL?: string;
  bottomSheetRef: React.RefObject<BottomSheet | null>;
};

export default function PlayerProfileModal({
  userId,
  playerId,
  groupMemberId,
  playerName,
  playerPhotoURL,
  bottomSheetRef,
}: PlayerProfileModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [memberData, setMemberData] = useState<GroupMemberProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!userId && !playerId && !groupMemberId) {
        setProfileData(null);
        setMemberData(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (groupMemberId) {
          // New path: load stats from seasonStats by groupMemberId
          const data = await getGroupMemberProfileData(groupMemberId);
          setMemberData(data);
          setProfileData(null);
        } else {
          // Legacy path: load from old PlayerSeasonStats / GoalkeeperSeasonStats
          const data = await getProfileData(userId || undefined, playerId || undefined);
          setProfileData(data);
          setMemberData(null);
        }
      } catch (err) {
        console.error('Error loading player profile:', err);
        setError('Error al cargar el perfil');
      } finally {
        setIsLoading(false);
      }
    };

    if (userId || playerId || groupMemberId) {
      loadProfile();
    }
  }, [userId, playerId, groupMemberId]);

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.5}
    />
  );

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatRecord = (won: number, draw: number, lost: number) => {
    return `${won}-${draw}-${lost}`;
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['85%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      topInset={insets.top}
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView style={styles.container}>
        {isLoading && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Cargando perfil...</Text>
          </View>
        )}

        {error && (
          <View style={styles.centerContainer}>
            <Icon name="alert-circle" size={48} color={theme.colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!isLoading && !error && profileData && (
          <>
            {/* User Info Section */}
            <View style={styles.profileSection}>
              <View style={styles.avatarContainer}>
                {playerPhotoURL ? (
                  <Avatar.Image size={80} source={{ uri: playerPhotoURL }} />
                ) : (
                  <Avatar.Text size={80} label={getInitials(playerName)} />
                )}
              </View>

              <Text style={styles.userName}>{playerName || 'Sin nombre'}</Text>
            </View>

            <Divider style={styles.sectionDivider} />

            {/* Historic Total Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="chart-bar" size={20} color={theme.colors.primary} />
                <Text style={styles.sectionTitle}>Histórico Total</Text>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Icon name="soccer" size={28} color="#2196F3" />
                  <Text style={styles.statValue}>{profileData.historicStats.goals}</Text>
                  <Text style={styles.statLabel}>Goles</Text>
                </View>

                <View style={styles.statItem}>
                  <Icon name="shoe-sneaker" size={28} color="#4CAF50" />
                  <Text style={styles.statValue}>{profileData.historicStats.assists}</Text>
                  <Text style={styles.statLabel}>Asistencias</Text>
                </View>

                <View style={styles.statItem}>
                  <Icon name="tshirt-crew" size={28} color="#FF9800" />
                  <Text style={styles.statValue}>
                    {formatRecord(
                      profileData.historicStats.won,
                      profileData.historicStats.draw,
                      profileData.historicStats.lost
                    )}
                  </Text>
                  <Text style={styles.statLabel}>V-E-D</Text>
                </View>

                <View style={styles.statItem}>
                  <Icon name="star" size={28} color="#FFC107" />
                  <Text style={styles.statValue}>{profileData.historicStats.mvp}</Text>
                  <Text style={styles.statLabel}>MVPs</Text>
                </View>
              </View>
            </View>

            <Divider style={styles.sectionDivider} />

            {/* Stats by Group and Season */}
            {profileData.statsByGroup.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="calendar-star" size={20} color={theme.colors.primary} />
                  <Text style={styles.sectionTitle}>Por Temporada</Text>
                </View>

                {profileData.statsByGroup.map((item, index) => {
                  const groupName = item.group?.name || 'Grupo desconocido';
                  const season = item.stats.season;
                  const isGoalkeeper = item.type === 'goalkeeper';

                  return (
                    <View key={`${item.stats.id}-${index}`} style={styles.seasonCard}>
                      <View style={styles.seasonHeader}>
                        <View>
                          <Text style={styles.seasonGroupName}>{groupName}</Text>
                          <Text style={styles.seasonYear}>Temporada {season}</Text>
                        </View>
                        <Chip
                          compact
                          style={[
                            styles.typeChip,
                            isGoalkeeper ? styles.goalkeeperChip : styles.playerChip,
                          ]}
                          textStyle={styles.typeChipText}
                        >
                          {isGoalkeeper ? 'Portero' : 'Jugador'}
                        </Chip>
                      </View>

                      <View style={styles.statsGrid}>
                        {isGoalkeeper ? (
                          // Goalkeeper stats
                          <>
                            <View style={styles.statItem}>
                              <Icon name="shield-check" size={24} color="#4CAF50" />
                              <Text style={styles.statValue}>
                                {'cleanSheets' in item.stats ? item.stats.cleanSheets : 0}
                              </Text>
                              <Text style={styles.statLabel}>Vallas invictas</Text>
                            </View>

                            <View style={styles.statItem}>
                              <Icon name="soccer" size={24} color="#F44336" />
                              <Text style={styles.statValue}>
                                {'goalsReceived' in item.stats ? item.stats.goalsReceived : 0}
                              </Text>
                              <Text style={styles.statLabel}>Goles recibidos</Text>
                            </View>

                            <View style={styles.statItem}>
                              <Icon name="tshirt-crew" size={24} color="#FF9800" />
                              <Text style={styles.statValue}>
                                {formatRecord(item.stats.won, item.stats.draw, item.stats.lost)}
                              </Text>
                              <Text style={styles.statLabel}>V-E-D</Text>
                            </View>

                            <View style={styles.statItem}>
                              <Icon name="star" size={24} color="#FFC107" />
                              <Text style={styles.statValue}>{item.stats.mvp}</Text>
                              <Text style={styles.statLabel}>MVPs</Text>
                            </View>
                          </>
                        ) : (
                          // Player stats
                          <>
                            <View style={styles.statItem}>
                              <Icon name="soccer" size={24} color="#2196F3" />
                              <Text style={styles.statValue}>
                                {'goals' in item.stats ? item.stats.goals : 0}
                              </Text>
                              <Text style={styles.statLabel}>Goles</Text>
                            </View>

                            <View style={styles.statItem}>
                              <Icon name="shoe-sneaker" size={24} color="#4CAF50" />
                              <Text style={styles.statValue}>
                                {'assists' in item.stats ? item.stats.assists : 0}
                              </Text>
                              <Text style={styles.statLabel}>Asistencias</Text>
                            </View>

                            <View style={styles.statItem}>
                              <Icon name="tshirt-crew" size={24} color="#FF9800" />
                              <Text style={styles.statValue}>
                                {formatRecord(item.stats.won, item.stats.draw, item.stats.lost)}
                              </Text>
                              <Text style={styles.statLabel}>V-E-D</Text>
                            </View>

                            <View style={styles.statItem}>
                              <Icon name="star" size={24} color="#FFC107" />
                              <Text style={styles.statValue}>{item.stats.mvp}</Text>
                              <Text style={styles.statLabel}>MVPs</Text>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {profileData.statsByGroup.length === 0 && (
              <View style={styles.emptyContainer}>
                <Icon name="information-outline" size={48} color={theme.colors.onSurfaceDisabled} />
                <Text style={styles.emptyText}>
                  No hay estadísticas disponibles todavía
                </Text>
              </View>
            )}
          </>
        )}

        {/* ── New mode: groupMemberId + seasonStats ── */}
        {!isLoading && !error && memberData && (
          <>
            {/* Profile header */}
            <View style={styles.profileSection}>
              <View style={styles.avatarContainer}>
                {memberData.member.photoUrl ? (
                  <Avatar.Image size={80} source={{ uri: memberData.member.photoUrl }} />
                ) : (
                  <Avatar.Text size={80} label={getInitials(memberData.member.displayName)} />
                )}
              </View>
              <Text style={styles.userName}>{memberData.member.displayName}</Text>
              {memberData.member.isGuest && (
                <Text style={styles.guestLabel}>Jugador invitado</Text>
              )}
            </View>

            <Divider style={styles.sectionDivider} />

            {/* Historic player totals */}
            {memberData.hasPlayerStats && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="chart-bar" size={20} color={theme.colors.primary} />
                  <Text style={styles.sectionTitle}>
                    {memberData.hasGoalkeeperStats ? 'Histórico como Jugador' : 'Histórico Total'}
                  </Text>
                </View>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Icon name="soccer" size={28} color="#2196F3" />
                    <Text style={styles.statValue}>{memberData.historicPlayer.goals}</Text>
                    <Text style={styles.statLabel}>Goles</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="shoe-sneaker" size={28} color="#4CAF50" />
                    <Text style={styles.statValue}>{memberData.historicPlayer.assists}</Text>
                    <Text style={styles.statLabel}>Asistencias</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="tshirt-crew" size={28} color="#FF9800" />
                    <Text style={styles.statValue}>
                      {formatRecord(
                        memberData.historicPlayer.won,
                        memberData.historicPlayer.draw,
                        memberData.historicPlayer.lost,
                      )}
                    </Text>
                    <Text style={styles.statLabel}>V-E-D</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="run" size={28} color="#9E9E9E" />
                    <Text style={styles.statValue}>{memberData.historicPlayer.matches}</Text>
                    <Text style={styles.statLabel}>Partidos</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Historic goalkeeper totals */}
            {memberData.hasGoalkeeperStats && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="hand-back-right" size={20} color="#9C27B0" />
                  <Text style={styles.sectionTitle}>
                    {memberData.hasPlayerStats ? 'Histórico como Portero' : 'Histórico Total'}
                  </Text>
                </View>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Icon name="shield-check" size={28} color="#4CAF50" />
                    <Text style={styles.statValue}>{memberData.historicGoalkeeper.cleanSheets}</Text>
                    <Text style={styles.statLabel}>Vallas invictas</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="soccer" size={28} color="#F44336" />
                    <Text style={styles.statValue}>{memberData.historicGoalkeeper.goalsConceded}</Text>
                    <Text style={styles.statLabel}>Goles recibidos</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="tshirt-crew" size={28} color="#FF9800" />
                    <Text style={styles.statValue}>
                      {formatRecord(
                        memberData.historicGoalkeeper.won,
                        memberData.historicGoalkeeper.draw,
                        memberData.historicGoalkeeper.lost,
                      )}
                    </Text>
                    <Text style={styles.statLabel}>V-E-D</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="run" size={28} color="#9E9E9E" />
                    <Text style={styles.statValue}>{memberData.historicGoalkeeper.matches}</Text>
                    <Text style={styles.statLabel}>Partidos</Text>
                  </View>
                </View>
              </View>
            )}

            {(memberData.hasPlayerStats || memberData.hasGoalkeeperStats) && (
              <Divider style={styles.sectionDivider} />
            )}

            {/* Per-season cards */}
            {memberData.seasonCards.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="calendar-star" size={20} color={theme.colors.primary} />
                  <Text style={styles.sectionTitle}>Por Temporada</Text>
                </View>

                {memberData.seasonCards.map(card => {
                  const groupName = card.group?.name ?? 'Grupo desconocido';
                  const isGoalkeeper = card.type === 'goalkeeper';

                  return (
                    <View key={card.id} style={styles.seasonCard}>
                      <View style={styles.seasonHeader}>
                        <View style={styles.seasonHeaderInfo}>
                          <Text style={styles.seasonGroupName}>{groupName}</Text>
                          <Text style={styles.seasonYear}>Temporada {card.season}</Text>
                        </View>
                        <Chip
                          compact
                          style={[
                            styles.typeChip,
                            isGoalkeeper ? styles.goalkeeperChip : styles.playerChip,
                          ]}
                          textStyle={styles.typeChipText}
                        >
                          {isGoalkeeper ? 'Portero' : 'Jugador'}
                        </Chip>
                      </View>

                      <View style={styles.statsGrid}>
                        {isGoalkeeper && card.goalkeeperStats ? (
                          <>
                            <View style={styles.statItem}>
                              <Icon name="shield-check" size={24} color="#4CAF50" />
                              <Text style={styles.statValue}>{card.goalkeeperStats.cleanSheets}</Text>
                              <Text style={styles.statLabel}>Vallas invictas</Text>
                            </View>
                            <View style={styles.statItem}>
                              <Icon name="soccer" size={24} color="#F44336" />
                              <Text style={styles.statValue}>{card.goalkeeperStats.goalsConceded}</Text>
                              <Text style={styles.statLabel}>Goles recibidos</Text>
                            </View>
                            <View style={styles.statItem}>
                              <Icon name="tshirt-crew" size={24} color="#FF9800" />
                              <Text style={styles.statValue}>
                                {formatRecord(
                                  card.goalkeeperStats.won,
                                  card.goalkeeperStats.draw,
                                  card.goalkeeperStats.lost,
                                )}
                              </Text>
                              <Text style={styles.statLabel}>V-E-D</Text>
                            </View>
                            <View style={styles.statItem}>
                              <Icon name="star" size={24} color="#FFC107" />
                              <Text style={styles.statValue}>{card.goalkeeperStats.mvp}</Text>
                              <Text style={styles.statLabel}>MVPs</Text>
                            </View>
                          </>
                        ) : card.playerStats ? (
                          <>
                            <View style={styles.statItem}>
                              <Icon name="soccer" size={24} color="#2196F3" />
                              <Text style={styles.statValue}>{card.playerStats.goals}</Text>
                              <Text style={styles.statLabel}>Goles</Text>
                            </View>
                            <View style={styles.statItem}>
                              <Icon name="shoe-sneaker" size={24} color="#4CAF50" />
                              <Text style={styles.statValue}>{card.playerStats.assists}</Text>
                              <Text style={styles.statLabel}>Asistencias</Text>
                            </View>
                            <View style={styles.statItem}>
                              <Icon name="tshirt-crew" size={24} color="#FF9800" />
                              <Text style={styles.statValue}>
                                {formatRecord(
                                  card.playerStats.won,
                                  card.playerStats.draw,
                                  card.playerStats.lost,
                                )}
                              </Text>
                              <Text style={styles.statLabel}>V-E-D</Text>
                            </View>
                            <View style={styles.statItem}>
                              <Icon name="star" size={24} color="#FFC107" />
                              <Text style={styles.statValue}>{card.playerStats.mvp}</Text>
                              <Text style={styles.statLabel}>MVPs</Text>
                            </View>
                          </>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {memberData.seasonCards.length === 0 && (
              <View style={styles.emptyContainer}>
                <Icon name="information-outline" size={48} color={theme.colors.onSurfaceDisabled} />
                <Text style={styles.emptyText}>
                  No hay estadísticas disponibles todavía
                </Text>
              </View>
            )}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    padding: 40,
    alignItems: 'center',
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
  profileSection: {
    padding: 20,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 12,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionDivider: {
    marginVertical: 8,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#757575',
  },
  seasonCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  seasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  seasonGroupName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  seasonHeaderInfo: {
    flex: 1,
    marginRight: 8,
  },
  seasonYear: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  guestLabel: {
    fontSize: 13,
    color: '#9E9E9E',
    marginTop: 4,
  },
  typeChip: {
    height: 24,
  },
  typeChipText: {
    fontSize: 11,
    marginVertical: 0,
  },
  playerChip: {
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
  },
  goalkeeperChip: {
    backgroundColor: 'rgba(156, 39, 176, 0.15)',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
});
