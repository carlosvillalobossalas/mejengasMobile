import React, { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View, TouchableOpacity, Image } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Surface,
  useTheme,
  Snackbar,
  Chip,
  ActivityIndicator,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';

import type { AppDrawerParamList } from '../navigation/types';
import { useTeamForm, type Position } from '../hooks/useTeamForm';
import TeamPlayerPickerModal from '../components/TeamPlayerPickerModal';

type TeamFormRouteProp = RouteProp<AppDrawerParamList, 'TeamForm'>;

// 12 preset colors — no external color-picker library needed
const PRESET_COLORS = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7',
  '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
  '#009688', '#4CAF50', '#FF9800', '#FF5722',
];

const POSITIONS: Position[] = ['POR', 'DEF', 'MED', 'DEL'];

export default function TeamFormScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const route = useRoute<TeamFormRouteProp>();
  const teamId = route.params?.teamId;
  const isEditing = Boolean(teamId);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const {
    teamName, setTeamName,
    teamColor, setTeamColor,
    selectedPlayers,
    freeMembers,
    photoPreviewUri,
    isLoading, isSaving, error,
    resetForm,
    pickPhoto, removePhoto,
    addPlayer, removePlayer, setPlayerPosition,
    save,
  } = useTeamForm(teamId);

  // Members not yet added to the current team, and not assigned to any other team
  const unselectedMembers = freeMembers.filter(
    m => !selectedPlayers.some(p => p.groupMemberId === m.id),
  );

  // Reset the form every time the screen gains focus in create mode.
  // Needed because the drawer keeps the screen mounted between visits,
  // so the hook's teamId-based effect never re-runs if teamId stays undefined.
  useFocusEffect(
    useCallback(() => {
      if (!teamId) resetForm();
    }, [teamId, resetForm]),
  );

  const handleSave = async () => {
    const success = await save();
    if (success) {
      setSnackbarMessage(isEditing ? 'Equipo actualizado' : 'Equipo creado exitosamente');
      setSnackbarVisible(true);
      setTimeout(() => navigation.navigate('ManageTeams'), 1000);
    }
    // On failure, `error` from the hook re-renders and shows the inline message below
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── Team photo ─────────────────────────────────────────────── */}
        <Text variant="labelLarge" style={styles.sectionLabel}>Foto del equipo</Text>
        {photoPreviewUri ? (
          <View style={styles.photoContainer}>
            <Image source={{ uri: photoPreviewUri }} style={styles.photoPreview} />
            <View style={styles.photoActions}>
              <Button
                compact
                mode="outlined"
                icon="image-edit"
                onPress={pickPhoto}
                style={styles.photoActionButton}
              >
                Cambiar
              </Button>
              <Button
                compact
                mode="outlined"
                icon="delete"
                onPress={removePhoto}
                textColor={theme.colors.error}
                style={styles.photoActionButton}
              >
                Eliminar
              </Button>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.photoPlaceholder} onPress={pickPhoto}>
            <Icon name="camera-plus" size={36} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyMedium" style={styles.photoPlaceholderText}>
              Agregar foto del equipo
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Team name ──────────────────────────────────────────────── */}
        <Text variant="labelLarge" style={styles.sectionLabel}>Nombre del equipo</Text>
        <TextInput
          mode="outlined"
          placeholder="Ej. Los Leones"
          value={teamName}
          onChangeText={setTeamName}
          style={styles.textInput}
          maxLength={40}
          autoCapitalize="words"
        />

        {/* ── Color picker ───────────────────────────────────────────── */}
        <Text variant="labelLarge" style={styles.sectionLabel}>Color del equipo</Text>
        <View style={styles.colorGrid}>
          {PRESET_COLORS.map(color => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorSwatch,
                { backgroundColor: color },
                teamColor === color && styles.colorSwatchSelected,
              ]}
              onPress={() => setTeamColor(color)}
            >
              {teamColor === color && (
                <Icon name="check" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.colorPreviewRow}>
          <View style={[styles.colorPreviewBadge, { backgroundColor: teamColor }]} />
          <Text variant="bodySmall" style={styles.colorHex}>{teamColor}</Text>
        </View>

        {/* ── Players ────────────────────────────────────────────────── */}
        <View style={styles.playersSectionHeader}>
          <Text variant="labelLarge" style={styles.sectionLabel}>
            Jugadores ({selectedPlayers.length})
          </Text>
          <Button
            mode="outlined"
            icon="account-plus"
            compact
            onPress={() => setPickerVisible(true)}
          >
            Agregar
          </Button>
        </View>

        {selectedPlayers.length === 0 && (
          <Surface style={styles.emptyPlayers} elevation={0}>
            <Icon name="account-off" size={32} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyMedium" style={styles.emptyPlayersText}>
              Agrega al menos un jugador
            </Text>
          </Surface>
        )}

        {selectedPlayers.map(player => (
          <Surface key={player.groupMemberId} style={styles.playerRow} elevation={1}>
            <Icon name="account" size={20} color={theme.colors.primary} />
            <Text variant="bodyMedium" style={styles.playerName} numberOfLines={1}>
              {player.displayName}
            </Text>
            <View style={styles.positionChips}>
              {POSITIONS.map(pos => (
                <TouchableOpacity
                  key={pos}
                  onPress={() => setPlayerPosition(player.groupMemberId, pos)}
                >
                  <Chip
                    compact
                    selected={player.defaultPosition === pos}
                    selectedColor='white'
                    style={{...styles.posChip, backgroundColor: theme.colors.secondary}}
                    textStyle={styles.posChipText}
                  >
                    {pos}
                  </Chip>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => removePlayer(player.groupMemberId)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={20} color={theme.colors.error} />
            </TouchableOpacity>
          </Surface>
        ))}

        {/* ── Validation error ───────────────────────────────────────── */}
        {error && (
          <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
        )}

        {/* ── Save button ────────────────────────────────────────────── */}
        <Button
          mode="contained"
          icon="content-save"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
        >
          {isEditing ? 'Guardar cambios' : 'Crear equipo'}
        </Button>
      </ScrollView>

      <TeamPlayerPickerModal
        visible={pickerVisible}
        members={unselectedMembers}
        onSelect={addPlayer}
        onClose={() => setPickerVisible(false)}
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {snackbarMessage}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
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
  },
  sectionLabel: {
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  textInput: {
    marginBottom: 4,
    backgroundColor: '#FFF',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: '#000',
  },
  colorPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  colorPreviewBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  colorHex: {
    color: '#555',
  },
  playersSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  emptyPlayers: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 12,
    gap: 8,
    backgroundColor: '#F0F0F0',
  },
  emptyPlayersText: {
    color: '#666',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    gap: 8,
    backgroundColor: '#FFF',
  },
  playerName: {
    flex: 1,
  },
  positionChips: {
    flexDirection: 'row',
    gap: 2,
  },
  posChip: {
    height: 26,
  },
  posChipText: {
    fontSize: 10,
    marginVertical: 0,
    color: '#FFF',
  },
  errorText: {
    color: '#B00020',
    marginTop: 12,
    textAlign: 'center',
  },
  saveButton: {
    marginTop: 12,
    borderRadius: 8,
  },
  saveButtonContent: {
    paddingVertical: 6,
  },
  photoContainer: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  photoPreview: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  photoActionButton: {
    borderRadius: 8,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#BDBDBD',
    backgroundColor: '#FAFAFA',
    marginBottom: 4,
  },
  photoPlaceholderText: {
    color: '#757575',
  },
});
