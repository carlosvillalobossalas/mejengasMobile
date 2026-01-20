import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Avatar, Text, Chip, Surface } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { MatchPlayer } from '../repositories/matches/matchesRepository';
import type { Player } from '../repositories/players/playerSeasonStatsRepository';
import { getPlayerInitial, getPlayerShortDisplay } from '../helpers/players';

type MatchLineupProps = {
    team1Players: MatchPlayer[];
    team2Players: MatchPlayer[];
    allPlayers: Player[];
    mvpPlayerId?: string | null;
    selectedTeam?: number;
    onTeamChange?: (team: number) => void;
};

const getPlayerInfo = (playerId: string, allPlayers: Player[]): Player | undefined => {
    return allPlayers.find(p => p.id === playerId);
};

const getPositionCoordinates = (
    position: string,
    index: number,
    totalInPosition: number,
): { x: number; y: number } => {
    // Goalkeeper always at bottom center
    if (position === 'POR') {
        return { x: 50, y: 88 };
    }

    // Vertical positions by line
    const yPositions: Record<string, number> = {
        DEL: 15,  // Forwards at top
        MED: 40,  // Midfielders in center
        DEF: 65,  // Defenders at back
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
        const minX = 15;
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
    mvpPlayerId = null,
    selectedTeam = 0,
    onTeamChange,
}) => {
    const [activeTeam, setActiveTeam] = useState(selectedTeam);

    const handleTeamChange = (team: number) => {
        setActiveTeam(team);
        onTeamChange?.(team);
    };

    const currentPlayers = activeTeam === 0 ? team1Players : team2Players;

    const renderPlayer = (player: MatchPlayer) => {
        if (!player || !player.id) return null;

        const playerInfo = getPlayerInfo(player.id, allPlayers);
        if (!playerInfo) return null;
        const playerName = getPlayerShortDisplay(playerInfo);
        const playerPhoto = playerInfo?.photoURL;
        // Group players by position to calculate indices
        const playersInPosition = currentPlayers.filter(p => p && p.position === player.position);
        const indexInPosition = playersInPosition.findIndex(p => p.id === player.id);

        const coords = getPositionCoordinates(player.position, indexInPosition, playersInPosition.length);
        const hasStats = (player.goals > 0 || player.assists > 0 || player.ownGoals > 0);
        const isMVP = mvpPlayerId && player.id === mvpPlayerId;

        return (
            <View
                key={player.id}
                style={[
                    styles.playerContainer,
                    {
                        left: `${coords.x}%`,
                        top: `${coords.y}%`,
                    },
                ]}
            >
                {/* Player Avatar */}
                <View style={styles.avatarWrapper}>
                    {playerPhoto ? (
                        <Avatar.Image
                            source={{ uri: playerPhoto }}
                            size={60}
                            style={[
                                styles.avatar,
                                isMVP && styles.mvpAvatar,
                            ]}
                        />
                    ) : (
                        <Avatar.Text
                            label={getPlayerInitial(playerName)}
                            size={60}
                            labelStyle={styles.avatarLabel}
                            style={[
                                styles.avatar,
                                isMVP && styles.mvpAvatar,
                                { backgroundColor: player.position === 'POR' ? '#FF9800' : '#2196F3' },
                            ]}
                        />
                    )}

                    {/* MVP Badge */}
                    {isMVP && (
                        <View style={styles.mvpBadge}>
                            <Icon name="star" size={12} color="#FFF" />
                        </View>
                    )}

                    {/* Position Badge */}
                    <Chip
                        style={[
                            styles.positionChip,
                            { borderColor: player.position === 'POR' ? '#FF9800' : '#2196F3' },
                        ]}
                        textStyle={styles.positionText}
                    >
                        {player.position}
                    </Chip>
                </View>

                {/* Player Name */}
                <Surface style={styles.nameSurface} elevation={1}>
                    <Text variant="labelSmall" style={styles.nameText} numberOfLines={1}>
                        {playerName}
                    </Text>
                </Surface>

                {/* Stats */}
                {hasStats && (
                    <Surface style={styles.statsSurface} elevation={1}>
                        {player.goals > 0 && (
                            <View style={styles.statItem}>
                                <Icon name="soccer" size={12} color="#4CAF50" />
                                <Text variant="labelSmall" style={styles.statText}>
                                    {player.goals}
                                </Text>
                            </View>
                        )}
                        {player.assists > 0 && (
                            <View style={styles.statItem}>
                                <Icon name="shoe-cleat" size={10} color="#2196F3" />
                                <Text variant="labelSmall" style={styles.statTextBlue}>
                                    {player.assists}
                                </Text>
                            </View>
                        )}
                        {player.ownGoals > 0 && (
                            <View style={styles.statItem}>
                                <Icon name="soccer" size={12} color="#F44336" />
                                <Text variant="labelSmall" style={styles.statTextRed}>
                                    {player.ownGoals}
                                </Text>
                            </View>
                        )}
                    </Surface>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Team Tabs */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity
                    style={styles.tabTouchable}
                    onPress={() => handleTeamChange(0)}
                    activeOpacity={0.7}
                >
                    <Surface
                        style={[
                            styles.tab,
                            activeTeam === 0 && styles.activeTab,
                        ]}
                        elevation={activeTeam === 0 ? 2 : 0}
                    >
                        <Text
                            variant="labelLarge"
                            style={[styles.tabText, activeTeam === 0 && styles.activeTabText]}
                        >
                            Equipo 1
                        </Text>
                    </Surface>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.tabTouchable}
                    onPress={() => handleTeamChange(1)}
                    activeOpacity={0.7}
                >
                    <Surface
                        style={[
                            styles.tab,
                            activeTeam === 1 && styles.activeTab,
                        ]}
                        elevation={activeTeam === 1 ? 2 : 0}
                    >
                        <Text
                            variant="labelLarge"
                            style={[styles.tabText, activeTeam === 1 && styles.activeTabText]}
                        >
                            Equipo 2
                        </Text>
                    </Surface>
                </TouchableOpacity>
            </View>

            {/* Football Field */}
            <View style={styles.field}>
                {/* Field Lines */}
                <View style={styles.fieldLines}>
                    {/* Center Line */}
                    <View style={styles.centerLine} />

                    {/* Center Circle */}
                    <View style={styles.centerCircle} />

                    {/* Top Area */}
                    <View style={[styles.area, styles.topArea]} />
                    <View style={[styles.smallArea, styles.topSmallArea]} />

                    {/* Bottom Area */}
                    <View style={[styles.area, styles.bottomArea]} />
                    <View style={[styles.smallArea, styles.bottomSmallArea]} />

                    {/* Field Border */}
                    <View style={styles.fieldBorder} />
                </View>

                {/* Players */}
                {currentPlayers.map(player => renderPlayer(player))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: '#F5F5F5',
        borderRadius: 8,
        overflow: 'hidden',
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
    },
    tabTouchable: {
        flex: 1,
    },
    tab: {
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF',
    },
    activeTab: {
        backgroundColor: '#2196F3',
    },
    tabText: {
        fontWeight: 'bold',
        color: '#666',
    },
    activeTabText: {
        color: '#FFF',
    },
    field: {
        position: 'relative',
        width: '100%',
        aspectRatio: 10 / 16,
        backgroundColor: '#4CAF50',
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
        top: -24,
        height: 23,
        width: 56,
        backgroundColor: '#FFF',
        borderWidth: 2,
    },
    positionText: {
        fontSize: 10,
        fontWeight: 'bold',
        marginVertical: 0,
        marginHorizontal: 1,
        width: '100%',
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
        color: '#4CAF50',
        fontSize: 10,
    },
    statTextBlue: {
        fontWeight: 'bold',
        color: '#2196F3',
        fontSize: 10,
    },
    statTextRed: {
        fontWeight: 'bold',
        color: '#F44336',
        fontSize: 10,
    },
});

export default MatchLineup;
