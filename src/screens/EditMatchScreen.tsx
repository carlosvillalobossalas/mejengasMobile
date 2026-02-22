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
  Chip,
  Menu,
  Snackbar,
  MD3Theme,
  Portal,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import DatePicker from 'react-native-date-picker';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import auth from '@react-native-firebase/auth';

import { useAppSelector } from '../app/hooks';
import {
  getGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import { getMatchById, type MatchPlayer } from '../repositories/matches/matchesRepository';
import type { AppDrawerParamList } from '../navigation/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Position = 'POR' | 'DEF' | 'MED' | 'DEL';

type TeamPlayer = {
  position: Position;
  groupMemberId: string | null;
  playerName: string;
  goals: string;
  assists: string;
  ownGoals: string;
};

type EditMatchParams = {
  matchId: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITIONS: Position[] = ['POR', 'DEF', 'MED', 'DEL'];

const POSITION_LABELS: Record<Position, string> = {
  POR: 'Portero',
  DEF: 'Defensa',
  MED: 'Mediocampo',
  DEL: 'Delantero',
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

const formatDate = (date: Date): string =>
  date.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/**
 * Converts a MatchPlayer (from Firestore) to a TeamPlayer (UI model).
 * Requires a lookup map to resolve display names.
 */
const toTeamPlayer = (
  player: MatchPlayer,
  membersMap: Map<string, GroupMemberV2>,
): TeamPlayer => ({
  position: player.position,
  groupMemberId: player.groupMemberId,
  playerName: membersMap.get(player.groupMemberId)?.displayName ?? player.groupMemberId,
  goals: String(player.goals),
  assists: String(player.assists),
  ownGoals: String(player.ownGoals),
});

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  route: { params: EditMatchParams };
}

export default function EditMatchScreen({ route }: Props) {
  const { matchId } = route.params;
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);
  const [matchDate, setMatchDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [players, setPlayers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [isPlayerPickerVisible, setIsPlayerPickerVisible] = useState(false);
  const [positionMenuIndex, setPositionMenuIndex] = useState<number | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [team1Players, setTeam1Players] = useState<TeamPlayer[]>([]);
  const [team2Players, setTeam2Players] = useState<TeamPlayer[]>([]);

  // ── Load match + group members on mount ────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!selectedGroupId) return;

      setIsLoading(true);
      try {
        const [match, membersData] = await Promise.all([
          getMatchById(matchId),
          getGroupMembersV2ByGroupId(selectedGroupId),
        ]);

        if (!match) {
          setSnackbarMessage('Partido no encontrado');
          setSnackbarVisible(true);
          navigation.goBack();
          return;
        }

        const membersMap = new Map<string, GroupMemberV2>(
          membersData.map(m => [m.id, m]),
        );

        setPlayers(membersData);
        setTeam1Players(match.players1.map(p => toTeamPlayer(p, membersMap)));
        setTeam2Players(match.players2.map(p => toTeamPlayer(p, membersMap)));
        setMatchDate(new Date(match.date));
      } catch (error) {
        console.error('EditMatchScreen: error loading match data', error);
        setSnackbarMessage('Error al cargar el partido');
        setSnackbarVisible(true);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [matchId, selectedGroupId]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const currentTeamPlayers = activeTab === 0 ? team1Players : team2Players;
  const setCurrentTeamPlayers =
    activeTab === 0 ? setTeam1Players : setTeam2Players;

  const team1Goals = useMemo(() => {
    const scored = team1Players.reduce(
      (sum, p) => sum + parseStatValue(p.goals),
      0,
    );
    const opponentOwnGoals = team2Players.reduce(
      (sum, p) => sum + parseStatValue(p.ownGoals),
      0,
    );
    return scored + opponentOwnGoals;
  }, [team1Players, team2Players]);

  const team2Goals = useMemo(() => {
    const scored = team2Players.reduce(
      (sum, p) => sum + parseStatValue(p.goals),
      0,
    );
    const opponentOwnGoals = team1Players.reduce(
      (sum, p) => sum + parseStatValue(p.ownGoals),
      0,
    );
    return scored + opponentOwnGoals;
  }, [team1Players, team2Players]);

  const selectedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    team1Players.forEach(p => p.groupMemberId && ids.add(p.groupMemberId));
    team2Players.forEach(p => p.groupMemberId && ids.add(p.groupMemberId));
    return ids;
  }, [team1Players, team2Players]);

  const availablePlayers = useMemo(
    () => players.filter(p => !selectedPlayerIds.has(p.id)),
    [players, selectedPlayerIds],
  );

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];

    const team1WithPlayer = team1Players.filter(p => p.groupMemberId !== null).length;
    const team2WithPlayer = team2Players.filter(p => p.groupMemberId !== null).length;

    if (team1WithPlayer < team1Players.length) {
      warnings.push(
        `Equipo 1: faltan ${team1Players.length - team1WithPlayer} jugador(es) por seleccionar`,
      );
    }
    if (team2WithPlayer < team2Players.length) {
      warnings.push(
        `Equipo 2: faltan ${team2Players.length - team2WithPlayer} jugador(es) por seleccionar`,
      );
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
  }, [team1Players, team2Players, matchDate]);

  const canSave = validationWarnings.length === 0 && !isSaving;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePositionChange = useCallback(
    (index: number, position: Position) => {
      const updated = [...currentTeamPlayers];
      updated[index] = { ...updated[index], position };
      setCurrentTeamPlayers(updated);
    },
    [currentTeamPlayers, setCurrentTeamPlayers],
  );

  const handlePlayerSelect = useCallback(
    (member: GroupMemberV2) => {
      if (selectedRowIndex === null) return;
      const updated = [...currentTeamPlayers];
      updated[selectedRowIndex] = {
        ...updated[selectedRowIndex],
        groupMemberId: member.id,
        playerName: member.displayName,
      };
      setCurrentTeamPlayers(updated);
      setIsPlayerPickerVisible(false);
      setSelectedRowIndex(null);
    },
    [selectedRowIndex, currentTeamPlayers, setCurrentTeamPlayers],
  );

  const handleStatChange = useCallback(
    (index: number, field: 'goals' | 'assists' | 'ownGoals', value: string) => {
      const updated = [...currentTeamPlayers];
      updated[index] = { ...updated[index], [field]: normalizeNumberInput(value) };
      setCurrentTeamPlayers(updated);
    },
    [currentTeamPlayers, setCurrentTeamPlayers],
  );

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

  const handleSaveMatch = () => {
    if (!canSave || !matchDate) return;

    Alert.alert(
      'Editar partido',
      'Editar este partido recalculará las estadísticas de los jugadores. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'default',
          onPress: confirmSave,
        },
      ],
    );
  };

  const confirmSave = async () => {
    if (!matchDate) return;

    setIsSaving(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('No autenticado');

      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        'https://us-central1-mejengas-a7794.cloudfunctions.net/editMatch',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            data: {
              matchId,
              updatedMatchData: {
                players1: team1Players.map(p => ({
                  groupMemberId: p.groupMemberId,
                  position: p.position,
                  goals: parseStatValue(p.goals),
                  assists: parseStatValue(p.assists),
                  ownGoals: parseStatValue(p.ownGoals),
                })),
                players2: team2Players.map(p => ({
                  groupMemberId: p.groupMemberId,
                  position: p.position,
                  goals: parseStatValue(p.goals),
                  assists: parseStatValue(p.assists),
                  ownGoals: parseStatValue(p.ownGoals),
                })),
                goalsTeam1: team1Goals,
                goalsTeam2: team2Goals,
                date: matchDate.toISOString(),
              },
            },
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message =
          (errorBody as { error?: { message?: string } })?.error?.message ??
          'Error al actualizar el partido';
        throw new Error(message);
      }

      setSnackbarMessage('Partido actualizado exitosamente');
      setSnackbarVisible(true);

      // Navigate back after a short delay so the snackbar is visible
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error) {
      console.error('EditMatchScreen: error saving match', error);
      setSnackbarMessage('Error al actualizar el partido');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>
          Cargando partido...
        </Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles(theme).container}>
      {/* Tabs */}
      <View style={styles(theme).tabsContainer}>
        {(['Equipo 1', 'Equipo 2', 'Guardar'] as const).map((label, idx) => (
          <TouchableOpacity
            key={label}
            style={styles(theme).tabButton}
            onPress={() => setActiveTab(idx as 0 | 1 | 2)}
            activeOpacity={0.7}
          >
            <Surface
              style={[
                styles(theme).tab,
                activeTab === idx && styles(theme).activeTab,
              ]}
              elevation={activeTab === idx ? 2 : 0}
            >
              <Text
                variant="labelLarge"
                style={[
                  styles(theme).tabText,
                  activeTab === idx && styles(theme).activeTabText,
                ]}
              >
                {label}
              </Text>
            </Surface>
          </TouchableOpacity>
        ))}
      </View>

      {/* Team tabs */}
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
                  <Text style={styles(theme).playerText} numberOfLines={1}>
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
          ))}
        </ScrollView>
      ) : (
        /* Guardar tab */
        <ScrollView
          style={styles(theme).content}
          contentContainerStyle={styles(theme).summaryContent}
        >
          {/* Score preview */}
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

              <Text variant="headlineMedium" style={styles(theme).vsText}>VS</Text>

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

            <Chip
              style={[
                styles(theme).resultChip,
                {
                  backgroundColor:
                    team1Goals !== team2Goals ? '#2196F3' : '#FF9800',
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
              right={
                <TextInput.Icon
                  icon="calendar"
                  onPress={() => setShowDatePicker(true)}
                />
              }
              onPressIn={() => setShowDatePicker(true)}
            />
          </Surface>

          <DatePicker
            locale="ES"
            mode="date"
            modal
            open={showDatePicker}
            date={matchDate ?? new Date()}
            onConfirm={date => {
              setShowDatePicker(false);
              const startOfDay = new Date(date);
              startOfDay.setHours(0, 0, 0, 0);
              setMatchDate(startOfDay);
            }}
            onCancel={() => setShowDatePicker(false)}
            title="Seleccione fecha del partido"
            confirmText="Confirmar"
            cancelText="Cancelar"
          />

          {/* Validation warnings */}
          {validationWarnings.length > 0 && (
            <Surface style={styles(theme).warningsCard} elevation={1}>
              <Text variant="titleSmall" style={styles(theme).warningsTitle}>
                Para guardar, resuelve lo siguiente:
              </Text>
              {validationWarnings.map((warning, idx) => (
                <View key={idx} style={styles(theme).warningRow}>
                  <Icon
                    name="alert-circle"
                    size={16}
                    color={theme.colors.error}
                    style={styles(theme).warningIcon}
                  />
                  <Text style={styles(theme).warningText}>{warning}</Text>
                </View>
              ))}
            </Surface>
          )}

          {/* Save button */}
          <Button
            mode="contained"
            onPress={handleSaveMatch}
            disabled={!canSave}
            loading={isSaving}
            style={styles(theme).saveButton}
            contentStyle={styles(theme).saveButtonContent}
            icon="content-save"
          >
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </ScrollView>
      )}

      {/* Player picker modal */}
      <Portal>
        <Modal
          visible={isPlayerPickerVisible}
          onRequestClose={closePlayerPicker}
          animationType="slide"
          transparent
        >
          <View style={styles(theme).modalOverlay}>
            <Surface style={styles(theme).modalContent} elevation={4}>
              <View style={styles(theme).modalHeader}>
                <Text variant="titleLarge">Seleccionar jugador</Text>
                <TouchableOpacity onPress={closePlayerPicker}>
                  <Icon name="close" size={24} color={theme.colors.onSurface} />
                </TouchableOpacity>
              </View>
              <Divider />
              <ScrollView>
                {availablePlayers.map(member => (
                  <React.Fragment key={member.id}>
                    <List.Item
                      title={member.displayName}
                      onPress={() => handlePlayerSelect(member)}
                      left={props => (
                        <List.Icon
                          {...props}
                          icon="account"
                          color={theme.colors.primary}
                        />
                      )}
                    />
                    <Divider />
                  </React.Fragment>
                ))}
                {availablePlayers.length === 0 && (
                  <Text style={styles(theme).noPlayersText}>
                    No hay jugadores disponibles
                  </Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 8,
    },
    tabsContainer: {
      flexDirection: 'row',
      padding: 8,
      gap: 8,
      backgroundColor: theme.colors.surface,
      elevation: 2,
    },
    tabButton: {
      flex: 1,
    },
    tab: {
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
    },
    activeTab: {
      backgroundColor: theme.colors.primaryContainer,
    },
    tabText: {
      color: theme.colors.onSurfaceVariant,
    },
    activeTabText: {
      color: theme.colors.primary,
      fontWeight: 'bold',
    },
    content: {
      flex: 1,
    },
    summaryContent: {
      padding: 16,
      gap: 16,
    },
    tableHeader: {
      flexDirection: 'row',
      paddingHorizontal: 8,
      paddingVertical: 8,
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
    },
    headerCell: {
      fontSize: 12,
      fontWeight: 'bold',
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    tableRow: {
      flexDirection: 'row',
      paddingHorizontal: 8,
      paddingVertical: 6,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
    },
    positionColumn: {
      width: 72,
    },
    playerColumn: {
      flex: 1,
      marginHorizontal: 4,
    },
    statColumn: {
      width: 52,
      marginHorizontal: 2,
    },
    positionAnchor: {
      flex: 1,
    },
    positionPicker: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 6,
      borderRadius: 6,
      gap: 2,
    },
    positionText: {
      fontSize: 12,
      fontWeight: 'bold',
      color: theme.colors.primary,
    },
    playerSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 6,
      borderRadius: 6,
    },
    playerText: {
      flex: 1,
      fontSize: 12,
      color: theme.colors.onSurface,
    },
    statInput: {
      height: 36,
      textAlign: 'center',
      fontSize: 13,
    },
    // Guardar tab
    scoreCard: {
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
      gap: 16,
    },
    scoreContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 24,
    },
    teamScore: {
      alignItems: 'center',
      gap: 8,
    },
    teamLabel: {
      color: theme.colors.onSurface,
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
      color: theme.colors.primary,
      fontWeight: 'bold',
    },
    vsText: {
      color: theme.colors.onSurfaceVariant,
    },
    resultChip: {
      borderRadius: 20,
    },
    resultChipText: {
      color: '#FFF',
      fontWeight: 'bold',
    },
    dateCard: {
      borderRadius: 12,
      padding: 16,
      gap: 8,
    },
    dateLabel: {
      color: theme.colors.onSurface,
      marginBottom: 4,
    },
    warningsCard: {
      borderRadius: 12,
      padding: 16,
      backgroundColor: theme.colors.errorContainer,
      gap: 8,
    },
    warningsTitle: {
      color: theme.colors.onErrorContainer,
      marginBottom: 4,
    },
    warningRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
    },
    warningIcon: {
      marginTop: 1,
    },
    warningText: {
      flex: 1,
      fontSize: 13,
      color: theme.colors.onErrorContainer,
    },
    saveButton: {
      borderRadius: 12,
      marginTop: 8,
    },
    saveButtonContent: {
      paddingVertical: 6,
    },
    // Player picker modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '70%',
      paddingBottom: 24,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    noPlayersText: {
      textAlign: 'center',
      padding: 24,
      color: theme.colors.onSurfaceVariant,
    },
  });
