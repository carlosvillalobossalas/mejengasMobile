import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Surface,
  useTheme,
  List,
  Divider,
  Chip,
  Menu,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import DatePicker from 'react-native-date-picker';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

import { useAppSelector } from '../app/hooks';
import { getAllPlayersByGroup, type Player } from '../repositories/players/playerSeasonStatsRepository';
import { getPlayerDisplay } from '../helpers/players';

type Position = 'POR' | 'DEF' | 'MED' | 'DEL';

type TeamPlayer = {
  position: Position;
  playerId: string | null;
  playerName: string;
  goals: string;
  assists: string;
  ownGoals: string;
};

const POSITIONS: Position[] = ['POR', 'DEF', 'MED', 'DEL'];

const POSITION_LABELS: Record<Position, string> = {
  POR: 'Portero',
  DEF: 'Defensa',
  MED: 'Mediocampo',
  DEL: 'Delantero',
};

const getDefaultPosition = (index: number): Position => {
  if (index === 0) return 'POR';
  if (index <= 3) return 'DEF';
  if (index <= 5) return 'MED';
  return 'DEL';
};

const createDefaultTeamPlayers = (): TeamPlayer[] =>
  Array.from({ length: 7 }, (_, index) => ({
    position: getDefaultPosition(index),
    playerId: null,
    playerName: '',
    goals: '0',
    assists: '0',
    ownGoals: '0',
  }));

const normalizeNumberInput = (value: string) => {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned === '') return '';
  if (cleaned === '0') return '0';
  return cleaned.replace(/^0+(?=\d)/, '');
};

const parseStatValue = (value: string) => Number.parseInt(value || '0', 10) || 0;

