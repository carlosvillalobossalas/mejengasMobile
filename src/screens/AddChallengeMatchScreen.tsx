import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Button,
  Card,
  Divider,
  MD3Theme,
  Menu,
  Snackbar,
  Surface,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import DatePicker from 'react-native-date-picker';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import auth from '@react-native-firebase/auth';

import ScheduledPlayerPicker from '../components/ScheduledPlayerPicker';
import { useAppSelector } from '../app/hooks';
import {
  getGroupMembersV2ByGroupId,
  subscribeToGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import {
  getChallengeMatchById,
  type ChallengeMatchPlayer,
} from '../repositories/matches/matchesByChallengeRepository';
import {
  saveChallengeMatch,
  saveScheduledChallengeMatch,
} from '../services/matches/challengeMatchSaveService';
import type { AppDrawerParamList } from '../navigation/types';

type Position = 'POR' | 'DEF' | 'MED' | 'DEL';
type MatchStatusMode = 'scheduled' | 'finished';
type SlotMenuState = number | null;

type ChallengeSlot = {
  groupMemberId: string | null;
  position: Position;
  goals: string;
  assists: string;
  ownGoals: string;
  isSub: boolean;
};

type AddChallengeRouteParams = {
  matchId?: string;
};

interface Props {
  route?: {
    params?: AddChallengeRouteParams;
  };
}

const POSITIONS: Position[] = ['POR', 'DEF', 'MED', 'DEL'];
const POSITION_LABELS: Record<Position, string> = {
  POR: 'Portero',
  DEF: 'Defensa',
  MED: 'Mediocampo',
  DEL: 'Delantero',
};

const POSITION_ORDER: Record<Position, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

const DEFAULT_FORMATION: Record<number, Position[]> = {
  5: ['POR', 'DEF', 'DEF', 'DEL', 'DEL'],
  7: ['POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'DEL'],
  11: ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL'],
};

const PLAYERS_BY_TYPE: Record<string, number> = {
  futbol_5: 5,
  futbol_7: 7,
  futbol_11: 11,
};

const parseGoals = (value: string) => Number.parseInt(value || '0', 10) || 0;

const normalizeStatInput = (value: string) => {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned === '') return '';
  if (cleaned === '0') return '0';
  return cleaned.replace(/^0+(?=\d)/, '');
};

const createEmptySlot = (position: Position): ChallengeSlot => ({
  groupMemberId: null,
  position,
  goals: '0',
  assists: '0',
  ownGoals: '0',
  isSub: false,
});

const createSubSlot = (): ChallengeSlot => ({
  groupMemberId: null,
  position: 'DEF',
  goals: '0',
  assists: '0',
  ownGoals: '0',
  isSub: true,
});

const mapSavedPlayerToSlot = (player: ChallengeMatchPlayer): ChallengeSlot => ({
  groupMemberId: player.groupMemberId,
  position: player.position,
  goals: String(player.goals ?? 0),
  assists: String(player.assists ?? 0),
  ownGoals: String(player.ownGoals ?? 0),
  isSub: player.isSub ?? false,
});

type SlotRowProps = {
  slot: ChallengeSlot;
  index: number;
  member: GroupMemberV2 | undefined;
  menuOpen: boolean;
  showStats: boolean;
  isSub: boolean;
  isFirstStarter: boolean;
  onOpenPicker: () => void;
  onToggleMenu: () => void;
  onDismissMenu: () => void;
  onSetPosition: (position: Position) => void;
  onRemoveSub: () => void;
  onChangeStat: (field: 'goals' | 'assists' | 'ownGoals', value: string) => void;
  theme: MD3Theme;
};

function SlotRow({
  slot,
  index,
  member,
  menuOpen,
  showStats,
  isSub,
  isFirstStarter,
  onOpenPicker,
  onToggleMenu,
  onDismissMenu,
  onSetPosition,
  onRemoveSub,
  onChangeStat,
  theme: t,
}: SlotRowProps) {
  return (
    <View>
      {index > 0 && <Divider />}
      <View style={[styles(t).slotRow, isSub && styles(t).subSlotRow]}>
        {isSub ? (
          <View style={{ alignItems: 'center' }}>
            <Menu
              visible={menuOpen}
              onDismiss={onDismissMenu}
              anchor={
                <TouchableOpacity
                  style={[styles(t).posChip, styles(t).subChip]}
                  onPress={onToggleMenu}
                >
                  <Text style={[styles(t).posChipText, { color: '#FFF' }]}>{slot.position}</Text>
                </TouchableOpacity>
              }
            >
              {POSITIONS.map(pos => (
                <Menu.Item
                  key={pos}
                  title={`${pos} · ${POSITION_LABELS[pos]}`}
                  leadingIcon={slot.position === pos ? 'check' : undefined}
                  onPress={() => {
                    onSetPosition(pos);
                    onDismissMenu();
                  }}
                />
              ))}
            </Menu>
            <Text style={{ fontSize: 9, color: t.colors.secondary, fontWeight: '700', marginTop: 2 }}>
              SUP
            </Text>
          </View>
        ) : isFirstStarter ? (
          <View style={[styles(t).posChip, { backgroundColor: '#E8EAF6', borderColor: '#3949AB' }]}>
            <Text style={[styles(t).posChipText, { color: '#3949AB' }]}>POR</Text>
          </View>
        ) : (
          <Menu
            visible={menuOpen}
            onDismiss={onDismissMenu}
            anchor={
              <TouchableOpacity
                style={[
                  styles(t).posChip,
                  slot.position ? { backgroundColor: t.colors.primary, borderColor: t.colors.primary } : {},
                  !member && styles(t).posChipDisabled,
                ]}
                onPress={onToggleMenu}
                disabled={!member}
              >
                <Text
                  style={[styles(t).posChipText, { color: member ? '#FFF' : t.colors.onSurfaceVariant }]}
                >
                  {slot.position}
                </Text>
              </TouchableOpacity>
            }
          >
            {POSITIONS.filter(pos => pos !== 'POR').map(pos => (
              <Menu.Item
                key={pos}
                title={`${pos} · ${POSITION_LABELS[pos]}`}
                leadingIcon={slot.position === pos ? 'check' : undefined}
                onPress={() => {
                  onSetPosition(pos);
                  onDismissMenu();
                }}
              />
            ))}
          </Menu>
        )}

        <TouchableOpacity style={styles(t).playerButton} onPress={onOpenPicker} activeOpacity={0.7}>
          {member ? (
            <Text variant="bodyMedium" style={styles(t).playerName} numberOfLines={1}>
              {member.displayName}
            </Text>
          ) : (
            <>
              <Icon name="account-plus-outline" size={22} color={t.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={styles(t).emptySlotText}>
                {isSub ? 'Suplente' : `Jugador ${index + 1}`}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {showStats ? (
          <View style={styles(t).inlineStatsContainer}>
            <View style={styles(t).inlineStatField}>
              <Text style={styles(t).inlineStatLabel}>Gol</Text>
              <TextInput
                mode="outlined"
                value={slot.goals}
                onChangeText={value => onChangeStat('goals', normalizeStatInput(value))}
                onFocus={() => {
                  if (slot.goals === '0') onChangeStat('goals', '');
                }}
                onBlur={() => {
                  if (!slot.goals) onChangeStat('goals', '0');
                }}
                keyboardType="number-pad"
                dense
                style={styles(t).inlineStatInput}
                disabled={!member}
              />
            </View>
            <View style={styles(t).inlineStatField}>
              <Text style={styles(t).inlineStatLabel}>Ast</Text>
              <TextInput
                mode="outlined"
                value={slot.assists}
                onChangeText={value => onChangeStat('assists', normalizeStatInput(value))}
                onFocus={() => {
                  if (slot.assists === '0') onChangeStat('assists', '');
                }}
                onBlur={() => {
                  if (!slot.assists) onChangeStat('assists', '0');
                }}
                keyboardType="number-pad"
                dense
                style={styles(t).inlineStatInput}
                disabled={!member}
              />
            </View>
            <View style={styles(t).inlineStatField}>
              <Text style={styles(t).inlineStatLabel}>A.G.</Text>
              <TextInput
                mode="outlined"
                value={slot.ownGoals}
                onChangeText={value => onChangeStat('ownGoals', normalizeStatInput(value))}
                onFocus={() => {
                  if (slot.ownGoals === '0') onChangeStat('ownGoals', '');
                }}
                onBlur={() => {
                  if (!slot.ownGoals) onChangeStat('ownGoals', '0');
                }}
                keyboardType="number-pad"
                dense
                style={styles(t).inlineStatInput}
                disabled={!member}
              />
            </View>
          </View>
        ) : (
          <View style={styles(t).statsSpacer} />
        )}
      </View>
    </View>
  );
}

export default function AddChallengeMatchScreen({ route }: Props) {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const matchId = route?.params?.matchId ?? null;
  const isEditMode = !!matchId;

  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const playersPerTeam = PLAYERS_BY_TYPE[selectedGroup?.type ?? 'futbol_7'] ?? 7;

  const [slots, setSlots] = useState<ChallengeSlot[]>([]);
  const [allMembers, setAllMembers] = useState<GroupMemberV2[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingMatch, setIsLoadingMatch] = useState(false);

  const [matchDate, setMatchDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [goalsOpponent, setGoalsOpponent] = useState('0');

  const [statusMode, setStatusMode] = useState<MatchStatusMode>('scheduled');
  const [initialMatchStatus, setInitialMatchStatus] = useState<MatchStatusMode | null>(null);

  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<SlotMenuState>(null);
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  useEffect(() => {
    const baseFormation: Position[] =
      DEFAULT_FORMATION[playersPerTeam] ??
      Array.from({ length: playersPerTeam }, (_, i) => (i === 0 ? 'POR' : 'DEF'));
    setSlots(baseFormation.map(position => createEmptySlot(position)));
  }, [selectedGroupId, playersPerTeam]);

  useEffect(() => {
    if (!selectedGroupId) {
      setAllMembers([]);
      setIsLoadingMembers(false);
      return;
    }

    setIsLoadingMembers(true);

    getGroupMembersV2ByGroupId(selectedGroupId)
      .then(members => setAllMembers(members))
      .catch(err => {
        console.error('AddChallengeMatch: error loading members', err);
        setSnackbarMessage('Error al cargar jugadores');
        setSnackbarVisible(true);
      })
      .finally(() => setIsLoadingMembers(false));

    const unsubscribe = subscribeToGroupMembersV2ByGroupId(
      selectedGroupId,
      members => setAllMembers(members),
      error => console.error('AddChallengeMatch: members subscription error', error),
    );

    return unsubscribe;
  }, [selectedGroupId]);

  useEffect(() => {
    const loadMatchForEdit = async () => {
      if (!isEditMode || !matchId || !selectedGroupId) return;

      setIsLoadingMatch(true);
      try {
        const match = await getChallengeMatchById(matchId);

        if (!match) {
          setSnackbarMessage('Partido no encontrado');
          setSnackbarVisible(true);
          navigation.goBack();
          return;
        }

        const baseFormation: Position[] =
          DEFAULT_FORMATION[playersPerTeam] ??
          Array.from({ length: playersPerTeam }, (_, i) => (i === 0 ? 'POR' : 'DEF'));

        const fillFormation = (savedStarters: ChallengeSlot[]) => {
          const starterSlots = baseFormation.map(position => createEmptySlot(position));

          const available: Record<Position, number[]> = {
            POR: [],
            DEF: [],
            MED: [],
            DEL: [],
          };

          starterSlots.forEach((slot, index) => {
            available[slot.position].push(index);
          });

          const unmatched: ChallengeSlot[] = [];

          savedStarters.forEach(player => {
            const preferred = available[player.position]?.shift();
            if (preferred !== undefined) {
              starterSlots[preferred] = player;
              return;
            }

            const fallback = (Object.keys(available) as Position[])
              .map(pos => available[pos])
              .find(list => list.length > 0)
              ?.shift();

            if (fallback !== undefined) {
              starterSlots[fallback] = player;
              return;
            }

            unmatched.push(player);
          });

          return [...starterSlots, ...unmatched];
        };

        const allLoaded = match.players.map(mapSavedPlayerToSlot);
        const starters = fillFormation(allLoaded.filter(player => !player.isSub));
        const subs = allLoaded
          .filter(player => player.isSub)
          .sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position]);

        setSlots([...starters, ...subs]);

        const loadedStatus: MatchStatusMode = match.status === 'scheduled' ? 'scheduled' : 'finished';
        setInitialMatchStatus(loadedStatus);
        setStatusMode(loadedStatus);
        setMatchDate(new Date(match.date));
        setOpponentName(match.opponentName ?? '');
        setGoalsOpponent(String(match.goalsOpponent ?? 0));
      } catch (error) {
        console.error('AddChallengeMatch(edit): error loading match', error);
        setSnackbarMessage('Error al cargar el partido');
        setSnackbarVisible(true);
      } finally {
        setIsLoadingMatch(false);
      }
    };

    loadMatchForEdit();
  }, [isEditMode, matchId, selectedGroupId, playersPerTeam]);

  const assignedIds = useMemo(() => {
    const ids = new Set<string>();
    slots.forEach(slot => {
      if (slot.groupMemberId) ids.add(slot.groupMemberId);
    });
    return ids;
  }, [slots]);

  const pickerCurrentId = pickerSlotIndex !== null ? slots[pickerSlotIndex]?.groupMemberId ?? null : null;

  const pickerBlockedIds = useMemo(() => {
    const blocked = new Set<string>();
    assignedIds.forEach(id => {
      if (id !== pickerCurrentId) blocked.add(id);
    });
    return blocked;
  }, [assignedIds, pickerCurrentId]);

  const teamGoals = useMemo(
    () => slots.reduce((sum, slot) => sum + parseGoals(slot.goals), 0),
    [slots],
  );

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];

    if (!opponentName.trim()) {
      warnings.push('Ingresá el nombre del rival');
    }

    if (statusMode === 'finished') {
      const starters = slots.filter(slot => !slot.isSub);
      const selectedStarters = starters.filter(slot => slot.groupMemberId !== null).length;
      const porCount = starters.filter(
        slot => slot.groupMemberId !== null && slot.position === 'POR',
      ).length;

      if (selectedStarters < starters.length) {
        warnings.push(`Faltan ${starters.length - selectedStarters} titular(es) por seleccionar`);
      }

      if (porCount !== 1) {
        warnings.push(`El equipo debe tener exactamente 1 portero (tiene ${porCount})`);
      }
    }

    return warnings;
  }, [slots, opponentName, statusMode]);

  const canSave = selectedGroupId !== null && validationWarnings.length === 0;
  const createdByUserId = firebaseUser?.uid ?? null;
  const createdByGroupMemberId = useMemo(() => {
    if (!firebaseUser?.uid) return null;
    const currentMember = allMembers.find(member => member.userId === firebaseUser.uid);
    return currentMember?.id ?? null;
  }, [allMembers, firebaseUser?.uid]);

  const handleStatusChange = (value: boolean) => {
    if (isEditMode && initialMatchStatus === 'finished' && !value) {
      return;
    }
    setStatusMode(value ? 'finished' : 'scheduled');
  };

  const handleSetPosition = useCallback((index: number, position: Position) => {
    setSlots(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], position };

      const starters = updated
        .filter(slot => !slot.isSub)
        .sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position]);
      const subs = updated
        .filter(slot => slot.isSub)
        .sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position]);

      return [...starters, ...subs];
    });
  }, []);

  const handleOpenPicker = useCallback((index: number) => {
    setPickerSlotIndex(index);
    setIsPickerVisible(true);
  }, []);

  const handlePlayerSelect = useCallback((memberId: string | null) => {
    if (pickerSlotIndex === null) return;

    setSlots(prev => {
      const updated = [...prev];
      updated[pickerSlotIndex] = { ...updated[pickerSlotIndex], groupMemberId: memberId };
      return updated;
    });

    setIsPickerVisible(false);
    setPickerSlotIndex(null);
  }, [pickerSlotIndex]);

  const handleChangeStat = useCallback(
    (index: number, field: 'goals' | 'assists' | 'ownGoals', value: string) => {
      setSlots(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    },
    [],
  );

  const addSub = useCallback(() => {
    setSlots(prev => [...prev, createSubSlot()]);
  }, []);

  const removeSub = useCallback((index: number) => {
    setSlots(prev => prev.filter((_, i) => i !== index));
  }, []);

  const saveEditMatch = async () => {
    if (!matchId || !selectedGroupId) return;

    setIsSaving(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('No autenticado');

      const idToken = await currentUser.getIdToken();
      const markAsFinished = initialMatchStatus === 'scheduled' && statusMode === 'finished';

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
                players: slots.map(slot => ({
                  groupMemberId: slot.groupMemberId,
                  position: slot.position,
                  goals: parseGoals(slot.goals),
                  assists: parseGoals(slot.assists),
                  ownGoals: parseGoals(slot.ownGoals),
                  isSub: slot.isSub,
                })),
                goalsTeam: teamGoals,
                opponentName: opponentName.trim(),
                goalsOpponent: parseGoals(goalsOpponent),
                date: matchDate.toISOString(),
                markAsFinished,
              },
            },
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage =
          (errorBody as { error?: { message?: string } })?.error?.message ??
          'Error al actualizar el partido';
        throw new Error(errorMessage);
      }

      setSnackbarMessage(
        markAsFinished
          ? 'Partido finalizado y guardado exitosamente'
          : 'Partido actualizado exitosamente',
      );
      setSnackbarVisible(true);
      setTimeout(() => navigation.navigate('ChallengeMatches'), 1500);
    } catch (error) {
      console.error('AddChallengeMatch(edit): error saving match', error);
      setSnackbarMessage('Error al actualizar el partido');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  const saveNewMatch = async () => {
    if (!selectedGroupId) return;

    setIsSaving(true);
    try {
      if (statusMode === 'scheduled') {
        await saveScheduledChallengeMatch({
          date: matchDate,
          groupId: selectedGroupId,
          createdByUserId,
          createdByGroupMemberId,
          players: slots.map(slot => ({
            groupMemberId: slot.groupMemberId,
            position: slot.position,
            isSub: slot.isSub,
          })),
          opponentName: opponentName.trim(),
        });
        setSnackbarMessage('Partido programado guardado');
      } else {
        await saveChallengeMatch({
          date: matchDate,
          groupId: selectedGroupId,
          createdByUserId,
          createdByGroupMemberId,
          players: slots.map(slot => ({
            groupMemberId: slot.groupMemberId,
            position: slot.position,
            goals: slot.goals,
            assists: slot.assists,
            ownGoals: slot.ownGoals,
            isSub: slot.isSub,
          })),
          goalsTeam: teamGoals,
          opponentName: opponentName.trim(),
          goalsOpponent: parseGoals(goalsOpponent),
        });
        setSnackbarMessage('Partido finalizado guardado');
      }

      setSnackbarVisible(true);
      setTimeout(() => navigation.navigate('ChallengeMatches'), 1500);
    } catch (error) {
      console.error('AddChallengeMatch(add): error saving', error);
      setSnackbarMessage('Error al guardar el partido');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving || !selectedGroupId || !canSave) return;

    if (!isEditMode) {
      await saveNewMatch();
      return;
    }

    const willMarkAsFinished = initialMatchStatus === 'scheduled' && statusMode === 'finished';

    Alert.alert(
      'Editar partido',
      willMarkAsFinished
        ? '¿Deseas marcar este partido como finalizado? Se recalcularán estadísticas.'
        : '¿Deseas guardar los cambios de este partido?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'default',
          onPress: () => {
            void saveEditMatch();
          },
        },
      ],
    );
  };

  const formatDate = (date: Date): string =>
    date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const formatTime = (date: Date): string =>
    date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  if (isLoadingMembers || isLoadingMatch) {
    return (
      <View style={styles(theme).center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={{ color: '#666', marginTop: 8 }}>
          Cargando jugadores...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles(theme).container}
      contentContainerStyle={styles(theme).content}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={styles(theme).card}>
        <Card.Content style={styles(theme).statusContent}>
          <View style={{ flex: 1 }}>
            <Text variant="labelLarge" style={styles(theme).statusLabel}>
              Estado del partido
            </Text>
            <Text variant="bodySmall" style={styles(theme).statusSwitchText}>
              {statusMode === 'scheduled' ? 'Programado' : 'Finalizado'}
            </Text>
          </View>
          <View style={styles(theme).statusSwitchWrap}>
            <Text style={styles(theme).statusSwitchText}>Programado</Text>
            <Switch
              value={statusMode === 'finished'}
              onValueChange={handleStatusChange}
              trackColor={{ false: '#D1D5DB', true: theme.colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D1D5DB"
            />
            <Text style={styles(theme).statusSwitchText}>Finalizado</Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles(theme).card} onPress={() => setShowDatePicker(true)}>
        <Card.Content style={styles(theme).dateCardContent}>
          <View style={[styles(theme).dateIconBox, { backgroundColor: theme.colors.primary }]}>
            <Icon name="calendar-clock" size={26} color="#FFF" />
          </View>
          <View style={styles(theme).dateInfo}>
            <Text variant="labelSmall" style={styles(theme).dateLabel}>
              Fecha del partido
            </Text>
            <Text variant="bodyLarge" style={styles(theme).dateValue}>
              {formatDate(matchDate)}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: '600' }}>
              {formatTime(matchDate)}
            </Text>
          </View>
          <Icon name="pencil-outline" size={20} color={theme.colors.primary} />
        </Card.Content>
      </Card>

      <Card style={styles(theme).card}>
        <Card.Content style={styles(theme).opponentCardContent}>
          <View style={[styles(theme).dateIconBox, { backgroundColor: '#FF7043' }]}>
            <Icon name="shield-outline" size={26} color="#FFF" />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <TextInput
              mode="outlined"
              label="Rival"
              value={opponentName}
              onChangeText={setOpponentName}
              placeholder="Ej: Los Piratas"
              dense
            />
            {statusMode === 'finished' && (
              <TextInput
                mode="outlined"
                label="Goles del rival"
                value={goalsOpponent}
                onChangeText={value => setGoalsOpponent(normalizeStatInput(value))}
                onFocus={() => {
                  if (goalsOpponent === '0') setGoalsOpponent('');
                }}
                onBlur={() => {
                  if (!goalsOpponent) setGoalsOpponent('0');
                }}
                keyboardType="number-pad"
                dense
              />
            )}
          </View>
        </Card.Content>
      </Card>

      <Card style={styles(theme).card}>
        <Card.Content style={styles(theme).slotsContent}>
          {slots.map((slot, index) => {
            const member = allMembers.find(player => player.id === slot.groupMemberId);

            return (
              <SlotRow
                key={`${slot.isSub ? 'sub' : 'starter'}_${index}`}
                slot={slot}
                index={index}
                member={member}
                menuOpen={openMenuFor === index}
                showStats={statusMode === 'finished'}
                isSub={slot.isSub}
                isFirstStarter={!slot.isSub && index === 0}
                onOpenPicker={() => handleOpenPicker(index)}
                onToggleMenu={() => setOpenMenuFor(index)}
                onDismissMenu={() => setOpenMenuFor(null)}
                onSetPosition={position => handleSetPosition(index, position)}
                onRemoveSub={() => removeSub(index)}
                onChangeStat={(field, value) => handleChangeStat(index, field, value)}
                theme={theme}
              />
            );
          })}

          <Divider />
          <TouchableOpacity style={styles(theme).addSubButton} onPress={addSub} activeOpacity={0.7}>
            <Icon name="plus-circle-outline" size={20} color={theme.colors.onSecondary} />
            <Text style={styles(theme).addSubText}>Agregar suplente</Text>
          </TouchableOpacity>
        </Card.Content>
      </Card>

      {validationWarnings.length > 0 && (
        <Card style={styles(theme).warningCard}>
          <Card.Content style={styles(theme).warningContent}>
            {validationWarnings.map((warning, index) => (
              <View key={`warning_${index}`} style={styles(theme).warningRow}>
                <Icon name="alert-circle" size={16} color={theme.colors.error} />
                <Text style={styles(theme).warningText}>{warning}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {statusMode === 'finished' && (
        <Card style={styles(theme).compactScoreCard}>
          <Card.Content style={styles(theme).compactScoreContent}>
            <View style={styles(theme).compactScoreRow}>
              <View style={styles(theme).compactTeamBlock}>
                <Text variant="labelSmall" style={styles(theme).compactScoreLabel}>
                  Mi Equipo
                </Text>
                <Text variant="headlineSmall" style={styles(theme).compactScoreNumber}>
                  {teamGoals}
                </Text>
              </View>

              <Text variant="bodyMedium" style={styles(theme).compactScoreVs}>
                VS
              </Text>

              <View style={styles(theme).compactTeamBlock}>
                <Text variant="labelSmall" style={styles(theme).compactScoreLabel}>
                  Rival
                </Text>
                <Text variant="headlineSmall" style={styles(theme).compactScoreNumber}>
                  {parseGoals(goalsOpponent)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      <Button
        mode="contained"
        onPress={handleSave}
        loading={isSaving}
        disabled={isSaving || !canSave}
        style={styles(theme).saveButton}
        contentStyle={styles(theme).saveButtonContent}
        icon={statusMode === 'scheduled' ? 'calendar-check' : 'content-save'}
      >
        {isEditMode
          ? 'Guardar cambios'
          : statusMode === 'scheduled'
            ? 'Guardar Partido Programado'
            : 'Guardar Partido Finalizado'}
      </Button>

      <DatePicker
        modal
        open={showDatePicker}
        date={matchDate}
        mode="datetime"
        locale="es"
        title="Fecha y hora del partido"
        confirmText="Confirmar"
        cancelText="Cancelar"
        onConfirm={date => {
          setMatchDate(date);
          setShowDatePicker(false);
        }}
        onCancel={() => setShowDatePicker(false)}
      />

      <ScheduledPlayerPicker
        visible={isPickerVisible}
        members={allMembers}
        blockedIds={pickerBlockedIds}
        currentId={pickerCurrentId}
        teamLabel="Mi equipo"
        onSelect={handlePlayerSelect}
        onDismiss={() => {
          setIsPickerVisible(false);
          setPickerSlotIndex(null);
        }}
      />

      <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={2000}>
        {snackbarMessage}
      </Snackbar>
    </ScrollView>
  );
}

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F5F5F5',
    },
    content: {
      padding: 12,
      paddingBottom: 40,
      gap: 16,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
    },
    statusContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    statusLabel: {
      fontWeight: '600',
    },
    statusSwitchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusSwitchText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
    },
    dateCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    opponentCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    dateIconBox: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateInfo: {
      flex: 1,
      gap: 2,
    },
    dateLabel: {
      color: theme.colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    dateValue: {
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    slotsContent: {
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      gap: 8,
      minHeight: 54,
    },
    subSlotRow: {
      backgroundColor: '#FFF',
    },
    subChip: {
      backgroundColor: theme.colors.secondary,
      borderColor: theme.colors.secondary,
    },
    addSubButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
      gap: 8,
      backgroundColor: theme.colors.secondary,
    },
    addSubText: {
      color: theme.colors.onSecondary,
      fontWeight: '600',
    },
    playerButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statsSpacer: {
      width: 138,
    },
    inlineStatsContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      width: 138,
    },
    inlineStatField: {
      width: 42,
      alignItems: 'center',
      gap: 2,
    },
    inlineStatLabel: {
      fontSize: 9,
      color: theme.colors.onSurfaceVariant,
      fontWeight: '600',
    },
    inlineStatInput: {
      width: 42,
      height: 34,
      backgroundColor: theme.colors.surface,
    },
    playerName: {
      flex: 1,
      fontWeight: '500',
    },
    emptySlotText: {
      color: theme.colors.onSurfaceVariant,
      flex: 1,
    },
    posChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      minWidth: 46,
      alignItems: 'center',
    },
    posChipDisabled: {
      opacity: 0.3,
    },
    posChipText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    warningCard: {
      borderRadius: 12,
      backgroundColor: theme.colors.errorContainer,
    },
    warningContent: {
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
    compactScoreCard: {
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
    },
    compactScoreContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    compactScoreLabel: {
      color: theme.colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    compactScoreRow: {
      flexDirection: 'row',
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    compactTeamBlock: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 72,
    },
    compactScoreNumber: {
      fontWeight: '700',
      minWidth: 26,
      textAlign: 'center',
    },
    compactScoreVs: {
      color: theme.colors.onSurfaceVariant,
      fontWeight: '600',
    },
    saveButton: {
      borderRadius: 8,
    },
    saveButtonContent: {
      paddingVertical: 6,
    },
  });
