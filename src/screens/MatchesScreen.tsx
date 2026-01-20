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
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { useAppSelector } from '../app/hooks';
import { getMatchesByGroupId, type Match } from '../repositories/matches/matchesRepository';
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
    const loadMatches = async () => {
      if (!selectedGroupId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const matchesData = await getMatchesByGroupId(selectedGroupId);
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
      } catch (err) {
        console.error('Error loading matches:', err);
        setError('No se pudieron cargar los partidos');
      } finally {
        setIsLoading(false);
      }
    };

    loadMatches();
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
    if (match.goalsTeam1 > match.goalsTeam2) return '#2196F3';
    if (match.goalsTeam2 > match.goalsTeam1) return '#2196F3';
    return '#FF9800';
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
        style={styles.matchCard}
        onPress={() => toggleMatchExpansion(match.id)}
      >
        <Card.Content style={styles.cardContent}>
          {/* Date */}
          <View style={styles.dateContainer}>
            <Icon name="calendar" size={16} color={theme.colors.onSurfaceVariant} />
            <Text variant="labelMedium" style={styles.dateText}>
              {formatDate(match.date)}
            </Text>
          </View>

          {/* Score */}
          <View style={styles.scoreContainer}>
            <View style={styles.teamScore}>
              <Text variant="headlineMedium" style={styles.teamLabel}>
                Equipo 1
              </Text>
              <Surface style={styles.scoreSurface} elevation={2}>
                <Text variant="displaySmall" style={styles.scoreText}>
                  {match.goalsTeam1}
                </Text>
              </Surface>
            </View>

            <View style={styles.vsContainer}>
              <Text variant="titleLarge" style={styles.vsText}>
                VS
              </Text>
            </View>

            <View style={styles.teamScore}>
              <Text variant="headlineMedium" style={styles.teamLabel}>
                Equipo 2
              </Text>
              <Surface style={styles.scoreSurface} elevation={2}>
                <Text variant="displaySmall" style={styles.scoreText}>
                  {match.goalsTeam2}
                </Text>
              </Surface>
            </View>
          </View>

          {/* Result Badge */}
          <View style={styles.resultContainer}>
            <Chip
              style={[styles.resultChip, { backgroundColor: resultColor }]}
              textStyle={styles.resultText}
            >
              {result}
            </Chip>
          </View>

          <Divider style={styles.divider} />

          {/* Lineups Section */}
          {isExpanded && (
            <>
              <View style={styles.sectionHeader}>
                <Icon name="soccer-field" size={20} color={theme.colors.primary} />
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Alineaciones
                </Text>
              </View>

              <MatchLineup
                team1Players={match.players1}
                team2Players={match.players2}
                allPlayers={allPlayers}
                mvpPlayerId={match.mvpPlayerId}
              />

              <View style={styles.spacing} />

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
          <View style={styles.expandIndicator}>
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
      <View style={styles.centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles.errorText}>
          No hay grupo seleccionado
        </Text>
        <Text variant="bodyMedium" style={styles.errorSubtext}>
          Por favor, seleccioná un grupo desde la pantalla de Grupos
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles.loadingText}>
          Cargando partidos...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles.errorText}>
          {error}
        </Text>
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="soccer" size={64} color={theme.colors.onSurfaceVariant} />
        <Text variant="titleMedium" style={styles.emptyText}>
          No hay partidos registrados
        </Text>
        <Text variant="bodyMedium" style={styles.emptySubtext}>
          Los partidos aparecerán aquí cuando se registren
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.headerTitle}>
          Partidos
        </Text>
        <Chip icon="soccer" style={styles.totalChip}>
          Total: {matches.length} partidos
        </Chip>
      </View>

      {/* Matches List */}
      {matches.map(match => renderMatch(match))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  },
  matchCard: {
    marginBottom: 16,
    borderRadius: 12,
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
    color: '#2196F3',
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
