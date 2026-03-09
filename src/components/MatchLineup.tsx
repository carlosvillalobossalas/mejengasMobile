import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Avatar, Text, Surface, useTheme, MD3Theme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';

// LineupPlayer is a superset of MatchPlayer that also accepts the isSub flag
// present in team-based matches. Both types are structurally compatible.
type LineupPlayer = {
    groupMemberId: string | null;
    position: 'POR' | 'DEF' | 'MED' | 'DEL';
    goals: number;
    assists: number;
    ownGoals: number;
    isSub?: boolean;
};

type MatchLineupProps = {
    team1Players: LineupPlayer[];
    team2Players: LineupPlayer[];
    allPlayers: GroupMemberV2[];
    mvpGroupMemberId?: string | null;
    selectedTeam?: number;
    onTeamChange?: (team: number) => void;
    /** Optional team names shown in tabs instead of "Equipo 1/2" */
    team1Name?: string;
    team2Name?: string;
    /** Optional team colors used as avatar background */
    team1Color?: string;
    team2Color?: string;
    /** Optional match ISO date used in Details tab */
    matchDate?: string;
    onSlotPress?: (params: {
        team: 1 | 2;
        slotIndex: number;
        groupMemberId: string | null;
    }) => void;
};

const getShortName = (displayName: string): string => {
    const parts = displayName.trim().split(' ');
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1][0]}.`;
};

const getPlayerInfo = (groupMemberId: string, allPlayers: GroupMemberV2[]): GroupMemberV2 | undefined => {
    return allPlayers.find(p => p.id === groupMemberId);
};

const getPositionCoordinates = (
    position: string,
    index: number,
    totalInPosition: number,
): { x: number; y: number } => {
    // Goalkeeper always at bottom center
    if (position === 'POR') {
        return { x: 50, y: 84 };
    }

    // Vertical positions by line
    const yPositions: Record<string, number> = {
        DEL: 10,  // Forwards at top
        MED: 37,  // Midfielders in center
        DEF: 62,  // Defenders at back
    };

    // Calculate horizontal position
    const getXPosition = (idx: number, total: number): number => {
        if (total === 1) {
            return 50; // Center if only one
        }

        if (total === 2) {
            return idx === 0 ? 35 : 65;
        }

        // For 3 or more, distribute evenly with 15% and 85% margins
        const minX = 13;
        const maxX = 85;
        const spacing = (maxX - minX) / (total - 1);

        return minX + (spacing * idx);
    };

    const x = getXPosition(index, totalInPosition);
    const y = yPositions[position] || 50;

    return { x, y };
};

const MatchLineup: React.FC<MatchLineupProps> = ({
    team1Players = [],
    team2Players = [],
    allPlayers = [],
    mvpGroupMemberId = null,
    selectedTeam = 0,
    onTeamChange,
    team1Name,
    team2Name,
    team1Color,
    team2Color,
    matchDate,
    onSlotPress,
}) => {
    const theme = useTheme();
    const [activeTab, setActiveTab] = useState<0 | 1 | 'details'>(selectedTeam === 1 ? 1 : 0);
    const resolvedTeam1Color = team1Color ?? '#000000';
    const resolvedTeam2Color = team2Color ?? '#FFFFFF';

    const handleTeamChange = (team: number) => {
        setActiveTab(team === 1 ? 1 : 0);
        onTeamChange?.(team);
    };

    const formatDetailDate = (date: string): string => (
        new Date(date).toLocaleDateString('es-ES', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        })
    );

    const formatDetailTime = (date: string): string => (
        new Date(date).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
        })
    );

    // Exclude substitutes — they don't occupy a field position
    const currentPlayersWithIndex = ((activeTab === 1 ? team2Players : team1Players))
        .map((player, index) => ({ player, index }))
        .filter(entry => !entry.player.isSub);
    const activeTeamColor = activeTab === 1 ? resolvedTeam2Color : resolvedTeam1Color;
    const activeTeamNumber: 1 | 2 = activeTab === 1 ? 2 : 1;

    const renderPlayer = (player: LineupPlayer, playerIndex: number, slotIndex: number) => {
        // Group players by position to calculate indices (supports multiple empty slots)
        const playersInPosition = currentPlayersWithIndex
            .map(entry => entry.player)
            .filter(p => p && p.position === player.position);
        const indexInPosition = playersInPosition.indexOf(player);

        const coords = getPositionCoordinates(player.position, indexInPosition, playersInPosition.length);
        const hasStats = (player.goals > 0 || player.assists > 0 || player.ownGoals > 0);
        const key = player.groupMemberId ?? `empty_${player.position}_${playerIndex}`;

        if (!player.groupMemberId) {
            return (
                <TouchableOpacity
                    key={key}
                    activeOpacity={0.8}
                    onPress={() => onSlotPress?.({ team: activeTeamNumber, slotIndex, groupMemberId: null })}
                    style={[
                        styles(theme).playerContainer,
                        {
                            left: `${coords.x}%`,
                            top: `${coords.y}%`,
                        },
                    ]}
                >
                    <View style={styles(theme).avatarWrapper}>
                        <View style={styles(theme).emptyAvatarWrapper}>
                            <Icon name="account-question" size={26} color="rgba(255,255,255,0.6)" />
                        </View>
                        <View
                            style={[
                                styles(theme).positionChip,
                                { borderColor: 'rgba(255,255,255,0.4)' },
                            ]}
                        >
                            <Text style={styles(theme).positionText}>
                                {player.position}
                            </Text>
                        </View>
                    </View>

                    <Surface style={[styles(theme).nameSurface, { opacity: 0.6 }]} elevation={1}>
                        <Text variant="labelSmall" style={[styles(theme).nameText, { color: '#999', fontStyle: 'italic' }]} numberOfLines={1}>
                            ?
                        </Text>
                    </Surface>
                </TouchableOpacity>
            );
        }

        const playerInfo = getPlayerInfo(player.groupMemberId, allPlayers);
        if (!playerInfo) return null;
        const playerName = getShortName(playerInfo.displayName);
        const playerPhoto = playerInfo.photoUrl;
        const isMVP = player.groupMemberId !== null && mvpGroupMemberId === player.groupMemberId;

        return (
            <TouchableOpacity
                key={key}
                activeOpacity={0.8}
                onPress={() =>
                    onSlotPress?.({
                        team: activeTeamNumber,
                        slotIndex,
                        groupMemberId: player.groupMemberId,
                    })
                }
                style={[
                    styles(theme).playerContainer,
                    {
                        left: `${coords.x}%`,
                        top: `${coords.y}%`,
                    },
                ]}
            >
                {/* Player Avatar */}
                <View style={styles(theme).avatarWrapper}>
                    {playerPhoto ? (
                        <Avatar.Image
                            source={{ uri: playerPhoto }}
                            size={60}
                            style={[
                                styles(theme).avatar,
                                isMVP && styles(theme).mvpAvatar,
                            ]}
                        />
                    ) : (
                        <Avatar.Text
                            label={playerName[0]?.toUpperCase() ?? '?'}
                            size={60}
                            labelStyle={styles(theme).avatarLabel}
                            style={[
                                styles(theme).avatar,
                                isMVP && styles(theme).mvpAvatar,
                                {
                                    backgroundColor:
                                        player.position === 'POR' ? theme.colors.secondary : theme.colors.primary,
                                },
                            ]}
                        />
                    )}

                    {/* MVP Badge */}
                    {isMVP && (
                        <View style={styles(theme).mvpBadge}>
                            <Icon name="star" size={12} color="#FFF" />
                        </View>
                    )}

                    {/* Position Badge */}
                    <View
                        style={[
                            styles(theme).positionChip,
                            {
                                borderColor: player.position === 'POR' ? theme.colors.secondary : theme.colors.primary,
                            },
                        ]}
                    >
                        <Text style={styles(theme).positionText}>
                            {player.position}
                        </Text>
                    </View>
                </View>

                {/* Player Name */}
                <Surface style={styles(theme).nameSurface} elevation={1}>
                    <Text variant="labelSmall" style={styles(theme).nameText} numberOfLines={1}>
                        {playerName}
                    </Text>
                </Surface>

                {/* Stats */}
                {hasStats && (
                    <Surface style={styles(theme).statsSurface} elevation={1}>
                        {player.goals > 0 && (
                            <View style={styles(theme).statItem}>
                                <Icon name="soccer" size={12} color={theme.colors.primary} />
                                <Text variant="labelSmall" style={styles(theme).statText}>
                                    {player.goals}
                                </Text>
                            </View>
                        )}
                        {player.assists > 0 && (
                            <View style={styles(theme).statItem}>
                                <Icon name="shoe-cleat" size={10} color={theme.colors.secondary} />
                                <Text variant="labelSmall" style={styles(theme).statTextBlue}>
                                    {player.assists}
                                </Text>
                            </View>
                        )}
                        {player.ownGoals > 0 && (
                            <View style={styles(theme).statItem}>
                                <Icon name="close-circle-outline" size={12} color={theme.colors.error} />
                                <Text variant="labelSmall" style={styles(theme).statTextRed}>
                                    {player.ownGoals}
                                </Text>
                            </View>
                        )}
                    </Surface>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles(theme).container}>
            {/* Team Tabs */}
            <View style={styles(theme).tabsContainer}>
                <TouchableOpacity
                    style={styles(theme).tabTouchable}
                    onPress={() => handleTeamChange(0)}
                    activeOpacity={0.7}
                >
                    <Surface
                        style={[
                            styles(theme).tab,
                            activeTab === 0 && styles(theme).activeTab,
                        ]}
                        elevation={activeTab === 0 ? 2 : 0}
                    >
                        <View style={styles(theme).tabContent}>
                            <View
                                style={[
                                    styles(theme).tabColorDot,
                                    {
                                        backgroundColor: resolvedTeam1Color,
                                        borderColor:
                                            resolvedTeam1Color.toLowerCase() === '#ffffff'
                                                ? theme.colors.outline
                                                : 'transparent',
                                    },
                                ]}
                            />
                        <Text
                            variant="labelLarge"
                            style={[styles(theme).tabText, activeTab === 0 && styles(theme).activeTabText]}
                        >
                            {team1Name ?? 'Equipo 1'}
                        </Text>
                        </View>
                    </Surface>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles(theme).tabTouchable}
                    onPress={() => handleTeamChange(1)}
                    activeOpacity={0.7}
                >
                    <Surface
                        style={[
                            styles(theme).tab,
                            activeTab === 1 && styles(theme).activeTab,
                        ]}
                        elevation={activeTab === 1 ? 2 : 0}
                    >
                        <View style={styles(theme).tabContent}>
                            <View
                                style={[
                                    styles(theme).tabColorDot,
                                    {
                                        backgroundColor: resolvedTeam2Color,
                                        borderColor:
                                            resolvedTeam2Color.toLowerCase() === '#ffffff'
                                                ? theme.colors.outline
                                                : 'transparent',
                                    },
                                ]}
                            />
                        <Text
                            variant="labelLarge"
                            style={[styles(theme).tabText, activeTab === 1 && styles(theme).activeTabText]}
                        >
                            {team2Name ?? 'Equipo 2'}
                        </Text>
                        </View>
                    </Surface>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles(theme).tabTouchable}
                    onPress={() => setActiveTab('details')}
                    activeOpacity={0.7}
                >
                    <Surface
                        style={[
                            styles(theme).tab,
                            activeTab === 'details' && styles(theme).activeTab,
                        ]}
                        elevation={activeTab === 'details' ? 2 : 0}
                    >
                        <Text
                            variant="labelLarge"
                            style={[styles(theme).tabText, activeTab === 'details' && styles(theme).activeTabText]}
                        >
                            Detalles
                        </Text>
                    </Surface>
                </TouchableOpacity>
            </View>

            {activeTab === 'details' ? (
                <View style={styles(theme).detailsContainer}>
                    <View style={styles(theme).detailRow}>
                        <Icon name="calendar" size={16} color={theme.colors.primary} />
                        <Text variant="bodyMedium" style={styles(theme).detailText}>
                            {matchDate ? formatDetailDate(matchDate) : 'Fecha pendiente'}
                        </Text>
                    </View>
                    <View style={styles(theme).detailRow}>
                        <Icon name="clock-outline" size={16} color={theme.colors.primary} />
                        <Text variant="bodyMedium" style={styles(theme).detailText}>
                            {matchDate ? formatDetailTime(matchDate) : '--:--'}
                        </Text>
                    </View>
                    <View style={styles(theme).kitRow}>
                        <Text variant="labelMedium" style={styles(theme).kitTitle}>
                            Color recomendado
                        </Text>
                        <View style={styles(theme).kitItem}>
                            <View
                                style={[
                                    styles(theme).kitColor,
                                    {
                                        backgroundColor: resolvedTeam1Color,
                                        borderColor:
                                            resolvedTeam1Color.toLowerCase() === '#ffffff'
                                                ? theme.colors.outline
                                                : 'transparent',
                                    },
                                ]}
                            />
                            <Text variant="bodySmall" style={styles(theme).kitLabel}>
                                {team1Name ?? 'Equipo 1'}
                            </Text>
                        </View>
                        <View style={styles(theme).kitItem}>
                            <View
                                style={[
                                    styles(theme).kitColor,
                                    {
                                        backgroundColor: resolvedTeam2Color,
                                        borderColor:
                                            resolvedTeam2Color.toLowerCase() === '#ffffff'
                                                ? theme.colors.outline
                                                : 'transparent',
                                    },
                                ]}
                            />
                            <Text variant="bodySmall" style={styles(theme).kitLabel}>
                                {team2Name ?? 'Equipo 2'}
                            </Text>
                        </View>
                    </View>
                </View>
            ) : (
                <View style={styles(theme).field}>
                    <View style={styles(theme).fieldKitBadge}>
                        <Text variant="labelSmall" style={styles(theme).fieldKitLabel}>
                            Camiseta
                        </Text>
                        <View
                            style={[
                                styles(theme).fieldKitColor,
                                {
                                    backgroundColor: activeTeamColor,
                                    borderColor: '#FFFFFF',
                                },
                            ]}
                        />
                    </View>
                    <View style={styles(theme).fieldLines}>
                        <View style={styles(theme).centerLine} />
                        <View style={styles(theme).centerCircle} />
                        <View style={[styles(theme).area, styles(theme).topArea]} />
                        <View style={[styles(theme).smallArea, styles(theme).topSmallArea]} />
                        <View style={[styles(theme).area, styles(theme).bottomArea]} />
                        <View style={[styles(theme).smallArea, styles(theme).bottomSmallArea]} />
                        <View style={styles(theme).fieldBorder} />
                    </View>

                    {currentPlayersWithIndex.map(({ player, index }, playerIndex) =>
                        renderPlayer(player, playerIndex, index),
                    )}
                </View>
            )}
        </View>
    );
};

const styles = (theme: MD3Theme) => StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: theme.colors.background,
        borderRadius: 8,
        overflow: 'hidden',
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
    },
    tabTouchable: {
        flex: 1,
    },
    tab: {
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
    },
    tabContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    tabColorDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 1,
    },
    activeTab: {
        backgroundColor: theme.colors.primary,
    },
    tabText: {
        fontWeight: 'bold',
        color: theme.colors.onSurfaceVariant,
    },
    activeTabText: {
        color: '#FFF',
    },
    detailsContainer: {
        paddingHorizontal: 12,
        paddingVertical: 14,
        backgroundColor: theme.colors.surface,
        gap: 10,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        color: theme.colors.onSurface,
        textTransform: 'capitalize',
    },
    kitRow: {
        gap: 8,
    },
    kitTitle: {
        color: theme.colors.onSurfaceVariant,
    },
    kitItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    kitColor: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1,
    },
    kitLabel: {
        color: theme.colors.onSurface,
    },
    field: {
        position: 'relative',
        width: '100%',
        aspectRatio: 10 / 16.5,
        backgroundColor: '#4CAF50',
    },
    fieldKitBadge: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        zIndex: 4,
        backgroundColor: 'rgba(0,0,0,0.30)',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    fieldKitLabel: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    fieldKitColor: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1,
    },
    fieldLines: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    centerLine: {
        position: 'absolute',
        top: '50%',
        left: '5%',
        right: '5%',
        height: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
    },
    centerCircle: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.4)',
        transform: [{ translateX: -30 }, { translateY: -30 }],
    },
    area: {
        position: 'absolute',
        left: '20%',
        right: '20%',
        height: '18%',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    topArea: {
        top: 0,
        borderTopWidth: 0,
    },
    bottomArea: {
        bottom: 0,
        borderBottomWidth: 0,
    },
    smallArea: {
        position: 'absolute',
        left: '35%',
        right: '35%',
        height: '8%',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    topSmallArea: {
        top: 0,
        borderTopWidth: 0,
    },
    bottomSmallArea: {
        bottom: 0,
        borderBottomWidth: 0,
    },
    fieldBorder: {
        position: 'absolute',
        top: '2%',
        left: '5%',
        right: '5%',
        bottom: '2%',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    playerContainer: {
        position: 'absolute',
        transform: [{ translateX: -30 }, { translateY: -30 }],
        alignItems: 'center',
        gap: 4,
        zIndex: 2,
    },
    avatarWrapper: {
        position: 'relative',
        borderRadius: 30,
        borderWidth: 3,
        borderColor: '#FFF',
        backgroundColor: '#FFF',
    },
    emptyAvatarWrapper: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(0,0,0,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: {
        backgroundColor: 'transparent',
    },
    avatarLabel: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    mvpAvatar: {
        borderColor: '#FFD700',
        shadowColor: '#FFD700',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
        elevation: 8,
    },
    mvpBadge: {
        position: 'absolute',
        top: -6,
        left: -6,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#FFD700',
        borderWidth: 2,
        borderColor: '#FFF',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
    },
    positionChip: {
        position: 'absolute',
        top: -8,
        left: 32,
        height: 22,
        width: 42,
        backgroundColor: '#FFF',
        borderWidth: 2,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    positionText: {
        fontSize: 10,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    nameSurface: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        maxWidth: 80,
    },
    nameText: {
        fontWeight: 'bold',
        fontSize: 11,
        textAlign: 'center',
    },
    statsSurface: {
        flexDirection: 'row',
        gap: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    statText: {
        fontWeight: 'bold',
        color: theme.colors.primary,
        fontSize: 10,
    },
    statTextBlue: {
        fontWeight: 'bold',
        color: theme.colors.secondary,
        fontSize: 10,
    },
    statTextRed: {
        fontWeight: 'bold',
        color: theme.colors.error,
        fontSize: 10,
    },
});

export default MatchLineup;
