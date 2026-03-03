import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Alert,
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
  Menu,
  Snackbar,
  Portal,
  Chip,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import DatePicker from 'react-native-date-picker';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';

import { useAppSelector } from '../app/hooks';
import {
  getGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import { getGroupsByIds } from '../repositories/groups/groupsRepository';
import { saveChallengeMatch, type ChallengeTeamPlayer } from '../services/matches/challengeMatchSaveService';
import type { AppDrawerParamList } from '../navigation/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Position = 'POR' | 'DEF' | 'MED' | 'DEL';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeNumberInput = (value: string): string => {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned === '') return '';
  if (cleaned === '0') return '0';
  return cleaned.replace(/^0+(?=\d)/, '');
};

const parseStatValue = (value: string): number =>
  Number.parseInt(value || '0', 10) || 0;

const formatDate = (date: Date): string => {
  const datePart = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timePart = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart}, ${timePart}`;
};

const createEmptyPlayer = (index: number): ChallengeTeamPlayer => ({
  position: index === 0 ? 'POR' : 'DEF',
  groupMemberId: null,
  goals: '0',
  assists: '0',
  ownGoals: '0',
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddChallengeMatchScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const activeGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<0 | 1>(0);
  const [players, setPlayers] = useState<ChallengeTeamPlayer[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [isPlayerPickerVisible, setIsPlayerPickerVisible] = useState(false);
  const [positionMenuIndex, setPositionMenuIndex] = useState<number | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Save tab state
  const [matchDate, setMatchDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [goalsOpponent, setGoalsOpponent] = useState('0');

  // ── Load group members ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!selectedGroupId) return;
      setIsLoading(true);
      try {
        const [members, groupsMap] = await Promise.all([
          getGroupMembersV2ByGroupId(selectedGroupId),
          getGroupsByIds([selectedGroupId]),
        ]);
        const group = groupsMap.get(selectedGroupId);
        const count = PLAYERS_BY_TYPE[group?.type ?? 'futbol_7'] ?? 7;
        setGroupMembers(members);
        setPlayers(Array.from({ length: count }, (_, i) => createEmptyPlayer(i)));
      } catch (err) {
        console.error('AddChallengeMatchScreen: error loading data', err);
        setSnackbarMessage('Error al cargar los jugadores');
        setSnackbarVisible(true);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [selectedGroupId]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const goalsTeam = useMemo(
    () => players.reduce((sum, p) => sum + parseStatValue(p.goals), 0),
    [players],
  );

  const selectedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    players.forEach(p => p.groupMemberId && ids.add(p.groupMemberId));
    return ids;
  }, [players]);

  const availablePlayers = useMemo(() => {
    const currentSlotMemberId =
      selectedRowIndex !== null ? (players[selectedRowIndex]?.groupMemberId ?? null) : null;
    return groupMembers.filter(p => {
      if (!selectedPlayerIds.has(p.id)) return true;
      return p.id === currentSlotMemberId;
    });
  }, [groupMembers, selectedPlayerIds, selectedRowIndex, players]);

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];
    const withPlayer = players.filter(p => p.groupMemberId !== null).length;
    if (withPlayer < players.length) {
      warnings.push(`Faltan ${players.length - withPlayer} jugador(es) por seleccionar`);
    }
    const porCount = players.filter(p => p.groupMemberId !== null && p.position === 'POR').length;
    if (porCount !== 1) {
      warnings.push(`El equipo debe tener exactamente 1 portero (tiene ${porCount})`);
    }
    if (!opponentName.trim()) {
      warnings.push('Ingresá el nombre del rival');
    }
    return warnings;
  }, [players, opponentName]);

  const canSave = validationWarnings.length === 0 && !isSaving;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePositionChange = useCallback(
    (index: number, position: Position) => {
      setPlayers(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], position };
        return updated;
      });
      setPositionMenuIndex(null);
    },
    [],
  );

  const handlePlayerSelect = useCallback(
    (member: GroupMemberV2) => {
      if (selectedRowIndex === null) return;
      setPlayers(prev => {
        const updated = [...prev];
        updated[selectedRowIndex] = {
          ...updated[selectedRowIndex],
          groupMemberId: member.id,
        };
        return updated;
      });
      setIsPlayerPickerVisible(false);
      setSelectedRowIndex(null);
    },
    [selectedRowIndex],
  );

  const handleStatChange = useCallback(
    (index: number, field: 'goals' | 'assists' | 'ownGoals', value: string) => {
      setPlayers(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: normalizeNumberInput(value) };
        return updated;
      });
    },
    [],
  );

  const handleStatFocus = (index: number, field: 'goals' | 'assists' | 'ownGoals') => {
    if (players[index][field] === '0') {
      handleStatChange(index, field, '');
    }
  };

  const handleStatBlur = (index: number, field: 'goals' | 'assists' | 'ownGoals') => {
    if (!players[index][field]) {
      handleStatChange(index, field, '0');
    }
  };

  const handleClearPlayer = useCallback((index: number) => {
    setPlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], groupMemberId: null };
      return updated;
    });
  }, []);

  const handleSave = () => {
    if (validationWarnings.length > 0) return;
    Alert.alert(
      'Guardar partido',
      '¿El partido fue disputado y deseas guardar las estadísticas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'default', onPress: confirmSave },
      ],
    );
  };

  const confirmSave = async () => {
    if (!selectedGroupId) return;
    setIsSaving(true);
    try {
      await saveChallengeMatch({
        date: matchDate,
        groupId: selectedGroupId,
        players,
        goalsTeam,
        opponentName,
        goalsOpponent: parseStatValue(goalsOpponent),
      });
      setSnackbarMessage('Partido guardado exitosamente');
      setSnackbarVisible(true);
      setTimeout(() => navigation.navigate('ChallengeMatches'), 1500);
    } catch (err) {
      console.error('AddChallengeMatchScreen: error saving match', err);
      setSnackbarMessage('Error al guardar el partido');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>
          Cargando jugadores...
        </Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
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
              Equipo
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
              Guardar
            </Text>
          </Surface>
        </TouchableOpacity>
      </View>

      {/* Tab 0: Players table */}
      {activeTab === 0 && (
        <ScrollView style={styles(theme).content}>
          <View style={styles(theme).tableHeader}>
            <Text style={[styles(theme).headerCell, styles(theme).positionColumn]}>Pos.</Text>
            <Text style={[styles(theme).headerCell, styles(theme).playerColumn]}>Jugador</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>Gol</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>Ast</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>A.G</Text>
          </View>

          {players.map((player, index) => {
            const member = groupMembers.find(m => m.id === player.groupMemberId);
            return (
              <View key={index} style={styles(theme).tableRow}>
                {/* Position */}
                <View style={styles(theme).positionColumn}>
                  {index === 0 ? (
                    <View style={styles(theme).positionLocked}>
                      <Text style={styles(theme).positionLockedText}>POR</Text>
                    </View>
                  ) : (
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
                      {POSITIONS.filter(pos => pos !== 'POR').map(pos => (
                        <Menu.Item
                          key={pos}
                          onPress={() => handlePositionChange(index, pos)}
                          title={`${pos} - ${POSITION_LABELS[pos]}`}
                        />
                      ))}
                    </Menu>
                  )}
                </View>

                {/* Player selector */}
                <TouchableOpacity
                  style={styles(theme).playerColumn}
                  onPress={() => {
                    setSelectedRowIndex(index);
                    setIsPlayerPickerVisible(true);
                  }}
                >
                  <Surface style={styles(theme).playerSelector} elevation={1}>
                    <Text style={styles(theme).playerText} numberOfLines={1}>
                      {member?.displayName ?? `J${index + 1}`}
                    </Text>
                    {player.groupMemberId ? (
                      <TouchableOpacity
                        onPress={() => handleClearPlayer(index)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon name="close" size={16} color={theme.colors.error} />
                      </TouchableOpacity>
                    ) : (
                      <Icon name="menu-down" size={20} color="#666" />
                    )}
                  </Surface>
                </TouchableOpacity>

                {/* Goals */}
                <View style={styles(theme).statColumn}>
                  <TextInput
                    mode="outlined"
                    value={player.goals}
                    onChangeText={v => handleStatChange(index, 'goals', v)}
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
                    onChangeText={v => handleStatChange(index, 'assists', v)}
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
                    onChangeText={v => handleStatChange(index, 'ownGoals', v)}
                    onFocus={() => handleStatFocus(index, 'ownGoals')}
                    onBlur={() => handleStatBlur(index, 'ownGoals')}
                    keyboardType="number-pad"
                    style={styles(theme).statInput}
                    dense
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Tab 1: Save */}
      {activeTab === 1 && (
        <ScrollView style={styles(theme).content} contentContainerStyle={styles(theme).summaryContent}>
          {/* Score display */}
          <Surface style={styles(theme).scoreCard} elevation={2}>
            <View style={styles(theme).scoreContainer}>
              <View style={styles(theme).teamScore}>
                <Text variant="titleLarge" style={styles(theme).teamLabel}>
                  {activeGroup?.name ?? 'Mi Equipo'}
                </Text>
                <View style={styles(theme).scoreCircle}>
                  <Text variant="displayMedium" style={styles(theme).scoreText}>
                    {goalsTeam}
                  </Text>
                </View>
              </View>

              <Text variant="headlineMedium" style={styles(theme).vsText}>
                VS
              </Text>

              <View style={styles(theme).teamScore}>
                <Text variant="titleLarge" style={styles(theme).teamLabel}>
                  {opponentName.trim() || 'Rival'}
                </Text>
                <View style={styles(theme).scoreCircle}>
                  <Text variant="displayMedium" style={styles(theme).scoreText}>
                    {parseStatValue(goalsOpponent)}
                  </Text>
                </View>
              </View>
            </View>

            <Chip
              style={[
                styles(theme).resultChip,
                {
                  backgroundColor:
                    goalsTeam > parseStatValue(goalsOpponent)
                      ? '#4CAF50'
                      : goalsTeam < parseStatValue(goalsOpponent)
                        ? '#F44336'
                        : '#FF9800',
                },
              ]}
              textStyle={styles(theme).resultChipText}
            >
              {goalsTeam > parseStatValue(goalsOpponent)
                ? 'Victoria'
                : goalsTeam < parseStatValue(goalsOpponent)
                  ? 'Derrota'
                  : 'Empate'}
            </Chip>
          </Surface>

          {/* Rival */}
          <Surface style={styles(theme).dateCard} elevation={1}>
            <Text variant="titleMedium" style={styles(theme).dateLabel}>
              Rival
            </Text>
            <TextInput
              mode="outlined"
              label="Nombre del rival"
              value={opponentName}
              onChangeText={setOpponentName}
              placeholder="Ej: Los Piratas"
            />
            <TextInput
              mode="outlined"
              label="Goles del rival"
              value={goalsOpponent}
              onChangeText={v => setGoalsOpponent(normalizeNumberInput(v))}
              keyboardType="numeric"
              onFocus={() => { if (goalsOpponent === '0') setGoalsOpponent(''); }}
              onBlur={() => { if (!goalsOpponent) setGoalsOpponent('0'); }}
            />
          </Surface>

          {/* Date picker */}
          <Surface style={styles(theme).dateCard} elevation={1}>
            <Text variant="titleMedium" style={styles(theme).dateLabel}>
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
            modal
            open={showDatePicker}
            date={matchDate}
            mode="datetime"
            locale="es"
            onConfirm={date => {
              setShowDatePicker(false);
              setMatchDate(date);
            }}
            onCancel={() => setShowDatePicker(false)}
          />

          {/* Validation warnings */}
          {validationWarnings.length > 0 && (
            <Surface style={styles(theme).warningsCard} elevation={0}>
              {validationWarnings.map((warning, i) => (
                <View key={i} style={styles(theme).warningRow}>
                  <Icon name="alert-circle" size={16} color={theme.colors.error} />
                  <Text style={styles(theme).warningText}>{warning}</Text>
                </View>
              ))}
            </Surface>
          )}

          {/* Save button */}
          <Button
            mode="contained"
            onPress={handleSave}
            disabled={!canSave}
            loading={isSaving}
            style={styles(theme).saveButton}
            contentStyle={styles(theme).saveButtonContent}
            icon="content-save"
          >
            Guardar Partido
          </Button>
        </ScrollView>
      )}

      {/* Player picker modal */}
      <Portal>
        <Modal
          visible={isPlayerPickerVisible}
          onRequestClose={() => {
            setIsPlayerPickerVisible(false);
            setSelectedRowIndex(null);
          }}
          animationType="slide"
          transparent
        >
          <View style={styles(theme).modalOverlay}>
            <Surface style={styles(theme).modalContent} elevation={5}>
              <View style={styles(theme).modalHeader}>
                <Text variant="titleLarge" style={styles(theme).modalTitle}>
                  Seleccionar Jugador
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setIsPlayerPickerVisible(false);
                    setSelectedRowIndex(null);
                  }}
                >
                  <Icon name="close" size={24} color={theme.colors.onSurface} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles(theme).modalList}>
                {availablePlayers.length === 0 ? (
                  <View style={styles(theme).emptyPlayersContainer}>
                    <Icon name="account-off" size={48} color="#999" />
                    <Text style={styles(theme).emptyPlayersText}>
                      {groupMembers.length === 0
                        ? 'No hay jugadores en este grupo'
                        : 'Todos los jugadores ya están seleccionados'}
                    </Text>
                  </View>
                ) : (
                  availablePlayers.map((member, i) => (
                    <React.Fragment key={member.id}>
                      <List.Item
                        title={member.displayName}
                        onPress={() => handlePlayerSelect(member)}
                        left={(props) => <List.Icon {...props} icon="account" />}
                        right={(props) => <List.Icon {...props} icon="chevron-right" />}
                      />
                      {i < availablePlayers.length - 1 && <Divider />}
                    </React.Fragment>
                  ))
                )}
              </ScrollView>
            </Surface>
          </View>
        </Modal>
      </Portal>

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
  loadingText: {
    color: '#666',
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
  positionLocked: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#E8EAF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionLockedText: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#3949AB',
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
    flex: 1,
  },
  teamLabel: {
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
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
  emptyPlayersContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  emptyPlayersText: {
    color: '#999',
    textAlign: 'center',
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
