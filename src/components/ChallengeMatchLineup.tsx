import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Avatar, Text, Surface, useTheme, MD3Theme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import type { ChallengeMatchPlayer } from '../repositories/matches/matchesByChallengeRepository';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChallengeMatchLineupProps = {
  players: ChallengeMatchPlayer[];
  allPlayers: GroupMemberV2[];
  mvpGroupMemberId?: string | null;
  teamColor?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getShortName = (displayName: string): string => {
  const parts = displayName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
};

const getPositionCoordinates = (
  position: string,
  index: number,
  totalInPosition: number,
): { x: number; y: number } => {
  if (position === 'POR') return { x: 50, y: 84 };

  const yPositions: Record<string, number> = {
    DEL: 10,
    MED: 37,
    DEF: 62,
  };

  const getX = (idx: number, total: number): number => {
    if (total === 1) return 50;
    if (total === 2) return idx === 0 ? 35 : 65;
    const minX = 13;
    const maxX = 85;
    const spacing = (maxX - minX) / (total - 1);
    return minX + spacing * idx;
  };

  return { x: getX(index, totalInPosition), y: yPositions[position] ?? 50 };
};

// ─── Component ────────────────────────────────────────────────────────────────

const ChallengeMatchLineup: React.FC<ChallengeMatchLineupProps> = ({
  players = [],
  allPlayers = [],
  mvpGroupMemberId = null,
  teamColor,
}) => {
  const theme = useTheme();
  const color = teamColor ?? theme.colors.primary;

  // Only starters on the field (including empty slots for scheduled matches)
  const starters = players.filter(p => !p.isSub);

  const renderPlayer = (player: ChallengeMatchPlayer, playerIndex: number) => {
    // Use indexOf so multiple null-groupMemberId slots in the same position get unique coords
    const playersInPosition = starters.filter(p => p.position === player.position);
    const indexInPosition = playersInPosition.indexOf(player);
    const coords = getPositionCoordinates(player.position, indexInPosition, playersInPosition.length);

    // Unique key: use groupMemberId if present, otherwise fallback to position+index
    const key = player.groupMemberId ?? `empty_${player.position}_${playerIndex}`;

    // Empty slot: show "?" placeholder with muted styling
    if (!player.groupMemberId) {
      return (
        <View
          key={key}
          style={[styles(theme).playerContainer, { left: `${coords.x}%`, top: `${coords.y}%` }]}
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
              <Text style={[styles(theme).positionText, { color: 'rgba(255,255,255,0.6)' }]}>
                {player.position}
              </Text>
            </View>
          </View>
          <Surface style={[styles(theme).nameSurface, { opacity: 0.6 }]} elevation={1}>
            <Text variant="labelSmall" style={[styles(theme).nameText, { color: '#999', fontStyle: 'italic' }]} numberOfLines={1}>
              ?
            </Text>
          </Surface>
        </View>
      );
    }

    const playerInfo = allPlayers.find(p => p.id === player.groupMemberId);
    if (!playerInfo) return null;

    const playerName = getShortName(playerInfo.displayName);
    const playerPhoto = playerInfo.photoUrl;
    const isMvp = mvpGroupMemberId === player.groupMemberId;
    const hasStats = player.goals > 0 || player.assists > 0 || player.ownGoals > 0;

    return (
      <View
        key={key}
        style={[styles(theme).playerContainer, { left: `${coords.x}%`, top: `${coords.y}%` }]}
      >
        <View style={[styles(theme).avatarWrapper, isMvp && styles(theme).mvpAvatarWrapper]}>
          {playerPhoto ? (
            <Avatar.Image source={{ uri: playerPhoto }} size={60} style={styles(theme).avatar} />
          ) : (
            <Avatar.Text
              label={playerName[0]?.toUpperCase() ?? '?'}
              size={60}
              labelStyle={styles(theme).avatarLabel}
              style={[
                styles(theme).avatar,
                { backgroundColor: player.position === 'POR' ? theme.colors.secondary : color },
              ]}
            />
          )}
          {isMvp && (
            <View style={styles(theme).mvpBadge}>
              <Icon name="star" size={12} color="#FFF" />
            </View>
          )}
          <View
            style={[
              styles(theme).positionChip,
              { borderColor: player.position === 'POR' ? theme.colors.secondary : color },
            ]}
          >
            <Text style={styles(theme).positionText}>{player.position}</Text>
          </View>
        </View>

        <Surface style={styles(theme).nameSurface} elevation={1}>
          <Text variant="labelSmall" style={styles(theme).nameText} numberOfLines={1}>
            {playerName}
          </Text>
        </Surface>

        {hasStats && (
          <Surface style={styles(theme).statsSurface} elevation={1}>
            {player.goals > 0 && (
              <View style={styles(theme).statItem}>
                <Icon name="soccer" size={12} color={color} />
                <Text variant="labelSmall" style={[styles(theme).statText, { color }]}>
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
                <Icon name="soccer" size={12} color={theme.colors.error} />
                <Text variant="labelSmall" style={styles(theme).statTextRed}>
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
    <View style={styles(theme).container}>
      {/* Football Field */}
      <View style={styles(theme).field}>
        <View style={styles(theme).fieldLines}>
          <View style={styles(theme).centerLine} />
          <View style={styles(theme).centerCircle} />
          <View style={[styles(theme).area, styles(theme).topArea]} />
          <View style={[styles(theme).smallArea, styles(theme).topSmallArea]} />
          <View style={[styles(theme).area, styles(theme).bottomArea]} />
          <View style={[styles(theme).smallArea, styles(theme).bottomSmallArea]} />
          <View style={styles(theme).fieldBorder} />
        </View>
        {starters.map((player, i) => renderPlayer(player, i))}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      width: '100%',
      backgroundColor: theme.colors.background,
      borderRadius: 8,
      overflow: 'hidden',
    },
    field: {
      position: 'relative',
      width: '100%',
      aspectRatio: 10 / 16.5,
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
    // Empty slot avatar: muted gray circle
    emptyAvatarWrapper: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mvpAvatarWrapper: {
      borderColor: '#FFD700',
      shadowColor: '#FFD700',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 12,
      elevation: 8,
    },
    avatar: {
      backgroundColor: 'transparent',
    },
    avatarLabel: {
      fontSize: 24,
      fontWeight: 'bold',
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
      fontSize: 10,
    },
    statTextBlue: {
      fontWeight: 'bold',
      color: '#1565C0',
      fontSize: 10,
    },
    statTextRed: {
      fontWeight: 'bold',
      color: '#C62828',
      fontSize: 10,
    },
  });

export default ChallengeMatchLineup;
