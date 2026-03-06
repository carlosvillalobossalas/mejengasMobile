import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput, useTheme } from 'react-native-paper';

import { useAppSelector } from '../app/hooks';
import {
  updateGroupSettings,
} from '../repositories/groups/groupSettingsRepository';

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
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);

  const selectedGroup = useMemo(
    () => groups.find(group => group.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  const [name, setName] = useState(selectedGroup?.name ?? '');
  const [defaultTeam1Color, setDefaultTeam1Color] = useState(selectedGroup?.defaultTeam1Color ?? '#000000');
  const [defaultTeam2Color, setDefaultTeam2Color] = useState(selectedGroup?.defaultTeam2Color ?? '#FFFFFF');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!selectedGroup) return;
    setName(selectedGroup.name ?? '');
    setDefaultTeam1Color(selectedGroup.defaultTeam1Color ?? '#000000');
    setDefaultTeam2Color(selectedGroup.defaultTeam2Color ?? '#FFFFFF');
  }, [selectedGroup]);

  const canEditTeamDefaults = Boolean(selectedGroup && !selectedGroup.hasFixedTeams && !selectedGroup.isChallengeMode);

  const isNameValid = name.trim().length > 0;

  const canSave = isNameValid;

  const handleSave = async () => {
    if (!selectedGroup?.id || !canSave) return;

    setIsSaving(true);
    try {
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
          <Text variant="titleLarge" style={styles.title}>Configuración del grupo</Text>

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
