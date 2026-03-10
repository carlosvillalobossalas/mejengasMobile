import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Button,
  Surface,
  ActivityIndicator,
  useTheme,
  Divider,
  Snackbar,
  Switch,
  TextInput,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import DatePicker from 'react-native-date-picker';
import { useFocusEffect } from '@react-navigation/native';

import { useAddMatchTeams } from '../hooks/useAddMatchTeams';
import type { MatchPosition } from '../hooks/useAddMatchTeams';
import MatchTeamPickerModal from '../components/MatchTeamPickerModal';
import MatchPlayerStatsRow from '../components/MatchPlayerStatsRow';
import MatchPlayerSwapModal from '../components/MatchPlayerSwapModal';
import type { MatchPublicationInput } from '../types/matchPublication';

export default function AddMatchTeamsScreen() {
  const theme = useTheme();
  const [picker1Visible, setPicker1Visible] = useState(false);
  const [picker2Visible, setPicker2Visible] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Tracks which slot the user wants to swap: { team: 1|2, index: number }
  const [swapState, setSwapState] = useState<{ team: 1 | 2; index: number } | null>(null);
  // Tracks when the user wants to add a sub for a team
  const [addSubState, setAddSubState] = useState<{ team: 1 | 2 } | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [neededPlayers, setNeededPlayers] = useState('1');
  const [allowAnyPosition, setAllowAnyPosition] = useState(true);
  const [preferredPositions, setPreferredPositions] = useState<MatchPosition[]>([]);
  const [publicationCity, setPublicationCity] = useState('');
  const [publicationNotes, setPublicationNotes] = useState('');

  const {
    isLoading,
    error,
    selectedTeam1,
    selectedTeam2,
    availableForTeam1,
    availableForTeam2,
    team1Players,
    team2Players,
    team1FullRoster,
    team2FullRoster,
    groupMembers,
    goalsTeam1,
    goalsTeam2,
    date,
    setDate,
    selectTeam1,
    selectTeam2,
    updateTeam1Player,
    updateTeam2Player,
    swapTeam1Player,
    swapTeam2Player,
    addTeam1Sub,
    addTeam2Sub,
    resetForm,
    isSaving,
    saveError,
    handleSave,
  } = useAddMatchTeams();

  // Snackbar feedback after save attempt
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; isError: boolean }>({
    visible: false,
    message: '',
    isError: false,
  });
  const wasSavingRef = useRef(false);

  useEffect(() => {
    // Detect the isSaving true→false transition to show feedback
    if (wasSavingRef.current && !isSaving) {
      if (saveError) {
        setSnackbar({ visible: true, message: saveError, isError: true });
      } else {
        setSnackbar({ visible: true, message: '¡Partido guardado correctamente!', isError: false });
      }
    }
    wasSavingRef.current = isSaving;
  }, [isSaving, saveError]);

  // Reset form state every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      resetForm();
    }, [resetForm]),
  );

  // Players from the full roster available to swap into the active slot
  const swapCandidates = useMemo(() => {
    if (!swapState) return [];
    const fullRoster = swapState.team === 1 ? team1FullRoster : team2FullRoster;
    const currentPlayers = swapState.team === 1 ? team1Players : team2Players;
    return fullRoster
      .filter(
        tp =>
          !currentPlayers.some(
            (p, i) => i !== swapState.index && p.groupMemberId === tp.groupMemberId,
          ),
      )
      .map(tp => ({
        groupMemberId: tp.groupMemberId,
        displayName:
          groupMembers.find(m => m.id === tp.groupMemberId)?.displayName ??
          tp.groupMemberId,
      }));
  }, [swapState, team1FullRoster, team2FullRoster, team1Players, team2Players, groupMembers]);

  // Bench players available to enter as substitutes (not yet in any lineup slot)
  const subCandidates = useMemo(() => {
    if (!addSubState) return [];
    const fullRoster = addSubState.team === 1 ? team1FullRoster : team2FullRoster;
    const currentPlayers = addSubState.team === 1 ? team1Players : team2Players;
    return fullRoster
      .filter(tp => !currentPlayers.some(p => p.groupMemberId === tp.groupMemberId))
      .map(tp => ({
        groupMemberId: tp.groupMemberId,
        displayName:
          groupMembers.find(m => m.id === tp.groupMemberId)?.displayName ??
          tp.groupMemberId,
      }));
  }, [addSubState, team1FullRoster, team2FullRoster, team1Players, team2Players, groupMembers]);

  const closeModal = () => {
    setSwapState(null);
    setAddSubState(null);
  };

  const togglePreferredPosition = (position: MatchPosition) => {
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
      city: publicationCity.trim() ? publicationCity.trim() : null,
      notes: publicationNotes.trim() ? publicationNotes.trim() : null,
      publishedByUserId: null,
    };
  };

  const handleModalSelect = (id: string) => {
    if (swapState) {
      if (swapState.team === 1) swapTeam1Player(swapState.index, id);
      else swapTeam2Player(swapState.index, id);
    } else if (addSubState) {
      if (addSubState.team === 1) addTeam1Sub(id);
      else addTeam2Sub(id);
    }
    closeModal();
  };

  const POSITION_ORDER: Record<MatchPosition, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

  // Sort players: starters first (by position), then subs (by position)
  const sortedTeam1 = useMemo(
    () =>
      team1Players
        .map((player, idx) => ({ player, idx }))
        .sort((a, b) => {
          if (a.player.isSub !== b.player.isSub) return a.player.isSub ? 1 : -1;
          return POSITION_ORDER[a.player.position] - POSITION_ORDER[b.player.position];
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team1Players],
  );

  const sortedTeam2 = useMemo(
    () =>
      team2Players
        .map((player, idx) => ({ player, idx }))
        .sort((a, b) => {
          if (a.player.isSub !== b.player.isSub) return a.player.isSub ? 1 : -1;
          return POSITION_ORDER[a.player.position] - POSITION_ORDER[b.player.position];
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team2Players],
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text
          variant="bodyMedium"
          style={[styles.centerText, { color: theme.colors.error }]}
        >
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Team selectors */}
      <Text variant="labelLarge" style={styles.sectionLabel}>Equipos</Text>
      <Surface style={styles.card} elevation={1}>
        <Button
          mode="outlined"
          icon="shield"
          onPress={() => setPicker1Visible(true)}
          style={[styles.teamBtn, selectedTeam1 ? { borderColor: selectedTeam1.color } : undefined]}
          labelStyle={selectedTeam1 ? { color: selectedTeam1.color } : undefined}
          contentStyle={styles.teamBtnContent}
        >
          {selectedTeam1 ? selectedTeam1.name : 'Seleccionar Equipo 1'}
        </Button>

        <Text variant="titleLarge" style={styles.vsLabel}>VS</Text>

        <Button
          mode="outlined"
          icon="shield"
          onPress={() => setPicker2Visible(true)}
          style={[styles.teamBtn, selectedTeam2 ? { borderColor: selectedTeam2.color } : undefined]}
          labelStyle={selectedTeam2 ? { color: selectedTeam2.color } : undefined}
          contentStyle={styles.teamBtnContent}
        >
          {selectedTeam2 ? selectedTeam2.name : 'Seleccionar Equipo 2'}
        </Button>
      </Surface>

      {/* Team 1 players */}
      {team1Players.length > 0 && (
        <>
          <Text variant="labelLarge" style={styles.sectionLabel}>
            Jugadores — {selectedTeam1?.name}
          </Text>
          {sortedTeam1.map(({ player, idx }) => (
            <MatchPlayerStatsRow
              key={player.groupMemberId}
              player={player}
              onUpdate={updates => updateTeam1Player(idx, updates)}
              onSwapRequest={() => setSwapState({ team: 1, index: idx })}
              positionLocked={!player.isSub && player.position === 'POR' && sortedTeam1.findIndex(e => !e.player.isSub) === sortedTeam1.findIndex(e => e.idx === idx)}
              allowGoalkeeper={player.isSub}
            />
          ))}
          {/* Show only when the roster has bench players not yet in the lineup */}
          {team1FullRoster.some(tp => !team1Players.some(p => p.groupMemberId === tp.groupMemberId)) && (
            <Button
              mode="outlined"
              icon="account-plus"
              onPress={() => setAddSubState({ team: 1 })}
              style={styles.addSubBtn}
            >
              Agregar Suplente
            </Button>
          )}
        </>
      )}

      {/* Team 2 players */}
      {team2Players.length > 0 && (
        <>
          <Text variant="labelLarge" style={styles.sectionLabel}>
            Jugadores — {selectedTeam2?.name}
          </Text>
          {sortedTeam2.map(({ player, idx }) => (
            <MatchPlayerStatsRow
              key={player.groupMemberId}
              player={player}
              onUpdate={updates => updateTeam2Player(idx, updates)}
              onSwapRequest={() => setSwapState({ team: 2, index: idx })}
              positionLocked={!player.isSub && player.position === 'POR' && sortedTeam2.findIndex(e => !e.player.isSub) === sortedTeam2.findIndex(e => e.idx === idx)}
              allowGoalkeeper={player.isSub}
            />
          ))}
          {/* Show only when the roster has bench players not yet in the lineup */}
          {team2FullRoster.some(tp => !team2Players.some(p => p.groupMemberId === tp.groupMemberId)) && (
            <Button
              mode="outlined"
              icon="account-plus"
              onPress={() => setAddSubState({ team: 2 })}
              style={styles.addSubBtn}
            >
              Agregar Suplente
            </Button>
          )}
        </>
      )}

      {/* Resultado y fecha — score is read-only, computed from player stats */}
      <Text variant="labelLarge" style={styles.sectionLabel}>Resultado y fecha</Text>
      <Surface style={styles.card} elevation={1}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreField}>
            <Text variant="labelSmall" style={styles.scoreTeamLabel} numberOfLines={1}>
              {selectedTeam1?.name ?? 'Equipo 1'}
            </Text>
            <Text variant="displaySmall" style={styles.scoreValue}>
              {goalsTeam1}
            </Text>
          </View>

          <Text variant="headlineMedium" style={styles.scoreSeparator}>
            {' — '}
          </Text>

          <View style={styles.scoreField}>
            <Text variant="labelSmall" style={styles.scoreTeamLabel} numberOfLines={1}>
              {selectedTeam2?.name ?? 'Equipo 2'}
            </Text>
            <Text variant="displaySmall" style={styles.scoreValue}>
              {goalsTeam2}
            </Text>
          </View>
        </View>

        <Divider style={styles.divider} />

        <TouchableOpacity style={styles.dateRow} onPress={() => setDatePickerOpen(true)}>
          <Icon name="calendar" size={18} color={theme.colors.primary} />
          <Text variant="bodyMedium" style={styles.dateText}>
            {`${date.toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}, ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}
          </Text>
          <Icon name="pencil" size={16} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
      </Surface>

      <Text variant="labelLarge" style={styles.sectionLabel}>Publicación</Text>
      <Surface style={styles.card} elevation={1}>
        <View style={styles.publicationRow}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" style={styles.publicationTitle}>Publicar en feed abierto</Text>
            <Text
              variant="bodySmall"
              style={[styles.publicationSubtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Permite recibir postulaciones de jugadores externos
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

            <View style={styles.publicationRow}>
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
              <View style={styles.positionChipsWrap}>
                {(['POR', 'DEF', 'MED', 'DEL'] as MatchPosition[]).map(position => {
                  const isSelected = preferredPositions.includes(position);
                  return (
                    <TouchableOpacity
                      key={`teams-publication-pos-${position}`}
                      onPress={() => togglePreferredPosition(position)}
                      style={[
                        styles.positionChip,
                        {
                          borderColor: isSelected ? theme.colors.primary : theme.colors.outline,
                          backgroundColor: isSelected ? theme.colors.secondaryContainer : theme.colors.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.positionChipText,
                          {
                            color: isSelected
                              ? theme.colors.onSecondaryContainer
                              : theme.colors.onSurfaceVariant,
                          },
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
              label="Ciudad o zona"
              value={publicationCity}
              onChangeText={setPublicationCity}
              dense
            />

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
      </Surface>

      {/* Save button */}
      <Button
        mode="contained"
        icon="content-save"
        onPress={() => {
          void handleSave(buildPublicationInput());
        }}
        disabled={!selectedTeam1 || !selectedTeam2 || isSaving}
        loading={isSaving}
        style={styles.saveButton}
        contentStyle={styles.saveButtonContent}
      >
        {isSaving ? 'Guardando...' : 'Guardar Partido'}
      </Button>

      {/* Modals */}
      <MatchTeamPickerModal
        visible={picker1Visible}
        teams={availableForTeam1}
        onSelect={selectTeam1}
        onClose={() => setPicker1Visible(false)}
      />
      <MatchTeamPickerModal
        visible={picker2Visible}
        teams={availableForTeam2}
        onSelect={selectTeam2}
        onClose={() => setPicker2Visible(false)}
      />
      <DatePicker
        modal
        open={datePickerOpen}
        date={date}
        mode="datetime"
        locale="es"
        title="Fecha del partido"
        confirmText="Confirmar"
        cancelText="Cancelar"
        onConfirm={d => {
          setDatePickerOpen(false);
          setDate(d);
        }}
        onCancel={() => setDatePickerOpen(false)}
      />
      <MatchPlayerSwapModal
        visible={swapState !== null || addSubState !== null}
        candidates={swapState ? swapCandidates : subCandidates}
        onSelect={handleModalSelect}
        onClose={closeModal}
      />
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar(s => ({ ...s, visible: false }))}
        duration={3500}
        style={snackbar.isError ? styles.snackbarError : styles.snackbarSuccess}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  centerText: {
    textAlign: 'center',
  },
  sectionLabel: {
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
    backgroundColor: '#FFF',
    marginBottom: 4,
  },
  teamBtn: {
    borderRadius: 8,
  },
  teamBtnContent: {
    justifyContent: 'flex-start',
  },
  vsLabel: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: '#888',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
  },
  scoreField: {
    alignItems: 'center',
    flex: 1,
  },
  scoreTeamLabel: {
    color: '#888',
    marginBottom: 4,
    textAlign: 'center',
  },
  scoreValue: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  scoreSeparator: {
    color: '#888',
  },
  divider: {
    marginVertical: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  dateText: {
    flex: 1,
  },
  saveButton: {
    marginTop: 24,
    borderRadius: 8,
  },
  saveButtonContent: {
    paddingVertical: 6,
  },
  addSubBtn: {
    marginTop: 4,
    borderRadius: 8,
  },
  publicationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  publicationTitle: {
    fontWeight: '600',
  },
  publicationSubtitle: {
    marginTop: 2,
  },
  positionChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  positionChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  positionChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  snackbarSuccess: {
    backgroundColor: '#388E3C',
  },
  snackbarError: {
    backgroundColor: '#D32F2F',
  },
});
