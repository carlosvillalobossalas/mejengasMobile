import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Divider, useTheme, MD3Theme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { MatchPlayer } from '../repositories/matches/matchesRepository';
import type { Player } from '../repositories/players/playerSeasonStatsRepository';
import { getPlayerDisplay } from '../helpers/players';

type PlayersListProps = {
  team1Players: MatchPlayer[];
  team2Players: MatchPlayer[];
  allPlayers: Player[];
  mvpPlayerId?: string | null;
};

const getPlayerInfo = (playerId: string, allPlayers: Player[]): Player | undefined => {
  return allPlayers.find(p => p.id === playerId);
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

const PlayersList: React.FC<PlayersListProps> = ({
  team1Players = [],
  team2Players = [],
  allPlayers = [],
  mvpPlayerId = null,
}) => {
  const theme = useTheme();

  const renderPlayer = (player: MatchPlayer) => {
    const playerInfo = getPlayerInfo(player.id, allPlayers);
    const playerName = getPlayerDisplay(playerInfo);
    const isMVP = mvpPlayerId && player.id === mvpPlayerId;
    const hasStats = player.goals > 0 || player.assists > 0 || player.ownGoals > 0;

    return (
      <View key={player.id} style={styles(theme).playerRow}>
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

  return (
    <View style={styles(theme).container}>
      {/* Team 1 */}
      <View style={styles(theme).teamSection}>
        <View style={styles(theme).teamHeader}>
          <Text variant="titleMedium" style={styles(theme).teamTitle}>
            Equipo 1
          </Text>
        </View>
        {team1Players.map(player => renderPlayer(player))}
      </View>

      <Divider style={styles(theme).divider} />

      {/* Team 2 */}
      <View style={styles(theme).teamSection}>
        <View style={styles(theme).teamHeader}>
          <Text variant="titleMedium" style={styles(theme).teamTitle}>
            Equipo 2
          </Text>
        </View>
        {team2Players.map(player => renderPlayer(player))}
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  positionBadge: {
    width: 40,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 10,
  },
  playerName: {
    flex: 1,
  },
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
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  statValueBlue: {
    fontWeight: 'bold',
    color: theme.colors.secondary,
  },
  statValueRed: {
    fontWeight: 'bold',
    color: theme.colors.error,
  },
  divider: {
    height: 2,
  },
});

export default PlayersList;
