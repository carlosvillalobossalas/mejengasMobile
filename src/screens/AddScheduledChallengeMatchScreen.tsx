import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  useTheme,
  Divider,
  Menu,
  Snackbar,
  MD3Theme,
  Card,
  Avatar,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import ScheduledPlayerPicker from '../components/ScheduledPlayerPicker';
import DatePicker from 'react-native-date-picker';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';

import { useAppSelector } from '../app/hooks';
import {
  getGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import { getGroupsByIds } from '../repositories/groups/groupsRepository';
import {
  saveScheduledChallengeMatch,
  type ScheduledChallengePlayerToSave,
} from '../services/matches/challengeMatchSaveService';
import type { AppDrawerParamList } from '../navigation/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Position = 'POR' | 'DEF' | 'MED' | 'DEL';

type Slot = {
  groupMemberId: string | null;
  position: Position;
  isSub: boolean;
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

const sortSlots = <T extends { position: Position; isSub: boolean }>(arr: T[]): T[] => {
  const starters = arr.filter(p => !p.isSub).sort(
    (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position],
  );
  const subs = arr.filter(p => p.isSub).sort(
    (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position],
  );
  return [...starters, ...subs];
};

const DEFAULT_FORMATION: Record<number, Position[]> = {
  5:  ['POR', 'DEF', 'DEF', 'DEL', 'DEL'],
  7:  ['POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'DEL'],
  11: ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL'],
};

const getDefaultPosition = (index: number, total: number): Position => {
  const slots = DEFAULT_FORMATION[total];
  if (slots && index < slots.length) return slots[index];
  return index === 0 ? 'POR' : 'DEF';
};

const createSlot = (index: number, total: number): Slot => ({
  groupMemberId: null,
  position: getDefaultPosition(index, total),
  isSub: false,
});

const createSubSlot = (): Slot => ({
  groupMemberId: null,
  position: 'DEF',
  isSub: true,
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AddScheduledChallengeMatchScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [allMembers, setAllMembers] = useState<GroupMemberV2[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const [matchDate, setMatchDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [openMenuFor, setOpenMenuFor] = useState<number | null>(null);
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!selectedGroupId) return;
      setIsLoadingMembers(true);
      try {
        const [members, groupsMap] = await Promise.all([
          getGroupMembersV2ByGroupId(selectedGroupId),
          getGroupsByIds([selectedGroupId]),
        ]);
        const group = groupsMap.get(selectedGroupId);
        const count = PLAYERS_BY_TYPE[group?.type ?? 'futbol_7'] ?? 7;
        setAllMembers(members);
        setSlots(Array.from({ length: count }, (_, i) => createSlot(i, count)));
      } catch (err) {
        console.error('AddScheduledChallengeMatchScreen: error loading', err);
      } finally {
        setIsLoadingMembers(false);
      }
    };
    load();
  }, [selectedGroupId]);

  const assignedIds = useMemo(() => {
    const ids = new Set<string>();
    slots.forEach(s => s.groupMemberId && ids.add(s.groupMemberId));
    return ids;
  }, [slots]);

  const handlePlayerSelect = useCallback(
    (member: GroupMemberV2) => {
      if (pickerSlotIndex === null) return;
      setSlots(prev => {
        const updated = [...prev];
        updated[pickerSlotIndex] = { ...updated[pickerSlotIndex], groupMemberId: member.id };
        return updated;
      });
      setIsPickerVisible(false);
      setPickerSlotIndex(null);
    },
    [pickerSlotIndex],
  );

  const handleSetPosition = useCallback((index: number, pos: Position) => {
    setSlots(prev => sortSlots(prev.map((s, i) => i === index ? { ...s, position: pos } : s)));
  }, []);

  const handleClearSlot = useCallback((index: number) => {
    setSlots(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], groupMemberId: null };
      return updated;
    });
  }, []);

  const handleAddSubSlot = useCallback(() => {
    setSlots(prev => [...prev, createSubSlot()]);
  }, []);

  const handleRemoveSubSlot = useCallback((index: number) => {
    setSlots(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async () => {
    if (isSaving || !selectedGroupId) return;

    if (!opponentName.trim()) {
      setSnackbarMessage('Por favor ingresa el nombre del rival');
      setSnackbarVisible(true);
      return;
    }

    setIsSaving(true);
    try {
      const filledSlots: ScheduledChallengePlayerToSave[] = slots
        .map(s => ({ groupMemberId: s.groupMemberId, position: s.position, isSub: s.isSub }));

      await saveScheduledChallengeMatch({
        date: matchDate,
        groupId: selectedGroupId,
        players: filledSlots,
        opponentName,
      });

      setSnackbarMessage('Partido programado guardado');
      setSnackbarVisible(true);
      setTimeout(() => navigation.navigate('Admin'), 1500);
    } catch (err) {
      console.error('AddScheduledChallengeMatchScreen: error saving', err);
      setSnackbarMessage('Error al guardar el partido');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingMembers) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>
          Cargando jugadores...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles(theme).container}>
      <ScrollView contentContainerStyle={styles(theme).scrollContent}>
        {/* Date */}
        <TouchableOpacity onPress={() => setShowDatePicker(true)}>
          <Card style={styles(theme).card}>
            <Card.Content style={styles(theme).dateCardContent}>
              <View style={styles(theme).dateIconBox}>
                <Icon name="calendar-clock" size={26} color="#FFF" />
              </View>
              <View style={styles(theme).dateInfo}>
                <Text style={styles(theme).dateLabel}>Fecha del partido</Text>
                <Text style={styles(theme).dateValue}>
                  {matchDate.toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
                <Text style={styles(theme).timeValue}>
                  {matchDate.toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Icon name="pencil-outline" size={20} color={theme.colors.primary} />
            </Card.Content>
          </Card>
        </TouchableOpacity>

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

        {/* Opponent */}
        <Card style={styles(theme).card}>
          <Card.Content style={styles(theme).dateCardContent}>
            <View style={[styles(theme).dateIconBox, { backgroundColor: '#FF7043' }]}>
              <Icon name="shield-outline" size={26} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                mode="flat"
                label="Rival (opcional)"
                value={opponentName}
                onChangeText={setOpponentName}
                placeholder="Ej: Los Piratas"
                style={styles(theme).rivalInput}
                underlineStyle={{ display: 'none' }}
              />
            </View>
          </Card.Content>
        </Card>

        {/* Player slots */}
        <Card style={styles(theme).card}>
          <Card.Content style={styles(theme).slotsContent}>
            {slots.map((slot, index) => {
              const member = allMembers.find(m => m.id === slot.groupMemberId);
              return (
                <React.Fragment key={index}>
                  {index > 0 && <Divider />}
                  <View style={[styles(theme).slotRow, slot.isSub && styles(theme).subSlotRow]}>
                    {/* Player button */}
                    <TouchableOpacity
                      style={styles(theme).playerButton}
                      onPress={() => {
                        setPickerSlotIndex(index);
                        setIsPickerVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      {member ? (
                        <>
                          {member.photoUrl ? (
                            <Avatar.Image size={34} source={{ uri: member.photoUrl }} />
                          ) : (
                            <Avatar.Text
                              size={34}
                              label={member.displayName.substring(0, 2).toUpperCase()}
                              style={{ backgroundColor: theme.colors.primaryContainer }}
                              labelStyle={{ fontSize: 12 }}
                            />
                          )}
                          <Text
                            variant="bodyMedium"
                            style={styles(theme).playerName}
                            numberOfLines={1}
                          >
                            {member.displayName}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Icon
                            name="account-plus-outline"
                            size={22}
                            color={theme.colors.onSurfaceVariant}
                          />
                          <Text variant="bodySmall" style={styles(theme).emptySlotText}>
                            {slot.isSub ? 'Suplente' : `Jugador ${index + 1}`}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Position chip */}
                    {slot.isSub ? (
                      <View style={{ alignItems: 'center' }}>
                        <Menu
                          visible={openMenuFor === index}
                          onDismiss={() => setOpenMenuFor(null)}
                          anchor={
                            <TouchableOpacity
                              style={[styles(theme).posChip, styles(theme).subChip]}
                              onPress={() => setOpenMenuFor(index)}
                            >
                              <Text style={[styles(theme).posChipText, { color: '#2E7D32' }]}>
                                {slot.position}
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
                                handleSetPosition(index, pos);
                                setOpenMenuFor(null);
                              }}
                            />
                          ))}
                        </Menu>
                        <Text style={{ fontSize: 9, color: '#2E7D32', fontWeight: '700', marginTop: 2 }}>
                          SUP
                        </Text>
                      </View>
                    ) : index === 0 ? (
                      <View style={[styles(theme).posChip, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
                        <Text style={[styles(theme).posChipText, { color: '#FFF' }]}>POR</Text>
                      </View>
                    ) : (
                      <Menu
                        visible={openMenuFor === index}
                        onDismiss={() => setOpenMenuFor(null)}
                        anchor={
                          <TouchableOpacity
                            style={[
                              styles(theme).posChip,
                              member
                                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                                : { opacity: 0.4 },
                            ]}
                            onPress={() => setOpenMenuFor(index)}
                            disabled={!member}
                          >
                            <Text style={[styles(theme).posChipText, { color: member ? '#FFF' : theme.colors.onSurfaceVariant }]}>
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
                              handleSetPosition(index, pos);
                              setOpenMenuFor(null);
                            }}
                          />
                        ))}
                      </Menu>
                    )}

                    {/* Clear / Delete sub */}
                    {slot.isSub ? (
                      <TouchableOpacity
                        onPress={() => handleRemoveSubSlot(index)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon name="delete-outline" size={22} color={theme.colors.error} />
                      </TouchableOpacity>
                    ) : slot.groupMemberId ? (
                      <TouchableOpacity
                        onPress={() => handleClearSlot(index)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon name="close-circle-outline" size={22} color={theme.colors.error} />
                      </TouchableOpacity>
                    ) : (
                      <View style={{ width: 22 }} />
                    )}
                  </View>
                </React.Fragment>
              );
            })}
          </Card.Content>
        </Card>

        {/* Add substitute */}
        <TouchableOpacity
          style={styles(theme).addSubButton}
          onPress={handleAddSubSlot}
          activeOpacity={0.7}
        >
          <Icon name="plus-circle-outline" size={20} color="#2E7D32" />
          <Text style={styles(theme).addSubText}>Agregar suplente</Text>
        </TouchableOpacity>

        {/* Save */}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          style={styles(theme).saveButton}
          contentStyle={styles(theme).saveButtonContent}
          icon="calendar-check"
        >
          Programar Partido
        </Button>
      </ScrollView>

      {/* Player picker */}
      <ScheduledPlayerPicker
        visible={isPickerVisible}
        members={allMembers}
        blockedIds={new Set([...assignedIds].filter(id => id !== (pickerSlotIndex !== null ? slots[pickerSlotIndex]?.groupMemberId : null)))}
        currentId={pickerSlotIndex !== null ? (slots[pickerSlotIndex]?.groupMemberId ?? null) : null}
        teamLabel="Seleccionar Jugador"
        onSelect={memberId => {
          if (pickerSlotIndex === null) return;
          if (memberId === null) {
            handleClearSlot(pickerSlotIndex);
            setIsPickerVisible(false);
            setPickerSlotIndex(null);
          } else {
            const m = allMembers.find(mem => mem.id === memberId);
            if (m) handlePlayerSelect(m);
          }
        }}
        onDismiss={() => {
          setIsPickerVisible(false);
          setPickerSlotIndex(null);
        }}
      />

      <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={3000}>
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#666',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    borderRadius: 12,
    backgroundColor: '#FFF',
  },
  // Date card
  dateCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  dateIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInfo: {
    flex: 1,
    gap: 2,
  },
  dateLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.onSurface,
    textTransform: 'capitalize',
  },
  timeValue: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  // Rival input
  rivalInput: {
    backgroundColor: 'transparent',
  },
  // Slots
  slotsContent: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  subSlotRow: {
    backgroundColor: '#F1F8E9',
  },
  subChip: {
    backgroundColor: '#C8E6C9',
    borderColor: '#C8E6C9',
  },
  addSubButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  addSubText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600' as const,
  },
  playerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playerName: {
    flex: 1,
    color: theme.colors.onSurface,
  },
  emptySlotText: {
    flex: 1,
    color: theme.colors.onSurfaceVariant,
  },
  posChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    minWidth: 44,
    alignItems: 'center',
  },
  posChipText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Save
  saveButton: {
    borderRadius: 8,
  },
  saveButtonContent: {
    paddingVertical: 6,
  },
});
