import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  Text,
  Card,
  Chip,
  Divider,
  Surface,
  useTheme,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { useAppSelector } from '../app/hooks';
import { getMatchesByGroupId, subscribeToMatchesByGroupId, type Match } from '../repositories/matches/matchesRepository';
import { getPlayersByIds, type Player } from '../repositories/players/playerSeasonStatsRepository';
import MatchLineup from '../components/MatchLineup';
import PlayersList from '../components/PlayersList';

export default function MatchesScreen() {
  const theme = useTheme();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  const [matches, setMatches] = useState<Match[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGroupId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Subscribe to matches in real-time
    const unsubscribe = subscribeToMatchesByGroupId(selectedGroupId, async (matchesData) => {
      try {
        setMatches(matchesData);

        // Get all unique player IDs
        const playerIds = new Set<string>();
        matchesData.forEach(match => {
          match.players1.forEach(p => playerIds.add(p.id));
          match.players2.forEach(p => playerIds.add(p.id));
        });

        // Fetch player info
        const playersMap = await getPlayersByIds(Array.from(playerIds));
        setAllPlayers(Array.from(playersMap.values()));
        setIsLoading(false);
      } catch (err) {
        console.error('Error processing matches:', err);
        setError('No se pudieron procesar los partidos');
        setIsLoading(false);
      }
    });

    // Cleanup subscription on unmount or groupId change
    return () => {
      unsubscribe();
    };
  }, [selectedGroupId]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const weekday = date.toLocaleDateString('es-ES', { weekday: 'long' });
    const day = date.getDate();
    const month = date.toLocaleDateString('es-ES', { month: 'long' });
    const year = date.getFullYear();

    return `${weekday}, ${day} de ${month} de ${year}`;
  };

  const getMatchResult = (match: Match): string => {
    if (match.goalsTeam1 > match.goalsTeam2) return 'Victoria Equipo 1';
    if (match.goalsTeam2 > match.goalsTeam1) return 'Victoria Equipo 2';
    return 'Empate';
  };

  const getMatchResultColor = (match: Match): string => {
    if (match.goalsTeam1 > match.goalsTeam2) return theme.colors.primary;
    if (match.goalsTeam2 > match.goalsTeam1) return theme.colors.primary;
    return theme.colors.secondary;
  };

  const toggleMatchExpansion = (matchId: string) => {
    setExpandedMatchId(expandedMatchId === matchId ? null : matchId);
  };

  const renderMatch = (match: Match) => {
    const isExpanded = expandedMatchId === match.id;
    const result = getMatchResult(match);
    const resultColor = getMatchResultColor(match);

    return (
      <Card
        key={match.id}
        style={styles(theme).matchCard}
        onPress={() => toggleMatchExpansion(match.id)}
      >
        <Card.Content style={styles(theme).cardContent}>
          {/* Date */}
          <View style={styles(theme).dateContainer}>
            <Icon name="calendar" size={16} color={theme.colors.onSurfaceVariant} />
            <Text variant="labelMedium" style={styles(theme).dateText}>
              {formatDate(match.date)}
            </Text>
          </View>

          {/* Score */}
          <View style={styles(theme).scoreContainer}>
            <View style={styles(theme).teamScore}>
              <Text variant="headlineMedium" style={styles(theme).teamLabel}>
                Equipo 1
              </Text>
              <Surface style={styles(theme).scoreSurface} elevation={2}>
                <Text variant="displaySmall" style={styles(theme).scoreText}>
                  {match.goalsTeam1}
                </Text>
              </Surface>
            </View>

            <View style={styles(theme).vsContainer}>
              <Text variant="titleLarge" style={styles(theme).vsText}>
                VS
              </Text>
            </View>

            <View style={styles(theme).teamScore}>
              <Text variant="headlineMedium" style={styles(theme).teamLabel}>
                Equipo 2
              </Text>
              <Surface style={styles(theme).scoreSurface} elevation={2}>
                <Text variant="displaySmall" style={styles(theme).scoreText}>
                  {match.goalsTeam2}
                </Text>
              </Surface>
            </View>
          </View>

          {/* Result Badge */}
          <View style={styles(theme).resultContainer}>
            <Chip
              style={[styles(theme).resultChip, { backgroundColor: resultColor }]}
              textStyle={styles(theme).resultText}
            >
              {result}
            </Chip>
          </View>

          <Divider style={styles(theme).divider} />

          {/* Lineups Section */}
          {isExpanded && (
            <>
              <View style={styles(theme).sectionHeader}>
                <Icon name="soccer-field" size={20} color={theme.colors.primary} />
                <Text variant="titleMedium" style={styles(theme).sectionTitle}>
                  Alineaciones
                </Text>
              </View>

              <MatchLineup
                team1Players={match.players1}
                team2Players={match.players2}
                allPlayers={allPlayers}
                mvpPlayerId={match.mvpPlayerId}
              />

              <View style={styles(theme).spacing} />

              {/* Players List */}
              <PlayersList
                team1Players={match.players1}
                team2Players={match.players2}
                allPlayers={allPlayers}
                mvpPlayerId={match.mvpPlayerId}
              />
            </>
          )}

          {/* Expand/Collapse Indicator */}
          <View style={styles(theme).expandIndicator}>
            <Icon
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={theme.colors.primary}
            />
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (!selectedGroupId) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No hay grupo seleccionado
        </Text>
        <Text variant="bodyMedium" style={styles(theme).errorSubtext}>
          Por favor, seleccioná un grupo desde la pantalla de Grupos
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>
          Cargando partidos...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          {error}
        </Text>
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="soccer" size={64} color={theme.colors.onSurfaceVariant} />
        <Text variant="titleMedium" style={styles(theme).emptyText}>
          No hay partidos registrados
        </Text>
        <Text variant="bodyMedium" style={styles(theme).emptySubtext}>
          Los partidos aparecerán aquí cuando se registren
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles(theme).container}
      contentContainerStyle={styles(theme).contentContainer}
    >
      {/* Header */}
      <View style={styles(theme).header}>
        <Text variant="headlineSmall" style={styles(theme).headerTitle}>
          Partidos
        </Text>
        <Chip icon="soccer" style={styles(theme).totalChip}>
          Total: {matches.length} partidos
        </Chip>
      </View>

      {/* Matches List */}
      {matches.map(match => renderMatch(match))}
    </ScrollView>
  );
}

const styles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
    gap: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
  },
  totalChip: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.onPrimary,
  },
  matchCard: {
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: theme.colors.onPrimary
  },
  cardContent: {
    gap: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    textTransform: 'capitalize',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  teamScore: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamLabel: {
    fontWeight: 'bold',
  },
  scoreSurface: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  scoreText: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  vsContainer: {
    paddingHorizontal: 16,
  },
  vsText: {
    fontWeight: 'bold',
    color: '#666',
  },
  resultContainer: {
    alignItems: 'center',
  },
  resultChip: {
    paddingHorizontal: 8,
  },
  resultText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  divider: {
    marginVertical: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  spacing: {
    height: 16,
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 8,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    color: '#666',
  },
  errorText: {
    textAlign: 'center',
    color: '#F44336',
  },
  errorSubtext: {
    textAlign: 'center',
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
  },
  emptySubtext: {
    textAlign: 'center',
    color: '#999',
  },
});
