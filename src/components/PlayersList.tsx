import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Divider, useTheme, MD3Theme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { MatchPlayer } from '../repositories/matches/matchesRepository';
import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';

type PlayersListProps = {
  team1Players: MatchPlayer[];
  team2Players: MatchPlayer[];
  allPlayers: GroupMemberV2[];
  mvpGroupMemberId?: string | null;
};

const getPlayerInfo = (groupMemberId: string | null, allPlayers: GroupMemberV2[]): GroupMemberV2 | undefined => {
  if (!groupMemberId) return undefined;
  return allPlayers.find(p => p.id === groupMemberId);
};


const getPositionColor = (position: string, theme: MD3Theme): string => {
  switch (position) {
    case 'POR':
      return theme.colors.secondary;
    case 'DEF':
    case 'MED':
    case 'DEL':
    default:
      return theme.colors.primary;
  }
};

const POSITION_ORDER: Record<string, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

const sortByPosition = (players: MatchPlayer[]) =>
  [...players].sort((a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9));

const splitRoster = (players: MatchPlayer[]) => ({
  starters: sortByPosition(players.filter(p => !p.isSub)),
  subs: sortByPosition(players.filter(p => p.isSub)),
});

const PlayersList: React.FC<PlayersListProps> = ({
  team1Players = [],
  team2Players = [],
  allPlayers = [],
  mvpGroupMemberId = null,
}) => {
  const theme = useTheme();

  const renderPlayer = (player: MatchPlayer, rowKey: string) => {
    const playerInfo = getPlayerInfo(player.groupMemberId, allPlayers);
    const playerName = playerInfo?.displayName ?? 'Por asignar';
    const isMVP = !!player.groupMemberId && mvpGroupMemberId === player.groupMemberId;
    const hasStats = player.goals > 0 || player.assists > 0 || player.ownGoals > 0;

    return (
      <View key={rowKey} style={styles(theme).playerRow}>
        <View style={styles(theme).playerInfo}>
          <View
            style={[
              styles(theme).positionBadge,
              { backgroundColor: getPositionColor(player.position, theme) },
            ]}
          >
            <Text variant="labelSmall" style={styles(theme).positionText}>
              {player.position}
            </Text>
          </View>
          <Text variant="bodyMedium" style={styles(theme).playerName}>
            {playerName}
          </Text>
          {player.isSub && (
            <View style={styles(theme).subBadge}>
              <Text style={styles(theme).subText}>SUP</Text>
            </View>
          )}
        </View>

        <View style={styles(theme).statsContainer}>
          {isMVP && (
            <View style={styles(theme).mvpBadgeList}>
              <Icon name="star" size={16} color="#FFD700" />
            </View>
          )}
          {player.goals > 0 && (
            <View style={styles(theme).statBadge}>
              <Icon name="soccer" size={14} color={theme.colors.primary} />
              <Text variant="labelSmall" style={styles(theme).statValue}>
                {player.goals}
              </Text>
            </View>
          )}
          {player.assists > 0 && (
            <View style={styles(theme).statBadge}>
              <Icon name="shoe-cleat" size={12} color={theme.colors.secondary} />
              <Text variant="labelSmall" style={styles(theme).statValueBlue}>
                {player.assists}
              </Text>
            </View>
          )}
          {player.ownGoals > 0 && (
            <View style={styles(theme).statBadge}>
              <Icon name="soccer" size={14} color={theme.colors.error} />
              <Text variant="labelSmall" style={styles(theme).statValueRed}>
                {player.ownGoals}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderTeamSection = (players: MatchPlayer[], teamLabel: string) => {
    const { starters, subs } = splitRoster(players);
    return (
      <View style={styles(theme).teamSection}>
        <View style={styles(theme).teamHeader}>
          <Text variant="titleMedium" style={styles(theme).teamTitle}>
            {teamLabel}
          </Text>
        </View>
        {starters.map((player, idx) =>
          renderPlayer(player, `${teamLabel}_starter_${player.groupMemberId ?? 'empty'}_${idx}`),
        )}
        {subs.length > 0 && (
          <>
            <Divider style={styles(theme).subDivider} />
            <Text variant="labelMedium" style={styles(theme).subLabel}>
              Suplentes
            </Text>
            {subs.map((player, idx) =>
              renderPlayer(player, `${teamLabel}_sub_${player.groupMemberId ?? 'empty'}_${idx}`),
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles(theme).container}>
      {renderTeamSection(team1Players, 'Equipo 1')}
      <Divider style={styles(theme).divider} />
      {renderTeamSection(team2Players, 'Equipo 2')}
    </View>
  );
};

const styles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 16,
    gap: 16,
  },
  teamSection: {
    gap: 8,
  },
  teamHeader: {
    paddingBottom: 8,
  },
  teamTitle: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  positionBadge: {
    width: 36,
    height: 22,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  playerName: {
    flex: 1,
    color: theme.colors.onSurface,
  },
  subBadge: {
    backgroundColor: '#B0BEC5',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  subText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  subDivider: { marginVertical: 6 },
  subLabel: { color: '#888', marginBottom: 4 },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mvpBadgeList: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  statValueBlue: {
    fontSize: 13,
    color: '#666',
  },
  statValueRed: {
    fontSize: 13,
    color: '#E57373',
  },
  divider: {
    height: 2,
  },
});

export default PlayersList;
