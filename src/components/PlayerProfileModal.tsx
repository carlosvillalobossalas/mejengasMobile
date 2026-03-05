import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    View,
} from 'react-native';
import {
    Avatar,
    Chip,
    Divider,
    Text,
    useTheme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    getUserProfileData,
    type UserProfileData,
} from '../endpoints/groupMembers/groupMemberProfileEndpoints';
import {
    getGroupMemberV2ById,
    type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';

type PlayerProfileModalProps = {
    userId?: string | null;
    groupMemberId?: string | null;
    playerName?: string;
    playerPhotoURL?: string;
    bottomSheetRef: React.RefObject<BottomSheet | null>;
};

export default function PlayerProfileModal({
    userId,
    groupMemberId,
    playerName,
    playerPhotoURL,
    bottomSheetRef,
}: PlayerProfileModalProps) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    const [profileData, setProfileData] = useState<UserProfileData | null>(null);
    const [resolvedMember, setResolvedMember] = useState<GroupMemberV2 | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadProfile = async () => {
            if (!userId && !groupMemberId) {
                setProfileData(null);
                setResolvedMember(null);
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                let resolvedUserId = userId ?? null;
                let member: GroupMemberV2 | null = null;

                if (!resolvedUserId && groupMemberId) {
                    member = await getGroupMemberV2ById(groupMemberId);
                    setResolvedMember(member);
                    resolvedUserId = member?.userId ?? null;
                } else {
                    setResolvedMember(null);
                }

                if (!resolvedUserId) {
                    setProfileData(null);
                    return;
                }

                const data = await getUserProfileData(resolvedUserId);
                setProfileData(data);
            } catch (err) {
                console.error('PlayerProfileModal: error loading profile', err);
                setError('Error al cargar el perfil');
            } finally {
                setIsLoading(false);
            }
        };

        if (userId || groupMemberId) {
            loadProfile();
        }
    }, [userId, groupMemberId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderBackdrop = (props: any) => (
        <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
            opacity={0.5}
        />
    );

    const getInitials = (name?: string | null) => {
        if (!name) return '?';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const formatRecord = (won: number, draw: number, lost: number) => `${won}-${draw}-${lost}`;

    const displayName =
        profileData?.user.displayName ??
        resolvedMember?.displayName ??
        playerName ??
        'Sin nombre';

    const displayPhoto =
        profileData?.user.photoURL ??
        resolvedMember?.photoUrl ??
        playerPhotoURL ??
        null;

    const isRegisteredProfile = !!profileData;

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

                {!isLoading && !error && (
                    <>
                        <View style={styles.profileSection}>
                            <View style={styles.avatarContainer}>
                                {displayPhoto ? (
                                    <Avatar.Image size={80} source={{ uri: displayPhoto }} />
                                ) : (
                                    <Avatar.Text size={80} label={getInitials(displayName)} />
                                )}
                            </View>
                            <Text style={styles.userName}>{displayName}</Text>
                            {resolvedMember?.isGuest && !isRegisteredProfile && (
                                <Text style={styles.guestLabel}>Jugador invitado</Text>
                            )}
                        </View>

                        <Divider style={styles.sectionDivider} />

                        {!isRegisteredProfile ? (
                            <View style={styles.emptyContainer}>
                                <Icon name="account-alert-outline" size={48} color={theme.colors.onSurfaceDisabled} />
                                <Text style={styles.emptyText}>
                                    El historial completo está disponible solo para usuarios registrados.
                                </Text>
                            </View>
                        ) : (
                            <>
                                {profileData.hasPlayerStats && (
                                    <View style={styles.section}>
                                        <View style={styles.sectionHeader}>
                                            <Icon name="chart-bar" size={20} color={theme.colors.primary} />
                                            <Text style={styles.sectionTitle}>
                                                {profileData.hasGoalkeeperStats ? 'Histórico como Jugador' : 'Histórico Total'}
                                            </Text>
                                        </View>
                                        <View style={styles.statsGrid}>
                                            <View style={styles.statItem}>
                                                <Icon name="soccer" size={28} color="#2196F3" />
                                                <Text style={styles.statValue}>{profileData.historicPlayer.goals}</Text>
                                                <Text style={styles.statLabel}>Goles</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Icon name="shoe-sneaker" size={28} color="#4CAF50" />
                                                <Text style={styles.statValue}>{profileData.historicPlayer.assists}</Text>
                                                <Text style={styles.statLabel}>Asistencias</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Icon name="tshirt-crew" size={28} color="#FF9800" />
                                                <Text style={styles.statValue}>
                                                    {formatRecord(
                                                        profileData.historicPlayer.won,
                                                        profileData.historicPlayer.draw,
                                                        profileData.historicPlayer.lost,
                                                    )}
                                                </Text>
                                                <Text style={styles.statLabel}>V-E-D</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Icon name="run" size={28} color="#9E9E9E" />
                                                <Text style={styles.statValue}>{profileData.historicPlayer.matches}</Text>
                                                <Text style={styles.statLabel}>Partidos</Text>
                                            </View>
                                        </View>
                                    </View>
                                )}

                                {profileData.hasGoalkeeperStats && (
                                    <View style={styles.section}>
                                        <View style={styles.sectionHeader}>
                                            <Icon name="hand-back-right" size={20} color="#9C27B0" />
                                            <Text style={styles.sectionTitle}>
                                                {profileData.hasPlayerStats ? 'Histórico como Portero' : 'Histórico Total'}
                                            </Text>
                                        </View>
                                        <View style={styles.statsGrid}>
                                            <View style={styles.statItem}>
                                                <Icon name="shield-check" size={28} color="#4CAF50" />
                                                <Text style={styles.statValue}>{profileData.historicGoalkeeper.cleanSheets}</Text>
                                                <Text style={styles.statLabel}>Vallas invictas</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Icon name="soccer" size={28} color="#F44336" />
                                                <Text style={styles.statValue}>{profileData.historicGoalkeeper.goalsConceded}</Text>
                                                <Text style={styles.statLabel}>Goles recibidos</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Icon name="tshirt-crew" size={28} color="#FF9800" />
                                                <Text style={styles.statValue}>
                                                    {formatRecord(
                                                        profileData.historicGoalkeeper.won,
                                                        profileData.historicGoalkeeper.draw,
                                                        profileData.historicGoalkeeper.lost,
                                                    )}
                                                </Text>
                                                <Text style={styles.statLabel}>V-E-D</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Icon name="run" size={28} color="#9E9E9E" />
                                                <Text style={styles.statValue}>{profileData.historicGoalkeeper.matches}</Text>
                                                <Text style={styles.statLabel}>Partidos</Text>
                                            </View>
                                        </View>
                                    </View>
                                )}

                                {(profileData.hasPlayerStats || profileData.hasGoalkeeperStats) && (
                                    <Divider style={styles.sectionDivider} />
                                )}

                                {profileData.seasonCards.length > 0 ? (
                                    <View style={styles.section}>
                                        <View style={styles.sectionHeader}>
                                            <Icon name="calendar-star" size={20} color={theme.colors.primary} />
                                            <Text style={styles.sectionTitle}>Por Temporada</Text>
                                        </View>

                                        {profileData.seasonCards.map(card => {
                                            const groupName = card.group?.name ?? 'Grupo desconocido';
                                            const isGoalkeeper = card.type === 'goalkeeper';

                                            return (
                                                <View key={card.id} style={styles.seasonCard}>
                                                    <View style={styles.seasonHeader}>
                                                        <View style={styles.seasonHeaderInfo}>
                                                            <Text style={styles.seasonGroupName}>{groupName}</Text>
                                                            <Text style={styles.seasonYear}>Temporada {card.season}</Text>
                                                        </View>
                                                        <View style={styles.chipsRow}>
                                                            <Chip
                                                                compact
                                                                style={[styles.typeChip, isGoalkeeper ? styles.goalkeeperChip : styles.playerChip]}
                                                                textStyle={styles.typeChipText}
                                                            >
                                                                {isGoalkeeper ? 'Portero' : 'Jugador'}
                                                            </Chip>
                                                        </View>
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
                                ) : (
                                    <View style={styles.emptyContainer}>
                                        <Icon name="information-outline" size={48} color={theme.colors.onSurfaceDisabled} />
                                        <Text style={styles.emptyText}>No hay estadísticas disponibles todavía</Text>
                                    </View>
                                )}
                            </>
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
    guestLabel: {
        fontSize: 13,
        color: '#9E9E9E',
        marginTop: 4,
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
    seasonHeaderInfo: {
        flex: 1,
        marginRight: 8,
    },
    seasonGroupName: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    seasonYear: {
        fontSize: 12,
        color: '#757575',
        marginTop: 2,
    },
    chipsRow: {
        alignItems: 'flex-end',
        gap: 6,
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
    regularChip: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
    },
    challengeChip: {
        backgroundColor: 'rgba(255, 152, 0, 0.18)',
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
