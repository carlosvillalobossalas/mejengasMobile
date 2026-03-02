import React, { useState } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
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
  Avatar,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import DatePicker from 'react-native-date-picker';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';

import ScheduledPlayerPicker from '../components/ScheduledPlayerPicker';
import {
  useAddScheduledMatch,
  type ScheduledPosition,
  type ScheduledSlot,
} from '../hooks/useAddScheduledMatch';
import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import { saveScheduledMatch } from '../services/matches/matchSaveService';
import type { AppDrawerParamList } from '../navigation/types';

const POSITIONS: ScheduledPosition[] = ['POR', 'DEF', 'MED', 'DEL'];

const POSITION_LABELS: Record<ScheduledPosition, string> = {
  POR: 'Portero',
  DEF: 'Defensa',
  MED: 'Mediocampo',
  DEL: 'Delantero',
};

type SlotMenuState = { team: 1 | 2; index: number } | null;

// ─── Slot row ────────────────────────────────────────────────────────────────

type SlotRowProps = {
  slot: ScheduledSlot;
  index: number;
  team: 1 | 2;
  member: GroupMemberV2 | undefined;
  menuOpen: boolean;
  onOpenPicker: () => void;
  onToggleMenu: () => void;
  onDismissMenu: () => void;
  onSetPosition: (pos: ScheduledPosition | null) => void;
  onClear: () => void;
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
  onClear,
  theme: t,
}: SlotRowProps) {
  return (
    <View>
      {index > 0 && <Divider />}
      <View style={styles(t).slotRow}>
        {/* Player selector */}
        <TouchableOpacity
          style={styles(t).playerButton}
          onPress={onOpenPicker}
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
                  style={{ backgroundColor: t.colors.primaryContainer }}
                  labelStyle={{ fontSize: 12 }}
                />
              )}
              <Text
                variant="bodyMedium"
                style={styles(t).playerName}
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
                color={t.colors.onSurfaceVariant}
              />
              <Text variant="bodySmall" style={styles(t).emptySlotText}>
                Jugador {index + 1}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Position menu */}
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
          {POSITIONS.map(pos => (
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

        {/* Clear slot */}
        {member ? (
          <TouchableOpacity
            onPress={onClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close-circle-outline" size={22} color={t.colors.error} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AddScheduledMatchScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const [openMenuFor, setOpenMenuFor] = useState<SlotMenuState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

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
    clearSlot,
    filledCount,
  } = useAddScheduledMatch();

  const activeTeamNum: 1 | 2 = activeTeam === '1' ? 1 : 2;
  const activeSlots = activeTeam === '1' ? team1Slots : team2Slots;
  const pickerBlockedIds = pickerTeam === 1 ? team2Ids : team1Ids;
  const pickerCurrentId =
    pickerTeam !== null && pickerSlotIndex !== null
      ? (pickerTeam === 1 ? team1Slots : team2Slots)[pickerSlotIndex]?.groupMemberId ?? null
      : null;

  const handleSave = async () => {
    if (isSaving || !selectedGroupId) return;
    setIsSaving(true);
    try {
      await saveScheduledMatch({
        date: matchDate,
        groupId: selectedGroupId,
        team1Players: team1Slots
          .filter((s): s is typeof s & { groupMemberId: string } => s.groupMemberId !== null)
          .map(s => ({ groupMemberId: s.groupMemberId, position: s.position })),
        team2Players: team2Slots
          .filter((s): s is typeof s & { groupMemberId: string } => s.groupMemberId !== null)
          .map(s => ({ groupMemberId: s.groupMemberId, position: s.position })),
      });
      setSnackbarMessage('Partido programado guardado');
      setSnackbarVisible(true);
      // Navigate back after the snackbar is visible
      setTimeout(() => navigation.navigate('Admin'), 1500);
    } catch (error) {
      console.error('AddScheduledMatch: error saving', error);
      setSnackbarMessage('Error al guardar el partido');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (d: Date): string =>
    d.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const formatTime = (d: Date): string =>
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  if (isLoadingMembers) {
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
      {/* ── Date & time ──────────────────────────────────────────────────── */}
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

      {/* ── Team tabs ────────────────────────────────────────────────────── */}
      <SegmentedButtons
        value={activeTeam}
        onValueChange={val => setActiveTeam(val as '1' | '2')}
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

      {/* ── Player slots ─────────────────────────────────────────────────── */}
      <Card style={styles(theme).card}>
        <Card.Content style={styles(theme).slotsContent}>
          {activeSlots.map((slot, index) => (
            <SlotRow
              key={index}
              slot={slot}
              index={index}
              team={activeTeamNum}
              member={allMembers.find(m => m.id === slot.groupMemberId)}
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
              onSetPosition={pos => setPosition(activeTeamNum, index, pos)}
              onClear={() => clearSlot(activeTeamNum, index)}
              theme={theme}
            />
          ))}
        </Card.Content>
      </Card>

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <Button
        mode="contained"
        onPress={handleSave}
        loading={isSaving}
        disabled={isSaving}
        style={styles(theme).saveButton}
        contentStyle={styles(theme).saveButtonContent}
        icon="calendar-check"
      >
        Guardar Partido Programado
      </Button>

      {/* ── Date picker ──────────────────────────────────────────────────── */}
      <DatePicker
        modal
        open={showDatePicker}
        date={matchDate}
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

      {/* ── Player picker ────────────────────────────────────────────────── */}
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F5F5F5',
    },
    content: {
      padding: 16,
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
      paddingHorizontal: 12,
      gap: 10,
      minHeight: 54,
    },
    playerButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
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
    saveButton: {
      borderRadius: 8,
    },
    saveButtonContent: {
      paddingVertical: 6,
    },
  });
