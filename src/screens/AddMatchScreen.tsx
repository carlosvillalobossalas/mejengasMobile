import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
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
  Snackbar,
  MD3Theme,
  Portal,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import DatePicker from 'react-native-date-picker';

import { useAppSelector } from '../app/hooks';
import { getGroupMembersV2ByGroupId, type GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import { saveMatch } from '../services/matches/matchSaveService';

type Position = 'POR' | 'DEF' | 'MED' | 'DEL';

type TeamPlayer = {
  position: Position;
  groupMemberId: string | null;
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

const PLAYERS_BY_TYPE: Record<string, number> = {
  futbol_5: 5,
  futbol_7: 7,
  futbol_11: 11,
};

const getDefaultPosition = (index: number, total: number): Position => {
  if (index === 0) return 'POR';
  if (total <= 5) {
    // POR, DEF, DEF, MED, DEL
    if (index <= 2) return 'DEF';
    if (index <= 3) return 'MED';
    return 'DEL';
  }
  if (total <= 7) {
    // POR, DEF x3, MED x2, DEL
    if (index <= 3) return 'DEF';
    if (index <= 5) return 'MED';
    return 'DEL';
  }
  // 11: POR, DEF x4, MED x4, DEL x2
  if (index <= 4) return 'DEF';
  if (index <= 8) return 'MED';
  return 'DEL';
};

const createDefaultTeamPlayers = (total: number): TeamPlayer[] =>
  Array.from({ length: total }, (_, index) => ({
    position: getDefaultPosition(index, total),
    groupMemberId: null,
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
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);

  // Derive team size from the selected group's type
  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null;
  const teamSize = PLAYERS_BY_TYPE[selectedGroup?.type ?? 'futbol_7'] ?? 7;

  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);
  const [matchDate, setMatchDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [players, setPlayers] = useState<GroupMemberV2[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [isPlayerPickerVisible, setIsPlayerPickerVisible] = useState(false);
  const [positionMenuIndex, setPositionMenuIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const [team1Players, setTeam1Players] = useState<TeamPlayer[]>(() => createDefaultTeamPlayers(teamSize));

  const [team2Players, setTeam2Players] = useState<TeamPlayer[]>(() => createDefaultTeamPlayers(teamSize));

  // Re-initialize teams when the selected group changes (different type = different size)
  useEffect(() => {
    setTeam1Players(createDefaultTeamPlayers(teamSize));
    setTeam2Players(createDefaultTeamPlayers(teamSize));
  }, [teamSize]);

  // Load players when component mounts
  useEffect(() => {
    const loadPlayers = async () => {
      if (!selectedGroupId) {
        return;
      }

      setIsLoadingPlayers(true);
      try {
        const membersData = await getGroupMembersV2ByGroupId(selectedGroupId);
        // Already sorted by displayName from the repository query
        setPlayers(membersData);
      } catch (error) {
        console.error('Error loading group members:', error);
      } finally {
        setIsLoadingPlayers(false);
      }
    };

    loadPlayers();
  }, [selectedGroupId]);

  const currentTeamPlayers = activeTab === 0 ? team1Players : activeTab === 1 ? team2Players : [];
  const setCurrentTeamPlayers = activeTab === 0 ? setTeam1Players : activeTab === 1 ? setTeam2Players : () => { };

  const team1Goals = useMemo(() => {
    const goals = team1Players.reduce((sum, player) => sum + parseStatValue(player.goals), 0);
    const opponentOwnGoals = team2Players.reduce((sum, player) => sum + parseStatValue(player.ownGoals), 0);
    return goals + opponentOwnGoals;
  }, [JSON.stringify(team1Players.map(p => ({ id: p.groupMemberId, goals: p.goals }))), JSON.stringify(team2Players.map(p => ({ id: p.groupMemberId, ownGoals: p.ownGoals })))]);

  const team2Goals = useMemo(() => {
    const goals = team2Players.reduce((sum, player) => sum + parseStatValue(player.goals), 0);
    const opponentOwnGoals = team1Players.reduce((sum, player) => sum + parseStatValue(player.ownGoals), 0);
    return goals + opponentOwnGoals;
  }, [JSON.stringify(team2Players.map(p => ({ id: p.groupMemberId, goals: p.goals }))), JSON.stringify(team1Players.map(p => ({ id: p.groupMemberId, ownGoals: p.ownGoals })))]);

  const selectedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    team1Players.forEach(p => p.groupMemberId && ids.add(p.groupMemberId));
    team2Players.forEach(p => p.groupMemberId && ids.add(p.groupMemberId));
    return ids;
  }, [JSON.stringify(team1Players.map(p => p.groupMemberId)), JSON.stringify(team2Players.map(p => p.groupMemberId))]);

  const availablePlayers = useMemo(() => {
    return players.filter(player => !selectedPlayerIds.has(player.id));
  }, [players, selectedPlayerIds]);

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];

    const team1Selected = team1Players.filter(p => p.groupMemberId !== null).length;
    const team2Selected = team2Players.filter(p => p.groupMemberId !== null).length;

    if (team1Selected < teamSize) {
      warnings.push(`Equipo 1: faltan ${teamSize - team1Selected} jugador(es) por seleccionar`);
    }
    if (team2Selected < teamSize) {
      warnings.push(`Equipo 2: faltan ${teamSize - team2Selected} jugador(es) por seleccionar`);
    }

    if (!matchDate) {
      warnings.push('Selecciona una fecha para el partido');
    }

    const team1PorCount = team1Players.filter(p => p.position === 'POR').length;
    const team2PorCount = team2Players.filter(p => p.position === 'POR').length;

    if (team1PorCount !== 1) {
      warnings.push(`Equipo 1 debe tener exactamente 1 portero (tiene ${team1PorCount})`);
    }
    if (team2PorCount !== 1) {
      warnings.push(`Equipo 2 debe tener exactamente 1 portero (tiene ${team2PorCount})`);
    }

    return warnings;
  }, [team1Players, team2Players, matchDate, teamSize]);

  const canSave = validationWarnings.length === 0;

  const handlePositionChange = useCallback((index: number, position: Position) => {
    const updated = [...currentTeamPlayers];
    updated[index].position = position;
    setCurrentTeamPlayers(updated);
  }, [currentTeamPlayers, setCurrentTeamPlayers]);

  const handlePlayerSelect = useCallback((member: GroupMemberV2) => {
    if (selectedRowIndex === null) return;

    const updated = [...currentTeamPlayers];
    updated[selectedRowIndex].groupMemberId = member.id;
    updated[selectedRowIndex].playerName = member.displayName;
    setCurrentTeamPlayers(updated);

    setIsPlayerPickerVisible(false);
    setSelectedRowIndex(null);
  }, [selectedRowIndex, currentTeamPlayers, setCurrentTeamPlayers]);

  const handleStatChange = useCallback((index: number, field: 'goals' | 'assists' | 'ownGoals', value: string) => {
    const updated = [...currentTeamPlayers];
    updated[index][field] = normalizeNumberInput(value);
    setCurrentTeamPlayers(updated);
  }, [currentTeamPlayers, setCurrentTeamPlayers]);

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

  const openPlayerPicker = useCallback((index: number) => {
    setSelectedRowIndex(index);
    setIsPlayerPickerVisible(true);
  }, []);

  const closePlayerPicker = useCallback(() => {
    setIsPlayerPickerVisible(false);
    setSelectedRowIndex(null);
  }, []);

  const handleSaveMatch = async () => {
    // Button is disabled when canSave is false, but guard here for safety
    if (!canSave || !matchDate) return;

    setIsSaving(true);
    try {
      await saveMatch({
        date: matchDate,
        groupId: selectedGroupId!,
        team1Players,
        team2Players,
        team1Goals,
        team2Goals,
      });

      setSnackbarMessage('Partido guardado exitosamente');
      setSnackbarVisible(true);

      // Reset form
      setTeam1Players(createDefaultTeamPlayers(teamSize));
      setTeam2Players(createDefaultTeamPlayers(teamSize));
      setMatchDate(null);
      setActiveTab(0);
    } catch (error) {
      console.error('Error saving match:', error);
      setSnackbarMessage('Error al guardar el partido');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
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
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No hay grupo seleccionado
        </Text>
      </View>
    );
  }

  return (
    <View style={styles(theme).container}>
      {/* Tabs */}
      <View style={styles(theme).tabsContainer}>
        <TouchableOpacity
          style={styles(theme).tabButton}
          onPress={() => setActiveTab(0)}
          activeOpacity={0.7}
        >
          <Surface
            style={[styles(theme).tab, activeTab === 0 && styles(theme).activeTab]}
            elevation={activeTab === 0 ? 2 : 0}
          >
            <Text
              variant="labelLarge"
              style={[styles(theme).tabText, activeTab === 0 && styles(theme).activeTabText]}
            >
              Equipo 1
            </Text>
          </Surface>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles(theme).tabButton}
          onPress={() => setActiveTab(1)}
          activeOpacity={0.7}
        >
          <Surface
            style={[styles(theme).tab, activeTab === 1 && styles(theme).activeTab]}
            elevation={activeTab === 1 ? 2 : 0}
          >
            <Text
              variant="labelLarge"
              style={[styles(theme).tabText, activeTab === 1 && styles(theme).activeTabText]}
            >
              Equipo 2
            </Text>
          </Surface>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles(theme).tabButton}
          onPress={() => setActiveTab(2)}
          activeOpacity={0.7}
        >
          <Surface
            style={[styles(theme).tab, activeTab === 2 && styles(theme).activeTab]}
            elevation={activeTab === 2 ? 2 : 0}
          >
            <Text
              variant="labelLarge"
              style={[styles(theme).tabText, activeTab === 2 && styles(theme).activeTabText]}
            >
              Guardar
            </Text>
          </Surface>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab < 2 ? (
        <ScrollView style={styles(theme).content}>
          {/* Table Header */}
          <View style={styles(theme).tableHeader}>
            <Text style={[styles(theme).headerCell, styles(theme).positionColumn]}>Pos.</Text>
            <Text style={[styles(theme).headerCell, styles(theme).playerColumn]}>Jugador</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>Gol</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>Ast</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>A.G</Text>
          </View>

          {/* Table Rows */}
          {currentTeamPlayers.map((player, index) => (
            <View key={index} style={styles(theme).tableRow}>
              {/* Position Picker */}
              <View style={styles(theme).positionColumn}>
                <Menu
                  visible={positionMenuIndex === index}
                  onDismiss={() => setPositionMenuIndex(null)}
                  anchor={
                    <TouchableOpacity
                      onPress={() => setPositionMenuIndex(index)}
                      style={styles(theme).positionAnchor}
                    >
                      <Surface style={styles(theme).positionPicker} elevation={1}>
                        <Text style={styles(theme).positionText}>{player.position}</Text>
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
                style={styles(theme).playerColumn}
                onPress={() => openPlayerPicker(index)}
              >
                <Surface style={styles(theme).playerSelector} elevation={1}>
                  <Text
                    style={styles(theme).playerText}
                    numberOfLines={1}
                  >
                    {player.playerName || `J${index + 1}`}
                  </Text>
                  <Icon name="menu-down" size={20} color="#666" />
                </Surface>
              </TouchableOpacity>

              {/* Goals */}
              <View style={styles(theme).statColumn}>
                <TextInput
                  mode="outlined"
                  value={player.goals}
                  onChangeText={(value) => handleStatChange(index, 'goals', value)}
                  onFocus={() => handleStatFocus(index, 'goals')}
                  onBlur={() => handleStatBlur(index, 'goals')}
                  keyboardType="number-pad"
                  style={styles(theme).statInput}
                  dense
                />
              </View>

              {/* Assists */}
              <View style={styles(theme).statColumn}>
                <TextInput
                  mode="outlined"
                  value={player.assists}
                  onChangeText={(value) => handleStatChange(index, 'assists', value)}
                  onFocus={() => handleStatFocus(index, 'assists')}
                  onBlur={() => handleStatBlur(index, 'assists')}
                  keyboardType="number-pad"
                  style={styles(theme).statInput}
                  dense
                />
              </View>

              {/* Own Goals */}
              <View style={styles(theme).statColumn}>
                <TextInput
                  mode="outlined"
                  value={player.ownGoals}
                  onChangeText={(value) => handleStatChange(index, 'ownGoals', value)}
                  onFocus={() => handleStatFocus(index, 'ownGoals')}
                  onBlur={() => handleStatBlur(index, 'ownGoals')}
                  keyboardType="number-pad"
                  style={styles(theme).statInput}
                  dense
                />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView style={styles(theme).content} contentContainerStyle={styles(theme).summaryContent}>
          {/* Score Display */}
          <Surface style={styles(theme).scoreCard} elevation={2}>
            <View style={styles(theme).scoreContainer}>
              <View style={styles(theme).teamScore}>
                <Text variant="titleLarge" style={styles(theme).teamLabel}>
                  Equipo 1
                </Text>
                <View style={styles(theme).scoreCircle}>
                  <Text variant="displayMedium" style={styles(theme).scoreText}>
                    {team1Goals}
                  </Text>
                </View>
              </View>

              <Text variant="headlineMedium" style={styles(theme).vsText}>
                VS
              </Text>

              <View style={styles(theme).teamScore}>
                <Text variant="titleLarge" style={styles(theme).teamLabel}>
                  Equipo 2
                </Text>
                <View style={styles(theme).scoreCircle}>
                  <Text variant="displayMedium" style={styles(theme).scoreText}>
                    {team2Goals}
                  </Text>
                </View>
              </View>
            </View>

            {/* Result Badge */}
            <Chip
              style={[
                styles(theme).resultChip,
                {
                  backgroundColor:
                    team1Goals > team2Goals
                      ? '#2196F3'
                      : team2Goals > team1Goals
                        ? '#2196F3'
                        : '#FF9800',
                },
              ]}
              textStyle={styles(theme).resultChipText}
            >
              {team1Goals > team2Goals
                ? 'Victoria Equipo 1'
                : team2Goals > team1Goals
                  ? 'Victoria Equipo 2'
                  : 'Empate'}
            </Chip>
          </Surface>

          {/* Date Picker */}
          <Surface style={styles(theme).dateCard} elevation={1}>
            <Text variant="titleMedium" style={styles(theme).dateLabel}>
              Fecha del partido
            </Text>
            <TextInput
              value={matchDate ? formatDate(matchDate) : ''}
              placeholder="Seleccionar fecha"
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
            date={matchDate ?? new Date()}
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

          {/* Validation Warnings */}
          {validationWarnings.length > 0 && (
            <Surface style={styles(theme).warningsCard} elevation={0}>
              {validationWarnings.map((warning, index) => (
                <View key={index} style={styles(theme).warningRow}>
                  <Icon name="alert-circle" size={16} color={theme.colors.error} />
                  <Text style={styles(theme).warningText}>{warning}</Text>
                </View>
              ))}
            </Surface>
          )}

          {/* Save Button */}
          <Button
            mode="contained"
            onPress={handleSaveMatch}
            disabled={isSaving || !canSave}
            loading={isSaving}
            style={styles(theme).saveButton}
            contentStyle={styles(theme).saveButtonContent}
            icon="content-save"
          >
            Guardar Partido
          </Button>
        </ScrollView>
      )}

      {/* Player Picker Modal */}
      <Portal>
        <Modal
          visible={isPlayerPickerVisible}
          onRequestClose={closePlayerPicker}
          animationType="slide"
          transparent={true}
        >
          <View style={styles(theme).modalOverlay}>
            <Surface style={styles(theme).modalContent} elevation={5}>
              <View style={styles(theme).modalHeader}>
                <Text variant="titleLarge" style={styles(theme).modalTitle}>
                  Seleccionar Jugador
                </Text>
                <TouchableOpacity onPress={closePlayerPicker}>
                  <Icon name="close" size={24} color={theme.colors.onSurface} />
                </TouchableOpacity>
              </View>

              {isLoadingPlayers ? (
                <View style={styles(theme).loadingContainer}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
              ) : (
                <ScrollView style={styles(theme).modalList}>
                  {availablePlayers.map((member, index) => (
                    <React.Fragment key={member.id}>
                      <List.Item
                        title={member.displayName}
                        onPress={() => handlePlayerSelect(member)}
                        left={(props) => <List.Icon {...props} icon="account" />}
                        right={(props) => <List.Icon {...props} icon="chevron-right" />}
                      />
                      {index < availablePlayers.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}

                  {availablePlayers.length === 0 && (
                    <View style={styles(theme).emptyPlayersContainer}>
                      <Icon name="account-off" size={48} color="#999" />
                      <Text style={styles(theme).emptyPlayersText}>
                        {players.length === 0
                          ? 'No hay jugadores en este grupo'
                          : 'Todos los jugadores ya están seleccionados'}
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}

              {/* <View style={styles(theme).modalFooter}>
                <Button mode="outlined" onPress={closePlayerPicker}>
                  Cerrar
                </Button>
              </View> */}
            </Surface>
          </View>
        </Modal>
      </Portal>

      {/* Snackbar for feedback */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
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
    backgroundColor: theme.colors.primary,
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
    backgroundColor: theme.colors.primary,
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
    backgroundColor: theme.colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontWeight: 'bold',
    color: theme.colors.primary,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontWeight: 'bold',
  },
  modalList: {
    flex: 1,
    paddingHorizontal: 8,
    paddingBottom: 20,
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
  warningsCard: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.errorContainer,
    gap: 8,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningText: {
    flex: 1,
    color: theme.colors.error,
    fontSize: 13,
  },
});