export default function AddMatchScreen() {
  const theme = useTheme();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);
  const [matchDate, setMatchDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [playerSheetIndex, setPlayerSheetIndex] = useState(-1);
  const [positionMenuIndex, setPositionMenuIndex] = useState<number | null>(null);
  const playerSheetRef = useRef<BottomSheet>(null);
  const playerSheetSnapPoints = useMemo(() => ['60%', '85%'], []);

  const [team1Players, setTeam1Players] = useState<TeamPlayer[]>(createDefaultTeamPlayers);

  const [team2Players, setTeam2Players] = useState<TeamPlayer[]>(createDefaultTeamPlayers);

  // Load players when component mounts
  useEffect(() => {
    const loadPlayers = async () => {
      if (!selectedGroupId) {
        return;
      }

      setIsLoadingPlayers(true);
      try {
        const playersData = await getAllPlayersByGroup(selectedGroupId);
        setPlayers(playersData);
      } catch (error) {
        console.error('Error loading players:', error);
      } finally {
        setIsLoadingPlayers(false);
      }
    };

    loadPlayers();
  }, [selectedGroupId]);

  const currentTeamPlayers = activeTab === 0 ? team1Players : activeTab === 1 ? team2Players : [];
  const setCurrentTeamPlayers = activeTab === 0 ? setTeam1Players : activeTab === 1 ? setTeam2Players : () => {};

  const team1Goals = useMemo(() => {
    const goals = team1Players.reduce((sum, player) => sum + parseStatValue(player.goals), 0);
    const opponentOwnGoals = team2Players.reduce((sum, player) => sum + parseStatValue(player.ownGoals), 0);
    return goals + opponentOwnGoals;
  }, [team1Players, team2Players]);

  const team2Goals = useMemo(() => {
    const goals = team2Players.reduce((sum, player) => sum + parseStatValue(player.goals), 0);
    const opponentOwnGoals = team1Players.reduce((sum, player) => sum + parseStatValue(player.ownGoals), 0);
    return goals + opponentOwnGoals;
  }, [team1Players, team2Players]);

  const selectedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    team1Players.forEach(p => p.playerId && ids.add(p.playerId));
    team2Players.forEach(p => p.playerId && ids.add(p.playerId));
    return ids;
  }, [team1Players, team2Players]);

  const availablePlayers = useMemo(() => {
    return players.filter(player => !selectedPlayerIds.has(player.id));
  }, [players, selectedPlayerIds]);

  const handlePositionChange = (index: number, position: Position) => {
    const updated = [...currentTeamPlayers];
    updated[index].position = position;
    setCurrentTeamPlayers(updated);
  };

  const handlePlayerSelect = (player: Player) => {
    if (selectedRowIndex === null) return;

    const updated = [...currentTeamPlayers];
    updated[selectedRowIndex].playerId = player.id;
    updated[selectedRowIndex].playerName = getPlayerDisplay(player);
    setCurrentTeamPlayers(updated);
    
    // Close sheet immediately
    playerSheetRef.current?.close();
    setPlayerSheetIndex(-1);
    setSelectedRowIndex(null);
  };

  const handleStatChange = (index: number, field: 'goals' | 'assists' | 'ownGoals', value: string) => {
    const updated = [...currentTeamPlayers];
    updated[index][field] = normalizeNumberInput(value);
    setCurrentTeamPlayers(updated);
  };

  const handleStatFocus = (index: number, field: 'goals' | 'assists' | 'ownGoals') => {
    if (currentTeamPlayers[index][field] === '0') {
      handleStatChange(index, field, '');
    }
  };

  const handleStatBlur = (index: number, field: 'goals' | 'assists' | 'ownGoals') => {
    if (!currentTeamPlayers[index][field]) {
      handleStatChange(index, field, '0');
    }
  };

  const openPlayerPicker = (index: number) => {
    setSelectedRowIndex(index);
    setPlayerSheetIndex(0);
  };

  const handlePlayerSheetChange = (index: number) => {
    setPlayerSheetIndex(index);
    if (index === -1) {
      setSelectedRowIndex(null);
    }
  };

  const handleSaveMatch = () => {
    console.log('Saving match...', {
      date: matchDate,
      team1: team1Players,
      team2: team2Players,
      team1Goals,
      team2Goals,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (!selectedGroupId) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles.errorText}>
          No hay grupo seleccionado
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab(0)}
          activeOpacity={0.7}
        >
          <Surface
            style={[styles.tab, activeTab === 0 && styles.activeTab]}
            elevation={activeTab === 0 ? 2 : 0}
          >
            <Text
              variant="labelLarge"
              style={[styles.tabText, activeTab === 0 && styles.activeTabText]}
            >
              Equipo 1
            </Text>
          </Surface>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab(1)}
          activeOpacity={0.7}
        >
          <Surface
            style={[styles.tab, activeTab === 1 && styles.activeTab]}
            elevation={activeTab === 1 ? 2 : 0}
          >
            <Text
              variant="labelLarge"
              style={[styles.tabText, activeTab === 1 && styles.activeTabText]}
            >
              Equipo 2
            </Text>
          </Surface>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab(2)}
          activeOpacity={0.7}
        >
          <Surface
            style={[styles.tab, activeTab === 2 && styles.activeTab]}
            elevation={activeTab === 2 ? 2 : 0}
          >
            <Text
              variant="labelLarge"
              style={[styles.tabText, activeTab === 2 && styles.activeTabText]}
            >
              Guardar
            </Text>
          </Surface>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab < 2 ? (
        <ScrollView style={styles.content}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.positionColumn]}>Pos.</Text>
            <Text style={[styles.headerCell, styles.playerColumn]}>Jugador</Text>
            <Text style={[styles.headerCell, styles.statColumn]}>Gol</Text>
            <Text style={[styles.headerCell, styles.statColumn]}>Ast</Text>
            <Text style={[styles.headerCell, styles.statColumn]}>A.G</Text>
          </View>

          {/* Table Rows */}
          {currentTeamPlayers.map((player, index) => (
            <View key={index} style={styles.tableRow}>
              {/* Position Picker */}
              <View style={styles.positionColumn}>
                <Menu
                  visible={positionMenuIndex === index}
                  onDismiss={() => setPositionMenuIndex(null)}
                  anchor={
                    <TouchableOpacity
                      onPress={() => setPositionMenuIndex(index)}
                      style={styles.positionAnchor}
                    >
                      <Surface style={styles.positionPicker} elevation={1}>
                        <Text style={styles.positionText}>{player.position}</Text>
                        <Icon name="chevron-down" size={16} color="#666" />
                      </Surface>
                    </TouchableOpacity>
                  }
                >
                  {POSITIONS.map(pos => (
                    <Menu.Item
                      key={pos}
                      onPress={() => {
                        handlePositionChange(index, pos);
                        setPositionMenuIndex(null);
                      }}
                      title={`${pos} - ${POSITION_LABELS[pos]}`}
                    />
                  ))}
                </Menu>
              </View>

              {/* Player Selector */}
              <TouchableOpacity
                style={styles.playerColumn}
                onPress={() => openPlayerPicker(index)}
              >
                <Surface style={styles.playerSelector} elevation={1}>
                  <Text
                    style={styles.playerText}
                    numberOfLines={1}
                  >
                    {player.playerName || `J${index + 1}`}
                  </Text>
                  <Icon name="menu-down" size={20} color="#666" />
                </Surface>
              </TouchableOpacity>

              {/* Goals */}
              <View style={styles.statColumn}>
                <TextInput
                  mode="outlined"
                  value={player.goals}
                  onChangeText={(value) => handleStatChange(index, 'goals', value)}
                  onFocus={() => handleStatFocus(index, 'goals')}
                  onBlur={() => handleStatBlur(index, 'goals')}
                  keyboardType="number-pad"
                  style={styles.statInput}
                  dense
                />
              </View>

              {/* Assists */}
              <View style={styles.statColumn}>
                <TextInput
                  mode="outlined"
                  value={player.assists}
                  onChangeText={(value) => handleStatChange(index, 'assists', value)}
                  onFocus={() => handleStatFocus(index, 'assists')}
                  onBlur={() => handleStatBlur(index, 'assists')}
                  keyboardType="number-pad"
                  style={styles.statInput}
                  dense
                />
              </View>

              {/* Own Goals */}
              <View style={styles.statColumn}>
                <TextInput
                  mode="outlined"
                  value={player.ownGoals}
                  onChangeText={(value) => handleStatChange(index, 'ownGoals', value)}
                  onFocus={() => handleStatFocus(index, 'ownGoals')}
                  onBlur={() => handleStatBlur(index, 'ownGoals')}
                  keyboardType="number-pad"
                  style={styles.statInput}
                  dense
                />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.summaryContent}>
          {/* Score Display */}
          <Surface style={styles.scoreCard} elevation={2}>
            <View style={styles.scoreContainer}>
              <View style={styles.teamScore}>
                <Text variant="titleLarge" style={styles.teamLabel}>
                  Equipo 1
                </Text>
                <View style={styles.scoreCircle}>
                  <Text variant="displayMedium" style={styles.scoreText}>
                    {team1Goals}
                  </Text>
                </View>
              </View>

              <Text variant="headlineMedium" style={styles.vsText}>
                VS
              </Text>

              <View style={styles.teamScore}>
                <Text variant="titleLarge" style={styles.teamLabel}>
                  Equipo 2
                </Text>
                <View style={styles.scoreCircle}>
                  <Text variant="displayMedium" style={styles.scoreText}>
                    {team2Goals}
                  </Text>
                </View>
              </View>
            </View>

            {/* Result Badge */}
            <Chip
              style={[
                styles.resultChip,
                {
                  backgroundColor:
                    team1Goals > team2Goals
                      ? '#2196F3'
                      : team2Goals > team1Goals
                      ? '#2196F3'
                      : '#FF9800',
                },
              ]}
              textStyle={styles.resultChipText}
            >
              {team1Goals > team2Goals
                ? 'Victoria Equipo 1'
                : team2Goals > team1Goals
                ? 'Victoria Equipo 2'
                : 'Empate'}
            </Chip>
          </Surface>

          {/* Date Picker */}
          <Surface style={styles.dateCard} elevation={1}>
            <Text variant="titleMedium" style={styles.dateLabel}>
              Fecha del partido
            </Text>
            <TextInput
              value={formatDate(matchDate)}
              mode="outlined"
              editable={false}
              right={<TextInput.Icon icon="calendar" onPress={() => setShowDatePicker(true)} />}
              onPressIn={() => setShowDatePicker(true)}
            />
          </Surface>

          <DatePicker
            locale="ES"
            mode="date"
            modal
            open={showDatePicker}
            date={matchDate}
            onConfirm={(date) => {
              setShowDatePicker(false);
              const startOfDay = new Date(date);
              startOfDay.setHours(0, 0, 0, 0);
              setMatchDate(startOfDay);
            }}
            title="Seleccione fecha del partido"
            confirmText="Confirmar"
            cancelText="Cancelar"
            onCancel={() => setShowDatePicker(false)}
          />

          {/* Save Button */}
          <Button
            mode="contained"
            onPress={handleSaveMatch}
            style={styles.saveButton}
            contentStyle={styles.saveButtonContent}
            icon="content-save"
          >
            Guardar Partido
          </Button>
        </ScrollView>
      )}

      {/* Player Picker Bottom Sheet */}
      <BottomSheet
        ref={playerSheetRef}
        index={playerSheetIndex}
        snapPoints={playerSheetSnapPoints}
        enablePanDownToClose
        onChange={handlePlayerSheetChange}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
      >
        <View style={styles.bottomSheetHeader}>
          <Text variant="titleLarge" style={styles.bottomSheetTitle}>
            Seleccionar Jugador
          </Text>
        </View>

        {isLoadingPlayers ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <BottomSheetScrollView style={styles.bottomSheetList}>
            {availablePlayers.map((player, index) => (
              <React.Fragment key={player.id}>
                <List.Item
                  title={getPlayerDisplay(player)}
                  onPress={() => handlePlayerSelect(player)}
                  left={(props) => <List.Icon {...props} icon="account" />}
                  right={(props) => <List.Icon {...props} icon="chevron-right" />}
                />
                {index < availablePlayers.length - 1 && <Divider />}
              </React.Fragment>
            ))}

            {availablePlayers.length === 0 && (
              <View style={styles.emptyPlayersContainer}>
                <Icon name="account-off" size={48} color="#999" />
                <Text style={styles.emptyPlayersText}>
                  {players.length === 0 
                    ? 'No hay jugadores en este grupo'
                    : 'Todos los jugadores ya están seleccionados'}
                </Text>
              </View>
            )}
          </BottomSheetScrollView>
        )}

        <View style={styles.bottomSheetFooter}>
          <Button
            mode="outlined"
            onPress={() => {
              playerSheetRef.current?.close();
              setPlayerSheetIndex(-1);
              setSelectedRowIndex(null);
            }}
          >
            Cerrar
          </Button>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
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
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    elevation: 2,
  },
  tabButton: {
    flex: 1,
  },
  tab: {
    paddingVertical: 14,
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
  content: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2196F3',
    padding: 12,
    gap: 8,
  },
  headerCell: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
  },
  positionColumn: {
    width: 60,
  },
  playerColumn: {
    flex: 1,
  },
  statColumn: {
    width: 50,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    alignItems: 'center',
    minHeight: 60,
  },
  positionPicker: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  positionAnchor: {
    width: '100%',
  },
  positionText: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
  },
  playerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  playerText: {
    flex: 1,
    fontSize: 13,
  },
  statInput: {
    height: 36,
    fontSize: 14,
    textAlign: 'center',
  },
  summaryContent: {
    padding: 16,
    gap: 20,
  },
  scoreCard: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#FFF',
    alignItems: 'center',
    gap: 16,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
  },
  teamScore: {
    alignItems: 'center',
    gap: 12,
  },
  teamLabel: {
    fontWeight: 'bold',
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontWeight: 'bold',
    color: '#2196F3',
  },
  vsText: {
    fontWeight: 'bold',
    color: '#666',
  },
  resultChip: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  resultChipText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  dateCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFF',
    gap: 12,
  },
  dateLabel: {
    fontWeight: 'bold',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  dateText: {
    textTransform: 'capitalize',
  },
  saveButton: {
    borderRadius: 8,
  },
  saveButtonContent: {
    paddingVertical: 8,
  },
  bottomSheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  bottomSheetTitle: {
    fontWeight: 'bold',
  },
  bottomSheetList: {
    paddingHorizontal: 8,
  },
  bottomSheetFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyPlayersContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  emptyPlayersText: {
    color: '#999',
    textAlign: 'center',
  },
  closeButton: {
    marginTop: 16,
  },
});
