import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Button,
  Portal,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';

import { useAppSelector } from '../app/hooks';
import { subscribeToMatchesByGroupId, type Match } from '../repositories/matches/matchesRepository';
import { getGroupMembersV2ByGroupId, type GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import MatchLineup from '../components/MatchLineup';
import PlayersList from '../components/PlayersList';

// Icon component for year button - moved outside to avoid warnings
const CalendarIcon = () => <Icon name="calendar-month" size={20} color="#FFFFFF" />;

export default function MatchesScreen() {
  const theme = useTheme();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [allPlayers, setAllPlayers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'historico'>(
    new Date().getFullYear(),
  );
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Load group members once when group changes
  useEffect(() => {
    if (!selectedGroupId) {
      setAllPlayers([]);
      return;
    }

    getGroupMembersV2ByGroupId(selectedGroupId)
      .then(members => setAllPlayers(members))
      .catch(err => console.error('Error loading group members:', err));
  }, [selectedGroupId]);

  // Subscribe to matches in real-time
  useEffect(() => {
    if (!selectedGroupId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToMatchesByGroupId(selectedGroupId, matchesData => {
      setAllMatches(matchesData);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [selectedGroupId]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 2025;
    const years: number[] = [];
    for (let y = currentYear; y >= startYear; y--) {
      years.push(y);
    }
    return [
      { value: 'historico' as const, label: 'Histórico' },
      ...years.map(year => ({ value: year, label: year.toString() })),
    ];
  }, []);

  const matches = useMemo(() => {
    if (selectedYear === 'historico') return allMatches;
    return allMatches.filter(m => new Date(m.date).getFullYear() === selectedYear);
  }, [allMatches, selectedYear]);

  const getYearLabel = (year: number | 'historico') => {
    const option = yearOptions.find(opt => opt.value === year);
    return option?.label || year.toString();
  };

  const handleOpenYearSelector = useCallback(() => {
    bottomSheetRef.current?.expand();
  }, []);

  const handleSelectYear = useCallback((year: number | 'historico') => {
    setSelectedYear(year);
    bottomSheetRef.current?.close();
  }, []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

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
                mvpGroupMemberId={match.mvpGroupMemberId}
              />

              <View style={styles(theme).spacing} />

              {/* Players List */}
              <PlayersList
                team1Players={match.players1}
                team2Players={match.players2}
                allPlayers={allPlayers}
                mvpGroupMemberId={match.mvpGroupMemberId}
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

  return (
    <View style={styles(theme).container}>
      {/* Header */}
      <Surface style={styles(theme).header} elevation={2}>
        <View style={styles(theme).headerContent}>
          <Text variant="bodySmall" style={styles(theme).matchCount}>
            Total: {matches.length} partido{matches.length !== 1 ? 's' : ''}
          </Text>
          <Button
            mode="contained"
            onPress={handleOpenYearSelector}
            icon={CalendarIcon}
            style={styles(theme).yearButton}
            contentStyle={styles(theme).yearButtonContent}
            labelStyle={styles(theme).yearButtonLabel}
          >
            {getYearLabel(selectedYear)}
          </Button>
        </View>
      </Surface>

      <Divider />

      {/* Matches List */}
      <ScrollView
        style={styles(theme).scrollView}
        contentContainerStyle={styles(theme).contentContainer}
      >
        {matches.length === 0 ? (
          <View style={styles(theme).emptyState}>
            <Icon name="soccer" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={styles(theme).emptyText}>
              No hay partidos registrados
            </Text>
            <Text variant="bodyMedium" style={styles(theme).emptySubtext}>
              Los partidos aparecerán aquí cuando se registren
            </Text>
          </View>
        ) : (
          matches.map(match => renderMatch(match))
        )}
      </ScrollView>

      {/* Year Selection Bottom Sheet */}
      <Portal>
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={['50%']}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
        >
          <View style={styles(theme).bottomSheetContent}>
            <Text variant="titleMedium" style={styles(theme).bottomSheetTitle}>
              Seleccionar Temporada
            </Text>
            <BottomSheetFlatList
              data={yearOptions}
              keyExtractor={(item: { value: number | 'historico'; label: string }) => item.value.toString()}
              renderItem={({ item }: { item: { value: number | 'historico'; label: string } }) => (
                <Button
                  mode={selectedYear === item.value ? 'contained' : 'text'}
                  onPress={() => handleSelectYear(item.value)}
                  style={styles(theme).yearOptionButton}
                  contentStyle={styles(theme).yearOptionContent}
                >
                  {item.label}
                </Button>
              )}
            />
          </View>
        </BottomSheet>
      </Portal>
    </View>
  );
}

const styles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    gap: 12,
  },
  matchCount: {
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.9,
  },
  yearButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 8,
  },
  yearButtonContent: {
    paddingVertical: 4,
  },
  yearButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bottomSheetTitle: {
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  yearOptionButton: {
    marginVertical: 4,
  },
  yearOptionContent: {
    paddingVertical: 8,
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    gap: 16,
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
