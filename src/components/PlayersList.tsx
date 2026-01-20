import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Divider } from 'react-native-paper';
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


const getPositionColor = (position: string): string => {
  switch (position) {
    case 'POR':
      return '#FF9800';
    case 'DEF':
      return '#2196F3';
    case 'MED':
      return '#2196F3';
    case 'DEL':
      return '#2196F3';
    default:
      return '#2196F3';
  }
};

const PlayersList: React.FC<PlayersListProps> = ({
  team1Players = [],
  team2Players = [],
  allPlayers = [],
  mvpPlayerId = null,
}) => {
  const renderPlayer = (player: MatchPlayer) => {
    const playerInfo = getPlayerInfo(player.id, allPlayers);
    const playerName = getPlayerDisplay(playerInfo);
    const isMVP = mvpPlayerId && player.id === mvpPlayerId;
    const hasStats = player.goals > 0 || player.assists > 0 || player.ownGoals > 0;

    return (
      <View key={player.id} style={styles.playerRow}>
        <View style={styles.playerInfo}>
          <View
            style={[
              styles.positionBadge,
              { backgroundColor: getPositionColor(player.position) },
            ]}
          >
            <Text variant="labelSmall" style={styles.positionText}>
              {player.position}
            </Text>
          </View>
          <Text variant="bodyMedium" style={styles.playerName}>
            {playerName}
          </Text>
        </View>

        <View style={styles.statsContainer}>
          {isMVP && (
            <View style={styles.mvpBadgeList}>
              <Icon name="star" size={16} color="#FFD700" />
            </View>
          )}
          {player.goals > 0 && (
            <View style={styles.statBadge}>
              <Icon name="soccer" size={14} color="#4CAF50" />
              <Text variant="labelSmall" style={styles.statValue}>
                {player.goals}
              </Text>
            </View>
          )}
          {player.assists > 0 && (
            <View style={styles.statBadge}>
              <Icon name="shoe-cleat" size={12} color="#2196F3" />
              <Text variant="labelSmall" style={styles.statValueBlue}>
                {player.assists}
              </Text>
            </View>
          )}
          {player.ownGoals > 0 && (
            <View style={styles.statBadge}>
              <Icon name="soccer" size={14} color="#F44336" />
              <Text variant="labelSmall" style={styles.statValueRed}>
                {player.ownGoals}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Team 1 */}
      <View style={styles.teamSection}>
        <View style={styles.teamHeader}>
          <Text variant="titleMedium" style={styles.teamTitle}>
            Equipo 1
          </Text>
        </View>
        {team1Players.map(player => renderPlayer(player))}
      </View>

      <Divider style={styles.divider} />

      {/* Team 2 */}
      <View style={styles.teamSection}>
        <View style={styles.teamHeader}>
          <Text variant="titleMedium" style={styles.teamTitle}>
            Equipo 2
          </Text>
        </View>
        {team2Players.map(player => renderPlayer(player))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
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
    color: '#2196F3',
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
    color: '#4CAF50',
  },
  statValueBlue: {
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statValueRed: {
    fontWeight: 'bold',
    color: '#F44336',
  },
  divider: {
    height: 2,
  },
});

export default PlayersList;
