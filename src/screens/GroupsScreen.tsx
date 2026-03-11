import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Keyboard,
  TouchableOpacity,
  Image,
} from 'react-native';
import {
  Avatar,
  Button,
  Card,
  HelperText,
  Text,
  ActivityIndicator,
  Portal,
  Modal,
  TextInput,
  FAB,
  SegmentedButtons,
  useTheme,
} from 'react-native-paper';
import { launchImageLibrary } from 'react-native-image-picker';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectGroup, setGroups } from '../features/groups/groupsSlice';
import { getUserById } from '../repositories/users/usersRepository';
import { subscribeToGroupsForUser, createGroup, leaveGroup, updateGroupPhotoUrl, type Group } from '../repositories/groups/groupsRepository';
import { uploadGroupPhoto } from '../services/storage/groupPhotoService';

type GroupType = 'futbol_7' | 'futbol_5' | 'futbol_11';
type GroupMode = 'libre' | 'equipos' | 'retos';

const GROUP_TYPE_OPTIONS = [
  { value: 'futbol_5', label: 'Fútbol 5' },
  { value: 'futbol_7', label: 'Fútbol 7' },
  { value: 'futbol_11', label: 'Fútbol 11' },
];

const GROUP_MODE_OPTIONS = [
  { value: 'libre', label: 'Libre' },
  { value: 'equipos', label: 'Equipos' },
  { value: 'retos', label: 'Retos' },
];

const GROUP_MODE_DESCRIPTIONS: Record<GroupMode, string> = {
  libre: 'Los equipos se arman libremente partido a partido. Ideal para mejengas o grupos casuales.',
  equipos: 'El grupo tiene equipos fijos con jugadores asignados. Ideal para ligas o torneos.',
  retos: 'Solo se registra el equipo del grupo. Los rivales se identifican por nombre. Ideal para partidos contra otros equipos.',
};

const deriveModeFlags = (mode: GroupMode) => ({
  hasFixedTeams: mode === 'equipos',
  isChallengeMode: mode === 'retos',
});

