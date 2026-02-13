import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  DataTable,
  useTheme,
  Avatar,
  Divider,
  Surface,
  Button,
  Portal,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';

import { useAppSelector } from '../app/hooks';
import {
  preparePlayerStatsFromSeasonStats,
  type PlayerStatsAggregate,
} from '../endpoints/players/playerStatsEndpoints';
import { getPlayerDisplay } from '../helpers/players';
import PlayerProfileModal from '../components/PlayerProfileModal';

type SortColumn =
  | 'name'
  | 'goals'
  | 'assists'
  | 'mvp'
  | 'matches'
  | 'goalsPerMatch'
  | 'assistsPerMatch';

type SortDirection = 'ascending' | 'descending';

// Icon component for year button - moved outside to avoid warnings
const CalendarIcon = () => <Icon name="calendar-month" size={20} color="#FFFFFF" />;

export default function PlayersTableScreen() {
  const theme = useTheme();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString(),
  );
  const [allYearStats, setAllYearStats] = useState<
    Record<string, PlayerStatsAggregate[]>
  >({ historico: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortColumn>('goals');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');
  const bottomSheetRef = useRef<BottomSheet>(null);
  const playerProfileModalRef = useRef<BottomSheet>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerStatsAggregate | null>(null);

  // Load stats when component mounts or groupId changes
  useEffect(() => {
    const loadStats = async () => {
      if (!selectedGroupId) {
        return;
      }

      setIsLoading(true);
      try {
        const stats = await preparePlayerStatsFromSeasonStats(selectedGroupId);
        setAllYearStats(stats);
      } catch (error) {
        console.error('Error loading player stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [selectedGroupId]);

  const handleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortBy(column);
      setSortDirection('descending');
    }
  };

  const handleOpenYearSelector = useCallback(() => {
    bottomSheetRef.current?.expand();
  }, []);

  const handleSelectYear = useCallback((year: string) => {
    setSelectedYear(year);
    bottomSheetRef.current?.close();
  }, []);

  const handlePlayerPress = useCallback((player: PlayerStatsAggregate) => {
    setSelectedPlayer(player);
    playerProfileModalRef.current?.expand();
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

  const currentYearPlayers = useMemo(
    () => allYearStats[selectedYear] || [],
    [allYearStats, selectedYear],
  );

  const sortedPlayers = useMemo(() => {
    return [...currentYearPlayers].sort((a, b) => {
      let aValue: number | string = 0;
      let bValue: number | string = 0;

      switch (sortBy) {
        case 'name':
          aValue = getPlayerDisplay(a);
          bValue = getPlayerDisplay(b);
          break;
        case 'goals':
          aValue = a.goals;
          bValue = b.goals;
          break;
        case 'assists':
          aValue = a.assists;
          bValue = b.assists;
          break;
        case 'mvp':
          aValue = a.mvp;
          bValue = b.mvp;
          break;
        case 'matches':
          aValue = a.matches;
          bValue = b.matches;
          break;
        case 'goalsPerMatch':
          aValue = a.matches > 0 ? a.goals / a.matches : 0;
          bValue = b.matches > 0 ? b.goals / b.matches : 0;
          break;
        case 'assistsPerMatch':
          aValue = a.matches > 0 ? a.assists / a.matches : 0;
          bValue = b.matches > 0 ? b.assists / b.matches : 0;
          break;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'ascending'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === 'ascending'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
  }, [currentYearPlayers, sortBy, sortDirection]);

  const yearOptions = useMemo(() => {
    const years = Object.keys(allYearStats)
      .filter(y => y !== 'historico')
      .sort((a, b) => Number(b) - Number(a));
    return [
      { value: 'historico', label: 'Histórico' },
      ...years.map(year => ({ value: year, label: year })),
    ];
  }, [allYearStats]);

  const getYearLabel = (year: string) => {
    const option = yearOptions.find(opt => opt.value === year);
    return option?.label || year;
  };

  if (!selectedGroupId) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No hay grupo seleccionado
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyLarge" style={styles(theme).loadingText}>
          Cargando estadísticas...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles(theme).container}>
      {/* Header */}
      <Surface style={styles(theme).header} elevation={2}>
        <View style={styles(theme).headerContent}>
          {/* <View style={styles(theme).titleRow}>
            <Icon name="soccer" size={24} color="#FFFFFF" />
            <Text variant="titleLarge" style={styles(theme).headerTitle}>
              Jugadores
            </Text>
          </View> */}

          <Text variant="bodySmall" style={styles(theme).playerCount}>
            Total: {currentYearPlayers.length} jugadores
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

      {/* Table */}
      <ScrollView style={styles(theme).tableContainer}>
        <DataTable>
          {/* Table Header */}
          <DataTable.Header style={styles(theme).tableHeader}>
            <DataTable.Title
              style={styles(theme).rankColumn}
              textStyle={styles(theme).headerText}
            >
              #
            </DataTable.Title>
            <DataTable.Title
              sortDirection={sortBy === 'name' ? sortDirection : undefined}
              onPress={() => handleSort('name')}
              style={styles(theme).nameColumn}
              textStyle={styles(theme).headerText}
            >
              Jugador
            </DataTable.Title>
            <DataTable.Title
              numeric
              sortDirection={sortBy === 'goals' ? sortDirection : undefined}
              onPress={() => handleSort('goals')}
              style={styles(theme).statColumn}
              textStyle={styles(theme).headerText}
            >
              <Icon name="soccer" size={16} color="#FFFFFF" />
            </DataTable.Title>
            <DataTable.Title
              numeric
              sortDirection={sortBy === 'assists' ? sortDirection : undefined}
              onPress={() => handleSort('assists')}
              style={styles(theme).statColumn}
              textStyle={styles(theme).headerText}
            >
              <Icon name="shoe-cleat" size={16} color="#FFFFFF" />
            </DataTable.Title>
            <DataTable.Title
              numeric
              sortDirection={
                sortBy === 'mvp' ? sortDirection : undefined
              }
              onPress={() => handleSort('mvp')}
              style={styles(theme).statColumn}
              textStyle={styles(theme).headerText}
            >
              <Icon name="star" size={16} color="#FFFFFF" />
            </DataTable.Title>
            <DataTable.Title
              numeric
              sortDirection={sortBy === 'matches' ? sortDirection : undefined}
              onPress={() => handleSort('matches')}
              style={styles(theme).statColumn}
              textStyle={styles(theme).headerText}
            >
              <Icon name="stadium" size={16} color="#FFFFFF" />
            </DataTable.Title>
          </DataTable.Header>

          {/* Table Rows */}
          {sortedPlayers.map((player, index) => {
            return (
              <TouchableOpacity
                key={player.id}
                onPress={() => handlePlayerPress(player)}
                activeOpacity={0.7}
              >
                <DataTable.Row
                  style={[
                    styles(theme).tableRow,
                    index % 2 === 0 ? styles(theme).evenRow : styles(theme).oddRow,
                  ]}
                >
                  <DataTable.Cell style={styles(theme).rankColumn}>
                    <Text
                      variant="bodyMedium"
                      style={[
                        styles(theme).rankText,
                        index < 3 && styles(theme).topThreeRank,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </DataTable.Cell>

                  <DataTable.Cell style={styles(theme).nameColumn}>
                    <View style={styles(theme).playerInfo}>
                      {player.photoURL ? (
                        <Avatar.Image
                          size={32}
                          source={{ uri: player.photoURL }}
                        />
                      ) : (
                        <Avatar.Text
                          size={32}
                          label={getPlayerDisplay(player)?.[0]?.toUpperCase() || '?'}
                        />
                      )}
                      <Text
                        variant="bodyMedium"
                        style={styles(theme).playerName}
                        numberOfLines={1}
                      >
                        {getPlayerDisplay(player)}
                      </Text>
                    </View>
                  </DataTable.Cell>

                  <DataTable.Cell numeric style={styles(theme).statColumn}>
                    <Text variant="bodyMedium" style={styles(theme).goalsText}>
                      {player.goals}
                    </Text>
                  </DataTable.Cell>

                  <DataTable.Cell numeric style={styles(theme).statColumn}>
                    <Text variant="bodyMedium" style={styles(theme).assistsText}>
                      {player.assists}
                    </Text>
                  </DataTable.Cell>

                  <DataTable.Cell numeric style={styles(theme).statColumn}>
                    <Text variant="bodyMedium" style={styles(theme).combinedText}>
                      {player.mvp}
                    </Text>
                  </DataTable.Cell>

                  <DataTable.Cell numeric style={styles(theme).statColumn}>
                    <Text variant="bodyMedium" style={styles(theme).combinedText}>{player.matches}</Text>
                  </DataTable.Cell>
                </DataTable.Row>
              </TouchableOpacity>
            );
          })}

          {sortedPlayers.length === 0 && (
            <View style={styles(theme).emptyState}>
              <Icon
                name="account-off"
                size={64}
                color={theme.colors.onSurfaceDisabled}
              />
              <Text
                variant="titleMedium"
                style={[
                  styles(theme).emptyText,
                  { color: theme.colors.onSurfaceDisabled },
                ]}
              >
                No hay jugadores en esta temporada
              </Text>
            </View>
          )}
        </DataTable>
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
              keyExtractor={(item: { value: string; label: string }) => item.value}
              renderItem={({ item }: { item: { value: string; label: string } }) => (
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

        {/* Player Profile Modal */}
        <PlayerProfileModal
          userId={selectedPlayer?.userId || null}
          playerName={selectedPlayer?.name}
          playerPhotoURL={selectedPlayer?.photoURL}
          bottomSheetRef={playerProfileModalRef}
        />
      </Portal>
    </View>
  );
}

const styles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  errorText: {
    marginTop: 16,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
  },
  header: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: 'bold',
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
  playerCount: {
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.9,
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
  tableContainer: {
    flex: 1,
  },
  tableHeader: {
    backgroundColor: theme.colors.primary,
  },
  headerText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  tableRow: {
    minHeight: 56,
  },
  evenRow: {
    backgroundColor: '#FAFAFA',
  },
  oddRow: {
    backgroundColor: '#FFFFFF',
  },
  rankColumn: {
    flex: 0.5,
    justifyContent: 'center',
  },
  nameColumn: {
    flex: 2,
  },
  statColumn: {
    flex: 0.8,
    justifyContent: 'center',
  },
  rankText: {
    fontWeight: 'bold',
  },
  topThreeRank: {
    color: theme.colors.primary,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerName: {
    flex: 1,
  },
  goalsText: {
    // color: theme.colors.primary,
    fontWeight: 'bold',
  },
  assistsText: {
    // color: theme.colors.secondary,
    fontWeight: 'bold',
  },
  combinedText: {
    // color: theme.colors.tertiary,
    fontWeight: 'bold',
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    textAlign: 'center',
  },
});
