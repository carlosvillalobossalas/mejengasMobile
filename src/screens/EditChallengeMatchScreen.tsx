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
  Menu,
  Divider,
  Snackbar,
  Switch,
  MD3Theme,
  Chip,
  Portal,
  List,
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
import {
  getChallengeMatchById,
  type ChallengeMatchPlayer,
} from '../repositories/matches/matchesByChallengeRepository';
import { getGroupsByIds } from '../repositories/groups/groupsRepository';
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
  isSub: boolean;
};

type EditChallengeMatchParams = {
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

const PLAYERS_BY_TYPE: Record<string, number> = {
  futbol_5: 5,
  futbol_7: 7,
  futbol_11: 11,
};

const POSITION_ORDER: Record<Position, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

/** Sorts starters by position (POR→DEF→MED→DEL) keeping subs at the end. */
const sortTeamPlayers = (arr: TeamPlayer[]): TeamPlayer[] => {
  const starters = arr.filter(p => !p.isSub).sort(
    (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position],
  );
  const subs = arr.filter(p => p.isSub).sort(
    (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position],
  );
  return [...starters, ...subs];
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

const toTeamPlayer = (
  player: ChallengeMatchPlayer,
  membersMap: Map<string, GroupMemberV2>,
): TeamPlayer => ({
  position: player.position,
  groupMemberId: player.groupMemberId,
  playerName: player.groupMemberId
    ? (membersMap.get(player.groupMemberId)?.displayName ?? player.groupMemberId)
    : '',
  goals: String(player.goals),
  assists: String(player.assists),
  ownGoals: String(player.ownGoals),
  isSub: player.isSub,
});

const DEFAULT_FORMATION: Record<number, Position[]> = {
  5:  ['POR', 'DEF', 'DEF', 'DEL', 'DEL'],
  7:  ['POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'DEL'],
  11: ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL'],
};

const getFormationPosition = (index: number, total: number): Position => {
  const slots = DEFAULT_FORMATION[total];
  if (slots && index < slots.length) return slots[index];
  return index === 0 ? 'POR' : 'DEF';
};

const createEmptyTeamPlayer = (position: Position = 'DEF'): TeamPlayer => ({
  position,
  groupMemberId: null,
  playerName: '',
  goals: '0',
  assists: '0',
  ownGoals: '0',
  isSub: false,
});

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  route: { params: EditChallengeMatchParams };
}

export default function EditChallengeMatchScreen({ route }: Props) {
  const { matchId } = route.params;
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const activeGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<0 | 1>(0);
  const [matchDate, setMatchDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [isPlayerPickerVisible, setIsPlayerPickerVisible] = useState(false);
  const [positionMenuIndex, setPositionMenuIndex] = useState<number | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [matchStatus, setMatchStatus] = useState<'scheduled' | 'finished' | 'cancelled'>('finished');
  const [markAsFinished, setMarkAsFinished] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [goalsOpponent, setGoalsOpponent] = useState('0');

  // ── Load match data on mount ───────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!selectedGroupId) return;
      setIsLoading(true);
      try {
        const [match, membersData, groupsMap] = await Promise.all([
          getChallengeMatchById(matchId),
          getGroupMembersV2ByGroupId(selectedGroupId),
          getGroupsByIds([selectedGroupId]),
        ]);

        if (!match) {
          setSnackbarMessage('Partido no encontrado');
          setSnackbarVisible(true);
          navigation.goBack();
          return;
        }

        const membersMap = new Map<string, GroupMemberV2>(membersData.map(m => [m.id, m]));
        const group = groupsMap.get(selectedGroupId);
        const count = PLAYERS_BY_TYPE[group?.type ?? 'futbol_7'] ?? 7;

        setGroupMembers(membersData);

        // Separate starters and subs from loaded match data
        const savedStarters = match.players.filter(p => !p.isSub);
        const savedSubs = match.players.filter(p => p.isSub);

        const mappedStarters = savedStarters.map(p => toTeamPlayer(p, membersMap));
        const mappedSubs = savedSubs.map(p => toTeamPlayer(p, membersMap));

        // Fill up to full count with empty starter slots using formation-based positions
        const emptySlots = Array.from(
          { length: Math.max(0, count - mappedStarters.length) },
          (_, i) => createEmptyTeamPlayer(getFormationPosition(mappedStarters.length + i, count)),
        );
        // Always display POR→DEF→MED→DEL order regardless of save order
        setTeamPlayers(sortTeamPlayers([...mappedStarters, ...emptySlots, ...mappedSubs]));
        setMatchStatus(match.status === 'cancelled' ? 'scheduled' : match.status === 'finished' ? 'finished' : 'scheduled');
        setMatchDate(new Date(match.date));
        setOpponentName(match.opponentName);
        setGoalsOpponent(String(match.goalsOpponent));
      } catch (error) {
        console.error('EditChallengeMatchScreen: error loading match data', error);
        setSnackbarMessage('Error al cargar el partido');
        setSnackbarVisible(true);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [matchId, selectedGroupId]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const goalsTeam = useMemo(
    () => teamPlayers.reduce((sum, p) => sum + parseStatValue(p.goals), 0),
    [teamPlayers],
  );

  const selectedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    teamPlayers.forEach(p => p.groupMemberId && ids.add(p.groupMemberId));
    return ids;
  }, [teamPlayers]);

  const availablePlayers = useMemo(() => {
    const currentSlotMemberId =
      selectedRowIndex !== null ? (teamPlayers[selectedRowIndex]?.groupMemberId ?? null) : null;
    return groupMembers.filter(p => {
      if (!selectedPlayerIds.has(p.id)) return true;
      return p.id === currentSlotMemberId;
    });
  }, [groupMembers, selectedPlayerIds, selectedRowIndex, teamPlayers]);

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];
    const requiresFullLineup = matchStatus === 'finished' || markAsFinished;

    if (requiresFullLineup) {
      // Only validate starter slots (not subs)
      const starters = teamPlayers.filter(p => !p.isSub);
      const withPlayer = starters.filter(p => p.groupMemberId !== null).length;
      if (withPlayer < starters.length) {
        warnings.push(`Faltan ${starters.length - withPlayer} jugador(es) por seleccionar`);
      }
      const porCount = starters.filter(p => p.groupMemberId !== null && p.position === 'POR').length;
      if (porCount !== 1) {
        warnings.push(`El equipo debe tener exactamente 1 portero (tiene ${porCount})`);
      }
    }

    if (!matchDate) {
      warnings.push('Seleccioná una fecha para el partido');
    }

    if (!opponentName.trim()) {
      warnings.push('Ingresá el nombre del rival');
    }

    return warnings;
  }, [teamPlayers, matchDate, matchStatus, markAsFinished, opponentName]);

  const canSave = validationWarnings.length === 0 && !isSaving;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePositionChange = useCallback((index: number, position: Position) => {
    setTeamPlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], position };
      return sortTeamPlayers(updated);
    });
  }, []);

  const handlePlayerSelect = useCallback(
    (member: GroupMemberV2) => {
      if (selectedRowIndex === null) return;
      setTeamPlayers(prev => {
        const updated = [...prev];
        updated[selectedRowIndex] = {
          ...updated[selectedRowIndex],
          groupMemberId: member.id,
          playerName: member.displayName,
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
      setTeamPlayers(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: normalizeNumberInput(value) };
        return updated;
      });
    },
    [],
  );

  const handleStatFocus = (index: number, field: 'goals' | 'assists' | 'ownGoals') => {
    if (teamPlayers[index][field] === '0') handleStatChange(index, field, '');
  };

  const handleStatBlur = (index: number, field: 'goals' | 'assists' | 'ownGoals') => {
    if (!teamPlayers[index][field]) handleStatChange(index, field, '0');
  };

  const handleAddSub = useCallback(() => {
    setTeamPlayers(prev => [
      ...prev,
      {
        position: 'DEF',
        groupMemberId: null,
        playerName: '',
        goals: '0',
        assists: '0',
        ownGoals: '0',
        isSub: true,
      },
    ]);
  }, []);

  const handleRemoveSub = useCallback((index: number) => {
    setTeamPlayers(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveMatch = () => {
    if (validationWarnings.length > 0) return;

    const alertMessage =
      matchStatus === 'scheduled' && markAsFinished
        ? '¿Deseas marcar este partido como finalizado? Las estadísticas se actualizarán.'
        : matchStatus === 'scheduled'
          ? '¿Deseas guardar los cambios en este partido programado?'
          : 'Editar este partido recalculará las estadísticas. ¿Continuar?';

    Alert.alert(
      'Editar partido',
      alertMessage,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'default', onPress: confirmSave },
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
        'https://us-central1-mejengas-a7794.cloudfunctions.net/editChallengeMatch',
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
                // Keep all slots (including empty ones with null groupMemberId)
                // so scheduled match lineups preserve "Por asignar" placeholders
                players: teamPlayers.map(p => ({
                  groupMemberId: p.groupMemberId,
                  position: p.position,
                  goals: parseStatValue(p.goals),
                  assists: parseStatValue(p.assists),
                  ownGoals: parseStatValue(p.ownGoals),
                  isSub: p.isSub,
                })),
                goalsTeam,
                opponentName: opponentName.trim(),
                goalsOpponent: parseStatValue(goalsOpponent),
                date: matchDate.toISOString(),
                markAsFinished,
              },
            },
          }),
        },
      );

      if (!response.ok) {
        const rawText = await response.text().catch(() => '');
        console.error('EditChallengeMatchScreen: HTTP error', response.status, rawText);
        let message = 'Error al actualizar el partido';
        try {
          const errorBody = JSON.parse(rawText);
          message =
            (errorBody as { error?: { message?: string } })?.error?.message ??
            message;
        } catch (_) { /* not JSON */ }
        throw new Error(message);
      }

      setSnackbarMessage(
        markAsFinished ? 'Partido finalizado y guardado exitosamente' : 'Partido actualizado exitosamente',
      );
      setSnackbarVisible(true);
      setTimeout(() => navigation.navigate('ChallengeMatches'), 1500);
    } catch (error) {
      console.error('EditChallengeMatchScreen: error saving match', error);
      setSnackbarMessage((error as Error).message || 'Error al actualizar el partido');
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
          {/* Table header */}
          <View style={styles(theme).tableHeader}>
            <Text style={[styles(theme).headerCell, styles(theme).positionColumn]}>Pos.</Text>
            <Text style={[styles(theme).headerCell, styles(theme).playerColumn]}>Jugador</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>Gol</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>Ast</Text>
            <Text style={[styles(theme).headerCell, styles(theme).statColumn]}>A.G</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Table rows */}
          {teamPlayers.map((player, index) => {
            const member = groupMembers.find(m => m.id === player.groupMemberId);
            const rowExtraStyle = player.isSub ? styles(theme).subRow : null;
            return (
              <View key={index} style={[styles(theme).tableRow, rowExtraStyle]}>
                {/* Position / SUB badge */}
                <View style={styles(theme).positionColumn}>
                  {player.isSub ? (
                    <View style={{ alignItems: 'center' }}>
                      <Menu
                        visible={positionMenuIndex === index}
                        onDismiss={() => setPositionMenuIndex(null)}
                        anchor={
                          <TouchableOpacity
                            onPress={() => setPositionMenuIndex(index)}
                            style={styles(theme).positionAnchor}
                          >
                            <Surface
                              style={[styles(theme).positionPicker, { borderColor: '#2E7D32' }]}
                              elevation={1}
                            >
                              <Text style={[styles(theme).positionText, { color: '#2E7D32' }]}>
                                {player.position}
                              </Text>
                              <Icon name="chevron-down" size={16} color="#2E7D32" />
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
                      <Text style={{ fontSize: 9, color: '#2E7D32', fontWeight: '700', marginTop: 2 }}>
                        SUP
                      </Text>
                    </View>
                  ) : index === 0 ? (
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
                          onPress={() => {
                            handlePositionChange(index, pos);
                            setPositionMenuIndex(null);
                          }}
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
                        onPress={() => {
                          setTeamPlayers(prev => {
                            const updated = [...prev];
                            updated[index] = { ...updated[index], groupMemberId: null, playerName: '' };
                            return updated;
                          });
                        }}
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

                {/* Delete — only for sub rows */}
                <View style={{ width: 28, alignItems: 'center' }}>
                  {player.isSub && (
                    <TouchableOpacity
                      onPress={() => handleRemoveSub(index)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <Icon name="delete-outline" size={18} color={theme.colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {/* Add substitute button */}
          <TouchableOpacity
            style={styles(theme).addSubButton}
            onPress={handleAddSub}
            activeOpacity={0.7}
          >
            <Icon name="plus-circle-outline" size={20} color="#2E7D32" />
            <Text style={styles(theme).addSubText}>Agregar suplente</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Tab 1: Save */}
      {activeTab === 1 && (
        <ScrollView style={styles(theme).content} contentContainerStyle={styles(theme).summaryContent}>
          {/* Score preview */}
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
              <Text variant="headlineMedium" style={styles(theme).vsText}>VS</Text>
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

          {/* Date */}
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
            locale="es"
            mode="datetime"
            modal
            open={showDatePicker}
            date={matchDate ?? new Date()}
            onConfirm={date => {
              setShowDatePicker(false);
              setMatchDate(date);
            }}
            onCancel={() => setShowDatePicker(false)}
            title="Seleccione fecha del partido"
            confirmText="Confirmar"
            cancelText="Cancelar"
          />

          {/* Validation warnings */}
          {validationWarnings.length > 0 && (
            <Surface style={styles(theme).warningsCard} elevation={0}>
              {validationWarnings.map((warning, idx) => (
                <View key={idx} style={styles(theme).warningRow}>
                  <Icon name="alert-circle" size={16} color={theme.colors.error} />
                  <Text style={styles(theme).warningText}>{warning}</Text>
                </View>
              ))}
            </Surface>
          )}

          {/* Mark as finished (scheduled matches) */}
          {matchStatus === 'scheduled' && (
            <Surface style={styles(theme).finalizeCard} elevation={1}>
              <View style={styles(theme).finalizeRow}>
                <View style={styles(theme).finalizeText}>
                  <Text variant="titleSmall">Marcar como finalizado</Text>
                  <Text variant="bodySmall" style={styles(theme).finalizeDescription}>
                    Activá esta opción si el partido ya se jugó. Las estadísticas se actualizarán.
                  </Text>
                </View>
                <Switch value={markAsFinished} onValueChange={setMarkAsFinished} />
              </View>
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
            Guardar Partido
          </Button>
        </ScrollView>
      )}

      {/* Player picker modal */}
      <Portal>
        <Modal
          visible={isPlayerPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setIsPlayerPickerVisible(false);
            setSelectedRowIndex(null);
          }}
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

      <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={3000}>
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
      backgroundColor: '#F5F5F5',
      paddingBottom: 10
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
    subRow: {
      backgroundColor: '#F1F8E9',
    },
    // SUP badge in position column for subs
    subPositionBadge: {
      backgroundColor: '#C8E6C9',
    },
    // "?" text for empty player slots
    emptyPlayerText: {
      color: '#BDBDBD',
      fontStyle: 'italic',
    },
    // "+ Agregar suplente" button at bottom of table
    addSubButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: '#F1F8E9',
      borderTopWidth: 1,
      borderTopColor: '#C8E6C9',
    },
    addSubText: {
      fontSize: 14,
      color: '#2E7D32',
      fontWeight: '600',
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
    positionAnchor: {
      width: '100%',
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
      paddingBottom: 40,
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
    finalizeCard: {
      borderRadius: 8,
      padding: 12,
      backgroundColor: '#FFF',
    },
    finalizeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    finalizeText: {
      flex: 1,
      paddingRight: 12,
      gap: 4,
    },
    finalizeDescription: {
      color: '#666',
      fontSize: 12,
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
  });
