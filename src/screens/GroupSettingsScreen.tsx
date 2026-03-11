import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Card, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { launchImageLibrary } from 'react-native-image-picker';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { useAppDispatch, useAppSelector } from '../app/hooks';
import { updateGroupPhoto } from '../features/groups/groupsSlice';
import {
  updateGroupSettings,
} from '../repositories/groups/groupSettingsRepository';
import { updateGroupPhotoUrl } from '../repositories/groups/groupsRepository';
import { uploadGroupPhoto } from '../services/storage/groupPhotoService';

const MATCH_TYPE_LABELS: Record<string, string> = {
  futbol_5: 'Fútbol 5',
  futbol_7: 'Fútbol 7',
  futbol_11: 'Fútbol 11',
};

const getGroupModeLabel = (hasFixedTeams: boolean, isChallengeMode: boolean): string => {
  if (isChallengeMode) return 'Retos';
  if (hasFixedTeams) return 'Por equipos';
  return 'Libre';
};

const TEAM_COLOR_OPTIONS = [
  '#000000',
  '#FFFFFF',
  '#1E3A8A',
  '#2563EB',
  '#0F766E',
  '#059669',
  '#166534',
  '#F59E0B',
  '#EA580C',
  '#B91C1C',
  '#7C3AED',
  '#4B5563',
];