export default function GroupsScreen() {
  const dispatch = useAppDispatch();
  const theme = useTheme()
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>('futbol_7');
  const [newGroupMode, setNewGroupMode] = useState<GroupMode>('libre');
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const userId = useAppSelector(state => state.auth.firebaseUser?.uid ?? null);
  const firestoreUser = useAppSelector(state => state.auth.firestoreUser);
  const { selectedGroupId } = useAppSelector(state => state.groups);
  const groups = useAppSelector(state => state.groups.groups);

  useEffect(() => {
    if (!userId) return;

    // Subscribe to real-time updates — keep Redux in sync so any
    // local patch (e.g. updateGroupPhoto) is preserved across screens
    const unsubscribe = subscribeToGroupsForUser(userId, (groupsData) => {
      dispatch(setGroups(groupsData));
    });

    return () => {
      unsubscribe();
    };
  }, [userId, dispatch]);

  // Fetch owner names for all groups when the group list changes
  useEffect(() => {
    const fetchOwners = async () => {
      const ownerIds = [...new Set(groups.map(g => g.ownerId).filter(Boolean))];
      const ownersMap: Record<string, string> = {};

      for (const ownerId of ownerIds) {
        try {
          const owner = await getUserById(ownerId);
          if (owner) {
            ownersMap[ownerId] = owner.displayName || owner.email || 'Usuario';
          }
        } catch (error) {
          console.error('Error fetching owner:', error);
        }
      }

      setOwners(ownersMap);
    };

    if (groups.length > 0) {
      fetchOwners();
    }
  }, [groups]);

  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const resetForm = () => {
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupType('futbol_7');
    setNewGroupMode('libre');
    setLocalPhotoUri(null);
  };

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

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Por favor ingresa un nombre para el grupo');
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'No se pudo obtener la información del usuario');
      return;
    }

    setIsCreating(true);
    try {
      const { hasFixedTeams, isChallengeMode } = deriveModeFlags(newGroupMode);

      const groupId = await createGroup(
        newGroupName.trim(),
        newGroupDescription.trim(),
        userId,
        newGroupType,
        hasFixedTeams,
        isChallengeMode,
        firestoreUser?.displayName ?? '',
        firestoreUser?.photoURL ?? null,
      );

      // Upload avatar if one was selected — non-blocking, group already created
      if (localPhotoUri) {
        try {
          const url = await uploadGroupPhoto(groupId, localPhotoUri);
          await updateGroupPhotoUrl(groupId, url);
        } catch {
          console.warn('Group photo upload failed');
        }
      }

      Alert.alert('Éxito', 'Grupo creado correctamente');
      resetForm();
      setShowCreateModal(false);
    } catch (error) {
      console.error('Error creating group:', error);
      Alert.alert('Error', 'No se pudo crear el grupo');
    } finally {
      setIsCreating(false);
    }
  };

  const onSelectGroup = (groupId: string) => {
    if (!userId) return;
    dispatch(selectGroup({ userId, groupId }));
  };


  const handleLeaveGroup = (group: Group) => {
    if (!userId) return;

    Alert.alert(
      'Abandonar grupo',
      `¿Seguro que querés salir de "${group.name}"? Vas a perder acceso a este grupo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abandonar',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveGroup(group.id, userId);
              // If the group being left was the active selection, clear it
              if (selectedGroupId === group.id) {
                dispatch(selectGroup({ userId, groupId: null }));
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'No se pudo abandonar el grupo.';
              Alert.alert('Error', message);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text variant="bodyMedium" style={styles.loadingText}>
            Cargando grupos…
          </Text>
        </View>
      ) : null}

      {error ? (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      ) : null}

      {groups.length === 0 && !isLoading ? (
        <Card style={styles.emptyCard}>
          <Card.Content>
            <Text variant="titleMedium">No tenés grupos todavía</Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Pedí acceso a un grupo o creá uno desde la consola/admin.
            </Text>
          </Card.Content>
        </Card>
      ) : null}

      {groups.map(group => {
        const isSelected = group.id === selectedGroupId;
        const ownerName = group.ownerId ? owners[group.ownerId] || 'Cargando...' : 'Desconocido';

        return (
          <Card key={group.id} style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.cardHeader}>
                {group.photoUrl ? (
                  <Avatar.Image
                    size={44}
                    source={{ uri: group.photoUrl }}
                    style={styles.groupAvatar}
                  />
                ) : (
                  <Avatar.Text
                    size={44}
                    label={group.name.charAt(0).toUpperCase()}
                    style={[styles.groupAvatar, { backgroundColor: theme.colors.primaryContainer }]}
                    color={theme.colors.primary}
                  />
                )}
                <View style={styles.textContainer}>
                  <Text variant="titleMedium" style={styles.groupName}>
                    {group.name}
                  </Text>

                  {group.description ? (
                    <Text variant="bodySmall" style={styles.description}>
                      {group.description}
                    </Text>
                  ) : null}

                  <Text variant="labelSmall" style={styles.ownerText}>
                    Dueño: {ownerName}
                  </Text>
                </View>

                <View style={styles.cardActions}>
                  <Button
                    mode={isSelected ? 'contained' : 'elevated'}
                    onPress={() => onSelectGroup(group.id)}
                    compact
                  >
                    {isSelected ? 'Seleccionado' : 'Seleccionar'}
                  </Button>
                  {group.ownerId !== userId ? (
                    <Button
                      mode="text"
                      textColor={theme.colors.error}
                      onPress={() => handleLeaveGroup(group)}
                      compact
                    >
                      Abandonar
                    </Button>
                  ) : null}
                </View>
              </View>
            </Card.Content>
          </Card>
        );
      })}

      <FAB
        icon="plus"
        label="Crear Grupo"
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      />

      <Portal>
        <Modal
          visible={showCreateModal}
          onDismiss={() => {
            Keyboard.dismiss();
            setShowCreateModal(false);
            resetForm();
          }}
          contentContainerStyle={styles.modalWrapper}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.modalContent}>
                <Text variant="titleLarge" style={styles.modalTitle}>
                  Crear Nuevo Grupo
                </Text>

                {/* Group avatar picker */}
                <TouchableOpacity
                  style={styles.avatarPicker}
                  onPress={pickPhoto}
                  disabled={isCreating}
                  activeOpacity={0.7}
                >
                  {localPhotoUri ? (
                    <Image source={{ uri: localPhotoUri }} style={styles.avatarPickerImage} />
                  ) : (
                    <View style={styles.avatarPickerPlaceholder}>
                      <Icon name="camera-plus" size={28} color="#9E9E9E" />
                      <Text variant="labelSmall" style={styles.avatarPickerLabel}>
                        Foto del grupo
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TextInput
                  label="Nombre del grupo"
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  mode="outlined"
                  disabled={isCreating}
                  style={styles.input}
                />

                <TextInput
                  label="Descripción (opcional)"
                  value={newGroupDescription}
                  onChangeText={setNewGroupDescription}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  maxLength={240}
                  disabled={isCreating}
                  style={styles.input}
                />
                <HelperText type="info" style={styles.charCount}>
                  {newGroupDescription.length}/240
                </HelperText>

                <Text variant="labelLarge" style={styles.fieldLabel}>Modo de juego</Text>
                <SegmentedButtons
                  value={newGroupMode}
                  onValueChange={value => setNewGroupMode(value as GroupMode)}
                  buttons={GROUP_MODE_OPTIONS}
                  style={styles.segmentedButtons}
                  theme={{
                    colors: {
                      secondaryContainer: theme.colors.primary,
                      onSecondaryContainer: '#FFFFFF',
                    },
                  }}
                />
                <Text variant="bodySmall" style={styles.modeDescription}>
                  {GROUP_MODE_DESCRIPTIONS[newGroupMode]}
                </Text>

                <Text variant="labelLarge" style={styles.fieldLabel}>Tipo de partido</Text>
                <SegmentedButtons
                  value={newGroupType}
                  onValueChange={value => setNewGroupType(value as GroupType)}
                  buttons={GROUP_TYPE_OPTIONS}
                  style={styles.segmentedButtons}
                  theme={{
                    colors: {
                      secondaryContainer: theme.colors.primary,
                      onSecondaryContainer: '#FFFFFF',
                    },
                  }}
                />
                <View style={styles.modalButtons}>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    disabled={isCreating}
                    style={styles.modalButton}
                  >
                    Cancelar
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleCreateGroup}
                    loading={isCreating}
                    disabled={isCreating}
                    style={styles.modalButton}
                  >
                    Crear
                  </Button>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    opacity: 0.75,
  },
  emptyCard: {
    borderRadius: 12,
  },
  emptyText: {
    opacity: 0.6,
    marginTop: 4,
  },
  card: {
    borderRadius: 8,
    elevation: 1,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  groupAvatar: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  cardActions: {
    alignItems: 'flex-end',
    gap: 4,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  groupName: {
    fontWeight: '600',
  },
  description: {
    opacity: 0.7,
    lineHeight: 18,
  },
  ownerText: {
    opacity: 0.5,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: 25,
    bottom: 25,
  },
  modalWrapper: {
    margin: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
  },
  modalTitle: {
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    marginBottom: 4,
  },
  charCount: {
    textAlign: 'right',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
  },
  fieldLabel: {
    marginBottom: 8,
    marginTop: 4,
  },
  segmentedButtons: {
    marginBottom: 8,
  },
  modeDescription: {
    color: '#666',
    marginBottom: 20,
    lineHeight: 18,
  },
  avatarPicker: {
    alignSelf: 'center',
    marginBottom: 20,
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
  },
  avatarPickerImage: {
    width: '100%',
    height: '100%',
  },
  avatarPickerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F5F5F5',
  },
  avatarPickerLabel: {
    color: '#9E9E9E',
    fontSize: 10,
    textAlign: 'center',
  },
});
