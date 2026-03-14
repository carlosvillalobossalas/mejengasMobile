import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import {
  Text,
  Card,
  Divider,
  useTheme,
  MD3Theme,
  Button,
  SegmentedButtons,
  Menu,
  ActivityIndicator,
  Snackbar,
  TextInput,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import DatePicker from 'react-native-date-picker';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import auth from '@react-native-firebase/auth';

import ScheduledPlayerPicker from '../components/ScheduledPlayerPicker';
import ColorPickerSheet from '../components/ColorPickerSheet';
import { VenuePickerModal } from '../components/venue/VenuePickerModal';
import type { MatchVenue } from '../types/venue';
import {
  useAddScheduledMatch,
  type ScheduledPosition,
  type ScheduledSlot,
} from '../hooks/useAddScheduledMatch';
import { useAppSelector } from '../app/hooks';
import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import { getMatchById } from '../repositories/matches/matchesRepository';
import { saveMatch, saveScheduledMatch } from '../services/matches/matchSaveService';
import type { MatchPublicationInput } from '../types/matchPublication';
import type { AppDrawerParamList } from '../navigation/types';

const POSITIONS: ScheduledPosition[] = ['POR', 'DEF', 'MED', 'DEL'];

const POSITION_LABELS: Record<ScheduledPosition, string> = {
  POR: 'Portero',
  DEF: 'Defensa',
  MED: 'Mediocampo',
  DEL: 'Delantero',
};

const POSITION_ORDER: Record<ScheduledPosition, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

const DEFAULT_FORMATION: Record<number, ScheduledPosition[]> = {
  5: ['POR', 'DEF', 'DEF', 'DEL', 'DEL'],
  7: ['POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'DEL'],
  11: ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL'],
};

type MatchStatusMode = 'scheduled' | 'finished';
type SlotMenuState = { team: 1 | 2; index: number } | null;

type AddMatchRouteParams = {
  matchId?: string;
};

interface Props {
  route?: {
    params?: AddMatchRouteParams;
  };
}

type SlotRowProps = {
  slot: ScheduledSlot;
  index: number;
  member: GroupMemberV2 | undefined;
  menuOpen: boolean;
  onOpenPicker: () => void;
  onToggleMenu: () => void;
  onDismissMenu: () => void;
  onSetPosition: (pos: ScheduledPosition | null) => void;
  onChangeStat?: (field: 'goals' | 'assists' | 'ownGoals', value: string) => void;
  onStatFocus?: () => void;
  showStats?: boolean;
  isSub?: boolean;
  isFirstStarter?: boolean;
  onRemoveSub?: () => void;
  theme: MD3Theme;
};

function SlotRow({
  slot,
  index,
  member,
  menuOpen,
  onOpenPicker,
  onToggleMenu,
  onDismissMenu,
  onSetPosition,
  onChangeStat,
  onStatFocus,
  showStats = false,
  isSub = false,
  isFirstStarter = false,
  onRemoveSub,
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
                  style={[styles(t).posChip, { backgroundColor: t.colors.secondary, borderColor: t.colors.secondary }]}
                  onPress={onToggleMenu}
                >
                  <Text style={[styles(t).posChipText, { color: '#FFF' }]}>
                    {slot.position ?? 'DEF'}
                  </Text>
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
            <Text style={{ fontSize: 9, color: t.colors.secondary, fontWeight: '700', marginTop: 2 }}>SUP</Text>
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
                  style={[
                    styles(t).posChipText,
                    { color: slot.position ? '#FFF' : t.colors.onSurfaceVariant },
                  ]}
                >
                  {slot.position ?? '—'}
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
                  onSetPosition(slot.position === pos ? null : pos);
                  onDismissMenu();
                }}
              />
            ))}
          </Menu>
        )}

        <TouchableOpacity
          style={styles(t).playerButton}
          onPress={onOpenPicker}
          activeOpacity={0.7}
        >
          {member ? (
            <Text variant="bodyMedium" style={styles(t).playerName} numberOfLines={1}>
              {member.displayName}
            </Text>
          ) : (
            <>
              <Icon
                name="account-plus-outline"
                size={22}
                color={t.colors.onSurfaceVariant}
              />
              <Text variant="bodySmall" style={styles(t).emptySlotText}>
                {isSub ? 'Suplente' : `Jugador ${index + 1}`}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {isSub ? (
          <TouchableOpacity
            onPress={onRemoveSub}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="delete-outline" size={22} color={t.colors.error} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}

        {showStats ? (
          <View style={styles(t).inlineStatsContainer}>
            <View style={styles(t).inlineStatField}>
              <Text style={styles(t).inlineStatLabel}>Gol</Text>
              <TextInput
                mode="outlined"
                value={slot.goals}
                onChangeText={value => onChangeStat?.('goals', value.replace(/[^0-9]/g, ''))}
                onFocus={() => {
                  onStatFocus?.();
                  if (slot.goals === '0') onChangeStat?.('goals', '');
                }}
                onBlur={() => {
                  if (!slot.goals) onChangeStat?.('goals', '0');
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
                onChangeText={value => onChangeStat?.('assists', value.replace(/[^0-9]/g, ''))}
                onFocus={() => {
                  onStatFocus?.();
                  if (slot.assists === '0') onChangeStat?.('assists', '');
                }}
                onBlur={() => {
                  if (!slot.assists) onChangeStat?.('assists', '0');
                }}
                keyboardType="number-pad"
                dense
                style={styles(t).inlineStatInput}
                disabled={!member}
              />
            </View>
            <View style={styles(t).inlineStatField}>
              <Text style={styles(t).inlineStatLabel}>A.G</Text>
              <TextInput
                mode="outlined"
                value={slot.ownGoals}
                onChangeText={value => onChangeStat?.('ownGoals', value.replace(/[^0-9]/g, ''))}
                onFocus={() => {
                  onStatFocus?.();
                  if (slot.ownGoals === '0') onChangeStat?.('ownGoals', '');
                }}
                onBlur={() => {
                  if (!slot.ownGoals) onChangeStat?.('ownGoals', '0');
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

const parseGoals = (value: string) => Number.parseInt(value || '0', 10) || 0;

const normalizeStatInput = (value: string) => {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned === '') return '';
  if (cleaned === '0') return '0';
  return cleaned.replace(/^0+(?=\d)/, '');
};

const createEmptySlot = (position: ScheduledPosition): ScheduledSlot => ({
  groupMemberId: null,
  position,
  isSub: false,
  goals: '0',
  assists: '0',
  ownGoals: '0',
});

export default function AddMatchScreen({ route }: Props) {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const groups = useAppSelector(state => state.groups.groups);
  const matchId = route?.params?.matchId ?? null;
  const isEditMode = !!matchId;

  const [openMenuFor, setOpenMenuFor] = useState<SlotMenuState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [statusMode, setStatusMode] = useState<MatchStatusMode>('scheduled');
  const [isLoadingMatch, setIsLoadingMatch] = useState(false);
  const [initialMatchStatus, setInitialMatchStatus] = useState<MatchStatusMode | null>(null);

  const {
    selectedGroupId,
    playersPerTeam,
    matchDate,
    setMatchDate,
    showDatePicker,
    setShowDatePicker,
    activeTeam,
    setActiveTeam,
    team1Slots,
    team2Slots,
    allMembers,
    isLoadingMembers,
    team1Ids,
    team2Ids,
    pickerTeam,
    pickerSlotIndex,
    openPicker,
    closePicker,
    selectPlayer,
    setPosition,
    addSub,
    removeSub,
    updateStat,
    setTeamSlots,
    filledCount,
  } = useAddScheduledMatch();

  const selectedGroup = useMemo(
    () => groups.find(group => group.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  const [team1Color, setTeam1Color] = useState(selectedGroup?.defaultTeam1Color ?? '#000000');
  const [team2Color, setTeam2Color] = useState(selectedGroup?.defaultTeam2Color ?? '#FFFFFF');
  const [isPublished, setIsPublished] = useState(false);
  const [neededPlayers, setNeededPlayers] = useState('1');
  const [allowAnyPosition, setAllowAnyPosition] = useState(true);
  const [preferredPositions, setPreferredPositions] = useState<ScheduledPosition[]>([]);
  const [publicationNotes, setPublicationNotes] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<MatchVenue | null>(null);
  const [venuePickerVisible, setVenuePickerVisible] = useState(false);
  const [colorSheet, setColorSheet] = useState<'team1' | 'team2' | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!selectedGroup || isEditMode) return;
    setTeam1Color(selectedGroup.defaultTeam1Color ?? '#000000');
    setTeam2Color(selectedGroup.defaultTeam2Color ?? '#FFFFFF');
  }, [selectedGroup, isEditMode]);

  useEffect(() => {
    const loadMatchForEdit = async () => {
      if (!isEditMode || !matchId || !selectedGroupId) return;

      setIsLoadingMatch(true);
      try {
        const match = await getMatchById(matchId);

        if (!match) {
          setSnackbarMessage('Partido no encontrado');
          setSnackbarVisible(true);
          navigation.goBack();
          return;
        }

        const baseFormation: ScheduledPosition[] =
          DEFAULT_FORMATION[playersPerTeam] ??
          Array.from({ length: playersPerTeam }, (_, i) => (i === 0 ? 'POR' : 'DEF'));

        const mapSavedPlayer = (player: (typeof match.players1)[number]): ScheduledSlot => ({
          groupMemberId: player.groupMemberId ?? null,
          position: player.position,
          goals: String(player.goals ?? 0),
          assists: String(player.assists ?? 0),
          ownGoals: String(player.ownGoals ?? 0),
          isSub: player.isSub ?? false,
        });

        const fillFormation = (savedStarters: ScheduledSlot[]) => {
          const slots = baseFormation.map(pos => createEmptySlot(pos));
          const available: Record<ScheduledPosition, number[]> = {
            POR: [],
            DEF: [],
            MED: [],
            DEL: [],
          };

          slots.forEach((slot, index) => {
            available[slot.position!].push(index);
          });

          const unmatched: ScheduledSlot[] = [];

          savedStarters.forEach(player => {
            const slotPosition = player.position ?? 'DEF';
            const positionIndexes = available[slotPosition];
            if (positionIndexes.length > 0) {
              const positionIndex = positionIndexes.shift()!;
              slots[positionIndex] = player;
              return;
            }
            unmatched.push(player);
          });

          return [...slots, ...unmatched];
        };

        const allTeam1 = match.players1.map(mapSavedPlayer);
        const allTeam2 = match.players2.map(mapSavedPlayer);

        const startersTeam1 = fillFormation(allTeam1.filter(player => !player.isSub));
        const startersTeam2 = fillFormation(allTeam2.filter(player => !player.isSub));

        const subsTeam1 = allTeam1
          .filter(player => player.isSub)
          .sort((a, b) => POSITION_ORDER[a.position ?? 'DEF'] - POSITION_ORDER[b.position ?? 'DEF']);

        const subsTeam2 = allTeam2
          .filter(player => player.isSub)
          .sort((a, b) => POSITION_ORDER[a.position ?? 'DEF'] - POSITION_ORDER[b.position ?? 'DEF']);

        setTeamSlots(1, [...startersTeam1, ...subsTeam1]);
        setTeamSlots(2, [...startersTeam2, ...subsTeam2]);

        const loadedStatus: MatchStatusMode = match.status === 'scheduled' ? 'scheduled' : 'finished';
        setInitialMatchStatus(loadedStatus);
        setStatusMode(loadedStatus);
        setMatchDate(new Date(match.date));
        setTeam1Color(match.team1Color ?? selectedGroup?.defaultTeam1Color ?? '#000000');
        setTeam2Color(match.team2Color ?? selectedGroup?.defaultTeam2Color ?? '#FFFFFF');
        setIsPublished(Boolean(match.publication?.isPublished));
        setNeededPlayers(String(Math.max(1, match.publication?.neededPlayers ?? 1)));
        setAllowAnyPosition(Boolean(match.publication?.allowAnyPosition ?? true));
        setPreferredPositions(match.publication?.preferredPositions ?? []);
        setPublicationNotes(match.publication?.notes ?? '');
        if (match.venue) setSelectedVenue(match.venue);
      } catch (error) {
        console.error('AddMatch(edit): error loading match', error);
        setSnackbarMessage('Error al cargar el partido');
        setSnackbarVisible(true);
      } finally {
        setIsLoadingMatch(false);
      }
    };

    loadMatchForEdit();
  }, [isEditMode, matchId, selectedGroupId, playersPerTeam, selectedGroup]);

  const activeTeamNum: 1 | 2 = activeTeam === '1' ? 1 : 2;
  const activeSlots = activeTeam === '1' ? team1Slots : team2Slots;

  const pickerCurrentId =
    pickerTeam !== null && pickerSlotIndex !== null
      ? (pickerTeam === 1 ? team1Slots : team2Slots)[pickerSlotIndex]?.groupMemberId ?? null
      : null;

  const pickerBlockedIds = (() => {
    if (pickerTeam === null) return new Set<string>();
    const oppositeIds = pickerTeam === 1 ? team2Ids : team1Ids;
    const sameTeamIds = pickerTeam === 1 ? team1Ids : team2Ids;
    const blocked = new Set<string>(oppositeIds);
    sameTeamIds.forEach(id => {
      if (id !== pickerCurrentId) blocked.add(id);
    });
    return blocked;
  })();

  const team1Goals = useMemo(() => {
    const goals = team1Slots.reduce((sum, slot) => sum + parseGoals(slot.goals), 0);
    const opponentOwnGoals = team2Slots.reduce((sum, slot) => sum + parseGoals(slot.ownGoals), 0);
    return goals + opponentOwnGoals;
  }, [team1Slots, team2Slots]);

  const team2Goals = useMemo(() => {
    const goals = team2Slots.reduce((sum, slot) => sum + parseGoals(slot.goals), 0);
    const opponentOwnGoals = team1Slots.reduce((sum, slot) => sum + parseGoals(slot.ownGoals), 0);
    return goals + opponentOwnGoals;
  }, [team1Slots, team2Slots]);

  const validationWarnings = useMemo(() => {
    const requiresFullLineup = statusMode === 'finished';
    if (!requiresFullLineup) return [] as string[];

    const warnings: string[] = [];
    const team1Starters = team1Slots.filter(slot => !slot.isSub);
    const team2Starters = team2Slots.filter(slot => !slot.isSub);
    const team1Selected = team1Starters.filter(slot => slot.groupMemberId !== null).length;
    const team2Selected = team2Starters.filter(slot => slot.groupMemberId !== null).length;

    if (team1Selected < team1Starters.length) {
      warnings.push(`Equipo 1: faltan ${team1Starters.length - team1Selected} titular(es) por seleccionar`);
    }
    if (team2Selected < team2Starters.length) {
      warnings.push(`Equipo 2: faltan ${team2Starters.length - team2Selected} titular(es) por seleccionar`);
    }

    const team1PorCount = team1Starters.filter(slot => slot.groupMemberId !== null && slot.position === 'POR').length;
    const team2PorCount = team2Starters.filter(slot => slot.groupMemberId !== null && slot.position === 'POR').length;

    if (team1PorCount !== 1) {
      warnings.push(`Equipo 1 debe tener exactamente 1 portero (tiene ${team1PorCount})`);
    }
    if (team2PorCount !== 1) {
      warnings.push(`Equipo 2 debe tener exactamente 1 portero (tiene ${team2PorCount})`);
    }

    return warnings;
  }, [statusMode, team1Slots, team2Slots]);

  const canSave = selectedGroupId !== null && validationWarnings.length === 0;
  const createdByUserId = firebaseUser?.uid ?? null;
  const createdByGroupMemberId = useMemo(() => {
    if (!firebaseUser?.uid) return null;
    const currentMember = allMembers.find(member => member.userId === firebaseUser.uid);
    return currentMember?.id ?? null;
  }, [allMembers, firebaseUser?.uid]);

  const handleStatChange = (
    team: 1 | 2,
    index: number,
    field: 'goals' | 'assists' | 'ownGoals',
    value: string,
  ) => {
    updateStat(team, index, field, normalizeStatInput(value));
  };

  const handleStatusChange = (value: boolean) => {
    if (isEditMode && initialMatchStatus === 'finished' && !value) {
      return;
    }
    setStatusMode(value ? 'finished' : 'scheduled');
  };

  const togglePreferredPosition = (position: ScheduledPosition) => {
    setPreferredPositions(current =>
      current.includes(position)
        ? current.filter(currentPosition => currentPosition !== position)
        : [...current, position],
    );
  };

  const buildPublicationInput = (): MatchPublicationInput => {
    if (!isPublished) {
      return {
        isPublished: false,
        neededPlayers: 0,
        allowAnyPosition: true,
        preferredPositions: [],
        city: null,
        notes: null,
        publishedByUserId: null,
      };
    }

    const parsedNeededPlayers = Number.parseInt(neededPlayers || '1', 10);

    return {
      isPublished: true,
      neededPlayers: Number.isNaN(parsedNeededPlayers) ? 1 : Math.max(1, parsedNeededPlayers),
      allowAnyPosition,
      preferredPositions: allowAnyPosition ? [] : preferredPositions,
      city: null,
      notes: publicationNotes.trim() ? publicationNotes.trim() : null,
      publishedByUserId: createdByUserId,
      venue: selectedVenue,
    };
  };

  const saveEditMatch = async () => {
    if (!matchId || !selectedGroupId) return;

    setIsSaving(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('No autenticado');

      const idToken = await currentUser.getIdToken();
      const markAsFinished = initialMatchStatus === 'scheduled' && statusMode === 'finished';

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
                players1: team1Slots.map(player => ({
                  groupMemberId: player.groupMemberId,
                  position: player.position,
                  goals: parseGoals(player.goals),
                  assists: parseGoals(player.assists),
                  ownGoals: parseGoals(player.ownGoals),
                  isSub: player.isSub,
                })),
                players2: team2Slots.map(player => ({
                  groupMemberId: player.groupMemberId,
                  position: player.position,
                  goals: parseGoals(player.goals),
                  assists: parseGoals(player.assists),
                  ownGoals: parseGoals(player.ownGoals),
                  isSub: player.isSub,
                })),
                goalsTeam1: team1Goals,
                goalsTeam2: team2Goals,
                team1Color,
                team2Color,
                date: matchDate.toISOString(),
                markAsFinished,
                publication: buildPublicationInput(),
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

      setSnackbarMessage(markAsFinished ? 'Partido finalizado y guardado exitosamente' : 'Partido actualizado exitosamente');
      setSnackbarVisible(true);
      setTimeout(() => navigation.navigate('MyMatches'), 1500);
    } catch (error) {
      console.error('AddMatch(edit): error saving match', error);
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
        await saveScheduledMatch({
          date: matchDate,
          groupId: selectedGroupId,
          createdByUserId,
          createdByGroupMemberId,
          team1Players: team1Slots.map(slot => ({
            groupMemberId: slot.groupMemberId,
            position: slot.position,
            isSub: slot.isSub,
          })),
          team2Players: team2Slots.map(slot => ({
            groupMemberId: slot.groupMemberId,
            position: slot.position,
            isSub: slot.isSub,
          })),
          team1Color,
          team2Color,
          venue: selectedVenue,
          publication: buildPublicationInput(),
        });

        setSnackbarMessage('Partido programado guardado');
      } else {
        await saveMatch({
          date: matchDate,
          groupId: selectedGroupId,
          createdByUserId,
          createdByGroupMemberId,
          team1Goals,
          team2Goals,
          team1Color,
          team2Color,
          team1Players: team1Slots.map(slot => ({
            groupMemberId: slot.groupMemberId,
            position: slot.position ?? 'DEF',
            playerName: '',
            goals: slot.goals,
            assists: slot.assists,
            ownGoals: slot.ownGoals,
            isSub: slot.isSub,
          })),
          team2Players: team2Slots.map(slot => ({
            groupMemberId: slot.groupMemberId,
            position: slot.position ?? 'DEF',
            playerName: '',
            goals: slot.goals,
            assists: slot.assists,
            ownGoals: slot.ownGoals,
            isSub: slot.isSub,
          })),
          venue: selectedVenue,
          publication: buildPublicationInput(),
        });

        setSnackbarMessage('Partido finalizado guardado');
      }

      setSnackbarVisible(true);
      setTimeout(() => navigation.navigate('MyMatches'), 1500);
    } catch (error) {
      console.error('AddMatch(add): error saving', error);
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
      ref={scrollViewRef}
      style={styles(theme).container}
      contentContainerStyle={styles(theme).content}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={styles(theme).card}>
        <Card.Content style={styles(theme).statusContent}>
          <View style={{ flex: 1 }}>
            <Text variant="labelSmall" style={styles(theme).dateLabel}>
              Estado del partido
            </Text>
            <Text variant="titleSmall" style={styles(theme).statusLabel}>
              {statusMode === 'scheduled' ? 'Programado' : 'Finalizado'}
            </Text>
          </View>
          <View style={styles(theme).statusSwitchWrap}>
            <Text variant="bodySmall" style={styles(theme).statusSwitchText}>Programado</Text>
            <Switch
              value={statusMode === 'finished'}
              onValueChange={handleStatusChange}
              trackColor={{ false: '#D1D5DB', true: theme.colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D1D5DB"
            />
            <Text variant="bodySmall" style={styles(theme).statusSwitchText}>Finalizado</Text>
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
              Fecha y hora del partido
            </Text>
            <Text variant="titleSmall" style={styles(theme).dateValue}>
              {formatDate(matchDate)}
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.primary, fontWeight: '600' }}
            >
              {formatTime(matchDate)}
            </Text>
          </View>
          <Icon name="pencil-outline" size={20} color={theme.colors.primary} />
        </Card.Content>
      </Card>

      <Card style={styles(theme).card} onPress={() => setVenuePickerVisible(true)}>
        <Card.Content style={styles(theme).dateCardContent}>
          <View style={[styles(theme).dateIconBox, { backgroundColor: selectedVenue ? theme.colors.primary : theme.colors.surfaceVariant }]}>
            <Icon name="map-marker" size={26} color={selectedVenue ? '#FFF' : theme.colors.onSurfaceVariant} />
          </View>
          <View style={styles(theme).dateInfo}>
            <Text variant="labelSmall" style={styles(theme).dateLabel}>
              Lugar del partido
            </Text>
            <Text variant="titleSmall" style={styles(theme).dateValue}>
              {selectedVenue ? selectedVenue.name : 'Agregar lugar (opcional)'}
            </Text>
            {selectedVenue?.address ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                {selectedVenue.address}
              </Text>
            ) : null}
          </View>
          {selectedVenue ? (
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => setSelectedVenue(null)}
            >
              <Icon name="close" size={20} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          ) : (
            <Icon name="pencil-outline" size={20} color={theme.colors.primary} />
          )}
        </Card.Content>
      </Card>

      <Card style={styles(theme).card}>
        <Card.Content style={styles(theme).publicationContent}>
          <View style={styles(theme).publicationRow}>
            <View style={{ flex: 1 }}>
              <Text variant="labelSmall" style={styles(theme).dateLabel}>
                Publicación externa
              </Text>
              <Text variant="bodySmall" style={styles(theme).statusSwitchText}>
                Mostrar este partido en el feed público
              </Text>
            </View>
            <Switch
              value={isPublished}
              onValueChange={setIsPublished}
              trackColor={{ false: '#D1D5DB', true: theme.colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D1D5DB"
            />
          </View>

          {isPublished && (
            <>
              <TextInput
                mode="outlined"
                label="Jugadores que faltan"
                value={neededPlayers}
                onChangeText={value => setNeededPlayers(value.replace(/[^0-9]/g, ''))}
                onBlur={() => {
                  if (!neededPlayers || neededPlayers === '0') {
                    setNeededPlayers('1');
                  }
                }}
                keyboardType="number-pad"
                dense
              />

              <View style={styles(theme).publicationRow}>
                <Text variant="bodyMedium" style={{ flex: 1 }}>
                  Aceptar cualquier posición
                </Text>
                <Switch
                  value={allowAnyPosition}
                  onValueChange={setAllowAnyPosition}
                  trackColor={{ false: '#D1D5DB', true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#D1D5DB"
                />
              </View>

              {!allowAnyPosition && (
                <View style={styles(theme).positionChipsWrap}>
                  {POSITIONS.map(position => {
                    const isSelected = preferredPositions.includes(position);
                    return (
                      <TouchableOpacity
                        key={`publication-pos-${position}`}
                        onPress={() => togglePreferredPosition(position)}
                        style={[
                          styles(theme).positionChip,
                          isSelected && styles(theme).positionChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles(theme).positionChipText,
                            isSelected && styles(theme).positionChipTextSelected,
                          ]}
                        >
                          {position}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <TextInput
                mode="outlined"
                label="Notas para postulantes"
                value={publicationNotes}
                onChangeText={setPublicationNotes}
                dense
                multiline
              />
            </>
          )}
        </Card.Content>
      </Card>

      <Card style={styles(theme).card}>
        <Card.Content style={styles(theme).colorsCardContent}>
          <Text variant="labelSmall" style={styles(theme).dateLabel}>
            Colores de camiseta para este partido
          </Text>

          <View style={styles(theme).colorButtonsRow}>
            <TouchableOpacity
              style={styles(theme).colorButton}
              onPress={() => setColorSheet('team1')}
            >
              <View
                style={[
                  styles(theme).colorButtonDot,
                  { backgroundColor: team1Color },
                  team1Color === '#FFFFFF' && styles(theme).colorButtonDotBorder,
                ]}
              />
              <Text variant="bodyMedium" style={{ flex: 1 }}>Equipo 1</Text>
              <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>

            <Divider />

            <TouchableOpacity
              style={styles(theme).colorButton}
              onPress={() => setColorSheet('team2')}
            >
              <View
                style={[
                  styles(theme).colorButtonDot,
                  { backgroundColor: team2Color },
                  team2Color === '#FFFFFF' && styles(theme).colorButtonDotBorder,
                ]}
              />
              <Text variant="bodyMedium" style={{ flex: 1 }}>Equipo 2</Text>
              <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </Card.Content>
      </Card>

      <ColorPickerSheet
        visible={colorSheet !== null}
        title={colorSheet === 'team1' ? 'Color Equipo 1' : 'Color Equipo 2'}
        selectedColor={colorSheet === 'team1' ? team1Color : team2Color}
        onSelect={color => {
          if (colorSheet === 'team1') setTeam1Color(color);
          else setTeam2Color(color);
        }}
        onDismiss={() => setColorSheet(null)}
      />

      <SegmentedButtons
        value={activeTeam}
        onValueChange={value => setActiveTeam(value as '1' | '2')}
        buttons={[
          {
            value: '1',
            label: `Equipo 1 (${filledCount(team1Slots)}/${playersPerTeam})`,
            icon: 'shield',
          },
          {
            value: '2',
            label: `Equipo 2 (${filledCount(team2Slots)}/${playersPerTeam})`,
            icon: 'shield-outline',
          },
        ]}
        theme={{
          colors: {
            secondaryContainer: theme.colors.primary,
            onSecondaryContainer: '#FFF',
          },
        }}
      />

      <Card style={styles(theme).card}>
        <Card.Content style={styles(theme).slotsContent}>
          {activeSlots.map((slot, index) => {
            const firstStarterIndex = activeSlots.findIndex(currentSlot => !currentSlot.isSub);
            return (
              <SlotRow
                key={index}
                slot={slot}
                index={index}
                member={allMembers.find(member => member.id === slot.groupMemberId)}
                menuOpen={
                  openMenuFor?.team === activeTeamNum && openMenuFor?.index === index
                }
                onOpenPicker={() => openPicker(activeTeamNum, index)}
                onToggleMenu={() =>
                  setOpenMenuFor(
                    openMenuFor?.team === activeTeamNum && openMenuFor?.index === index
                      ? null
                      : { team: activeTeamNum, index },
                  )
                }
                onDismissMenu={() => setOpenMenuFor(null)}
                onSetPosition={position => setPosition(activeTeamNum, index, position)}
                onChangeStat={(field, value) => handleStatChange(activeTeamNum, index, field, value)}
                onStatFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                showStats={statusMode === 'finished'}
                isSub={slot.isSub}
                isFirstStarter={!slot.isSub && index === firstStarterIndex}
                onRemoveSub={slot.isSub ? () => removeSub(activeTeamNum, index) : undefined}
                theme={theme}
              />
            );
          })}

          <Divider />
          <TouchableOpacity
            style={styles(theme).addSubButton}
            onPress={() => addSub(activeTeamNum)}
            activeOpacity={0.7}
          >
            <Icon name="plus-circle-outline" size={20} color={theme.colors.onSecondary} />
            <Text style={styles(theme).addSubText}>Agregar suplente</Text>
          </TouchableOpacity>
        </Card.Content>
      </Card>

      {validationWarnings.length > 0 && (
        <Card style={styles(theme).warningCard}>
          <Card.Content style={styles(theme).warningContent}>
            {validationWarnings.map((warning, index) => (
              <View key={index} style={styles(theme).warningRow}>
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
                <Text variant="labelSmall" style={styles(theme).compactScoreLabel}>Equipo 1</Text>
                <Text variant="headlineSmall" style={styles(theme).compactScoreNumber}>{team1Goals}</Text>
              </View>
              <Text variant="titleSmall" style={styles(theme).compactScoreVs}>-</Text>
              <View style={styles(theme).compactTeamBlock}>
                <Text variant="labelSmall" style={styles(theme).compactScoreLabel}>Equipo 2</Text>
                <Text variant="headlineSmall" style={styles(theme).compactScoreNumber}>{team2Goals}</Text>
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
        {isEditMode ? 'Guardar cambios' : statusMode === 'scheduled' ? 'Guardar Partido Programado' : 'Guardar Partido Finalizado'}
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

      <VenuePickerModal
        visible={venuePickerVisible}
        onDismiss={() => setVenuePickerVisible(false)}
        onConfirm={venue => {
          setSelectedVenue(venue);
          setVenuePickerVisible(false);
        }}
        authUserId={auth().currentUser?.uid ?? null}
        initialVenue={selectedVenue}
      />

      <ScheduledPlayerPicker
        visible={pickerTeam !== null}
        members={allMembers}
        blockedIds={pickerBlockedIds}
        currentId={pickerCurrentId}
        teamLabel={`Equipo ${pickerTeam ?? 1}`}
        onSelect={selectPlayer}
        onDismiss={closePicker}
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
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
    colorsCardContent: {
      gap: 4,
    },
    colorButtonsRow: {
      gap: 0,
    },
    colorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    colorButtonDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    colorButtonDotBorder: {
      borderWidth: 1,
      borderColor: '#CFCFCF',
    },
    publicationContent: {
      gap: 10,
    },
    publicationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    positionChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    positionChip: {
      borderWidth: 1,
      borderColor: theme.colors.outline,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.colors.surface,
    },
    positionChipSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.secondaryContainer,
    },
    positionChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
    },
    positionChipTextSelected: {
      color: theme.colors.onSecondaryContainer,
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