export default function GroupSettingsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);

  const selectedGroup = useMemo(
    () => groups.find(group => group.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  const [name, setName] = useState(selectedGroup?.name ?? '');
  const [defaultTeam1Color, setDefaultTeam1Color] = useState(selectedGroup?.defaultTeam1Color ?? '#000000');
  const [defaultTeam2Color, setDefaultTeam2Color] = useState(selectedGroup?.defaultTeam2Color ?? '#FFFFFF');
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!selectedGroup) return;
    setName(selectedGroup.name ?? '');
    setDefaultTeam1Color(selectedGroup.defaultTeam1Color ?? '#000000');
    setDefaultTeam2Color(selectedGroup.defaultTeam2Color ?? '#FFFFFF');
    setLocalPhotoUri(null); // reset local pick when group changes
  }, [selectedGroup]);

  const canEditTeamDefaults = Boolean(selectedGroup && !selectedGroup.hasFixedTeams && !selectedGroup.isChallengeMode);

  const pickPhoto = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 800,
      maxHeight: 800,
    });
    if (!result.didCancel && result.assets?.length) {
      const uri = result.assets[0].uri;
      if (uri) {
        const normalized =
          Platform.OS === 'ios' && !uri.startsWith('file://') ? `file://${uri}` : uri;
        setLocalPhotoUri(normalized);
      }
    }
  }, []);

  const isNameValid = name.trim().length > 0;

  const canSave = isNameValid;

  const handleSave = async () => {
    if (!selectedGroup?.id || !canSave) return;

    setIsSaving(true);
    try {
      // Upload new photo if one was picked
      if (localPhotoUri) {
        const url = await uploadGroupPhoto(selectedGroup.id, localPhotoUri);
        await updateGroupPhotoUrl(selectedGroup.id, url);
        // Update the Redux store immediately so the UI reflects the new photo
        dispatch(updateGroupPhoto({ groupId: selectedGroup.id, photoUrl: url }));
        setLocalPhotoUri(null);
      }

      await updateGroupSettings({
        groupId: selectedGroup.id,
        name,
        defaultTeam1Color: canEditTeamDefaults
          ? defaultTeam1Color
          : selectedGroup.defaultTeam1Color,
        defaultTeam2Color: canEditTeamDefaults
          ? defaultTeam2Color
          : selectedGroup.defaultTeam2Color,
      });
      Alert.alert('Configuración guardada', 'Los cambios del grupo se guardaron correctamente.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la configuración.';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };


  if (!selectedGroup) {
    return (
      <View style={styles.centerContainer}>
        <Text variant="titleMedium">No hay grupo seleccionado</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={[styles.card, { backgroundColor: theme.colors.onPrimary }] }>
        <Card.Content>

          {/* Avatar */}
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={pickPhoto}
            disabled={isSaving}
            activeOpacity={0.7}
          >
            {localPhotoUri ? (
              <Avatar.Image size={80} source={{ uri: localPhotoUri }} />
            ) : selectedGroup.photoUrl ? (
              <Avatar.Image size={80} source={{ uri: selectedGroup.photoUrl }} />
            ) : (
              <Avatar.Text
                size={80}
                label={selectedGroup.name.charAt(0).toUpperCase()}
                style={{ backgroundColor: theme.colors.primaryContainer }}
                color={theme.colors.primary}
              />
            )}
            <View style={[styles.avatarCameraIcon, isSaving && styles.avatarCameraIconUploading]}>
              {isSaving ? (
                <ActivityIndicator size={16} color="#FFFFFF" />
              ) : (
                <Icon name="camera" size={16} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>
          {localPhotoUri && (
            <TouchableOpacity onPress={() => setLocalPhotoUri(null)} style={styles.removePhotoButton}>
              <Text variant="labelSmall" style={{ color: theme.colors.error }}>Eliminar foto nueva</Text>
            </TouchableOpacity>
          )}

          {/* Read-only group info */}
          <View style={styles.infoRow}>
            <View style={styles.infoChip}>
              <Icon name="soccer" size={14} color={theme.colors.primary} />
              <Text variant="labelMedium" style={[styles.infoChipText, { color: theme.colors.primary }]}>
                {MATCH_TYPE_LABELS[selectedGroup.type] ?? selectedGroup.type}
              </Text>
            </View>
            <View style={styles.infoChip}>
              <Icon name="account-group" size={14} color={theme.colors.secondary} />
              <Text variant="labelMedium" style={[styles.infoChipText, { color: theme.colors.secondary }]}>
                {getGroupModeLabel(selectedGroup.hasFixedTeams, selectedGroup.isChallengeMode)}
              </Text>
            </View>
          </View>

          <TextInput
            mode="outlined"
            label="Nombre del grupo"
            value={name}
            onChangeText={setName}
            disabled={isSaving}
            style={styles.input}
          />
          <HelperText type="error" visible={!isNameValid}>
            El nombre del grupo es obligatorio.
          </HelperText>

          <Text variant="titleMedium" style={styles.sectionTitle}>Colores por defecto</Text>

          <Text variant="labelLarge" style={styles.pickerLabel}>Equipo 1</Text>
          <View style={styles.colorGrid}>
            {TEAM_COLOR_OPTIONS.map(color => (
              <TouchableOpacity
                key={`team1-${color}`}
                activeOpacity={0.75}
                disabled={!canEditTeamDefaults || isSaving}
                onPress={() => setDefaultTeam1Color(color)}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  defaultTeam1Color === color && styles.selectedColorOption,
                  color === '#FFFFFF' && styles.whiteColorBorder,
                ]}
              />
            ))}
          </View>

          <Text variant="labelLarge" style={styles.pickerLabel}>Equipo 2</Text>
          <View style={styles.colorGrid}>
            {TEAM_COLOR_OPTIONS.map(color => (
              <TouchableOpacity
                key={`team2-${color}`}
                activeOpacity={0.75}
                disabled={!canEditTeamDefaults || isSaving}
                onPress={() => setDefaultTeam2Color(color)}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  defaultTeam2Color === color && styles.selectedColorOption,
                  color === '#FFFFFF' && styles.whiteColorBorder,
                ]}
              />
            ))}
          </View>

          <View style={styles.previewRow}>
            <View style={[styles.colorSwatch, { backgroundColor: defaultTeam1Color }]} />
            <Text>Equipo 1</Text>
            <View style={[styles.colorSwatch, { backgroundColor: defaultTeam2Color, borderColor: '#CCC', borderWidth: defaultTeam2Color === '#FFFFFF' ? 1 : 0 }]} />
            <Text>Equipo 2</Text>
          </View>

          {!canEditTeamDefaults && (
            <HelperText type="info" visible>
              Este grupo no permite editar colores por defecto porque usa equipos fijos o modo challenge.
            </HelperText>
          )}

          <Button
            mode="contained"
            onPress={handleSave}
            disabled={!canSave || isSaving}
            loading={isSaving}
            style={styles.saveButton}
          >
            Guardar cambios
          </Button>
        </Card.Content>
      </Card>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 12,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  avatarCameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#2196F3',
    borderRadius: 18,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarCameraIconUploading: {
    backgroundColor: '#90CAF9',
  },
  removePhotoButton: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  infoChipText: {
    fontWeight: '600',
  },
  title: {
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  pickerLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    marginTop: 6,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
  },
  colorOption: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  selectedColorOption: {
    borderWidth: 3,
    borderColor: '#111111',
  },
  whiteColorBorder: {
    borderWidth: 1,
    borderColor: '#CFCFCF',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  saveButton: {
    marginTop: 12,
    borderRadius: 10,
  },
  migrationText: {
    marginBottom: 10,
    color: '#666',
  },
});
