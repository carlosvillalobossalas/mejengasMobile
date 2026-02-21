import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput, Button, Surface, useTheme, Snackbar } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';

import { useAppSelector } from '../app/hooks';
import { createGuestGroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';

export default function AddPlayerScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { selectedGroupId } = useAppSelector(state => state.groups);

  const [playerName, setPlayerName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleSavePlayer = async () => {
    const trimmedName = playerName.trim();

    if (!trimmedName) {
      setSnackbarMessage('Por favor ingresa el nombre del jugador');
      setSnackbarVisible(true);
      return;
    }

    if (!selectedGroupId) {
      setSnackbarMessage('No hay grupo seleccionado');
      setSnackbarVisible(true);
      return;
    }

    setIsSaving(true);
    try {
      await createGuestGroupMemberV2(selectedGroupId, trimmedName);

      setSnackbarMessage('Jugador creado exitosamente');
      setSnackbarVisible(true);
      setPlayerName('');

      // Navigate back after short delay
    //   setTimeout(() => {
    //     navigation.goBack();
    //   }, 1500);
    } catch (error) {
      console.error('Error creating player:', error);
      setSnackbarMessage('Error al crear el jugador');
      setSnackbarVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedGroupId) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles.errorText}>
          No hay grupo seleccionado
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Surface style={styles.card} elevation={2}>
        <View style={styles.header}>
          <Icon name="account-plus" size={48} color={theme.colors.primary} />
          <Text variant="headlineSmall" style={styles.title}>
            Agregar Jugador
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Ingresa el nombre del nuevo jugador
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="Nombre del jugador"
            value={playerName}
            onChangeText={setPlayerName}
            mode="outlined"
            placeholder="Ej: Juan Pérez"
            left={<TextInput.Icon icon="account" />}
            autoCapitalize="words"
            autoCorrect={false}
            disabled={isSaving}
            style={styles.input}
          />

          <Button
            mode="contained"
            onPress={handleSavePlayer}
            disabled={isSaving || !playerName.trim()}
            loading={isSaving}
            style={styles.saveButton}
            contentStyle={styles.saveButtonContent}
            icon="content-save"
          >
            Guardar Jugador
          </Button>
        </View>
      </Surface>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
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
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  errorText: {
    marginTop: 16,
    textAlign: 'center',
  },
  card: {
    borderRadius: 12,
    padding: 24,
    backgroundColor: '#FFF',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 12,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#666',
    textAlign: 'center',
  },
  form: {
    gap: 20,
  },
  input: {
    backgroundColor: '#FFF',
  },
  saveButton: {
    borderRadius: 8,
    marginTop: 8,
  },
  saveButtonContent: {
    paddingVertical: 8,
  },
});
