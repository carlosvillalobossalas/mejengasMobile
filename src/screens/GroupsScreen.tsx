import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Avatar,
  Button,
  Card,
  Chip,
  FAB,
  HelperText,
  IconButton,
  Menu,
  Modal,
  Portal,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { launchImageLibrary } from 'react-native-image-picker';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';

import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectGroup, setGroups } from '../features/groups/groupsSlice';
import type { AppDrawerParamList } from '../navigation/types';
import { getUserById } from '../repositories/users/usersRepository';
import { subscribeToGroupsForUser, createGroup, leaveGroup, updateGroupPhotoUrl, type Group } from '../repositories/groups/groupsRepository';
import { uploadGroupPhoto } from '../services/storage/groupPhotoService';
import {
  getGroupMembersV2ByGroupId,
  copyGroupMembersToGroup,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';

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

export default function GroupsScreen() {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>('futbol_7');
  const [newGroupMode, setNewGroupMode] = useState<GroupMode>('libre');
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [openMenuGroupId, setOpenMenuGroupId] = useState<string | null>(null);

  // Copy members state
  const [copyMembers, setCopyMembers] = useState(false);
  const [sourceGroupId, setSourceGroupId] = useState<string | null>(null);
  const [sourceMembers, setSourceMembers] = useState<GroupMemberV2[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [isLoadingSourceMembers, setIsLoadingSourceMembers] = useState(false);

  const userId = useAppSelector(state => state.auth.firebaseUser?.uid ?? null);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const firestoreUser = useAppSelector(state => state.auth.firestoreUser);
  const selectedGroupId = useAppSelector(state => state.groups.selectedGroupId);
  const groups = useAppSelector(state => state.groups.groups);

  // Groups where the current user is the owner — used as copy-from candidates
  const ownedGroups = React.useMemo(
    () => groups.filter(g => g.ownerId === userId),
    [groups, userId],
  );

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
    setCopyMembers(false);
    setSourceGroupId(null);
    setSourceMembers([]);
    setSelectedMemberIds(new Set());
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

  const handleSourceGroupChange = useCallback(async (groupId: string) => {
    setSourceGroupId(groupId);
    setIsLoadingSourceMembers(true);
    try {
      const members = await getGroupMembersV2ByGroupId(groupId);
      setSourceMembers(members);
      // Pre-select all members by default
      setSelectedMemberIds(new Set(members.map(m => m.id)));
    } catch {
      setSourceMembers([]);
      setSelectedMemberIds(new Set());
    } finally {
      setIsLoadingSourceMembers(false);
    }
  }, []);

  const toggleMember = useCallback((memberId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedMemberIds(new Set(sourceMembers.map(m => m.id)));
  }, [sourceMembers]);

  const handleDeselectAll = useCallback(() => {
    setSelectedMemberIds(new Set());
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
        firestoreUser?.displayName ?? firebaseUser?.displayName ?? '',
        (firestoreUser?.photoURL as string | null) ?? firebaseUser?.photoURL ?? null,
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

      // Copy selected members from source group (if the toggle was enabled)
      // Skip the current user — they're already added as owner when the group was created
      if (copyMembers && selectedMemberIds.size > 0) {
        const membersToCopy = sourceMembers.filter(
          m => selectedMemberIds.has(m.id) && m.userId !== userId,
        );
        try {
          await copyGroupMembersToGroup(membersToCopy, groupId, newGroupName.trim());
        } catch {
          console.warn('Member copy failed — group was still created');
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

  const handleOpenSettings = useCallback(
    (groupId: string) => {
      if (!userId) return;
      setOpenMenuGroupId(null);
      dispatch(selectGroup({ userId, groupId }));
      setTimeout(() => navigation.navigate('GroupSettings'), 150);
    },
    [userId, dispatch, navigation],
  );

  const handleAddPlayer = useCallback(
    (groupId: string) => {
      if (!userId) return;
      setOpenMenuGroupId(null);
      dispatch(selectGroup({ userId, groupId }));
      setTimeout(() => navigation.navigate('AddPlayer'), 150);
    },
    [userId, dispatch, navigation],
  );

  const handleManageMembers = useCallback(
    (groupId: string) => {
      if (!userId) return;
      setOpenMenuGroupId(null);
      dispatch(selectGroup({ userId, groupId }));
      setTimeout(() => navigation.navigate('ManageMembers'), 150);
    },
    [userId, dispatch, navigation],
  );

  const handleJoinRequests = useCallback(
    (groupId: string) => {
      if (!userId) return;
      setOpenMenuGroupId(null);
      dispatch(selectGroup({ userId, groupId }));
      setTimeout(() => navigation.navigate('JoinRequests'), 150);
    },
    [userId, dispatch, navigation],
  );

  const handleManageTeams = useCallback(
    (groupId: string) => {
      if (!userId) return;
      setOpenMenuGroupId(null);
      dispatch(selectGroup({ userId, groupId }));
      setTimeout(() => navigation.navigate('ManageTeams'), 150);
    },
    [userId, dispatch, navigation],
  );

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
        const ownerName = group.ownerId ? owners[group.ownerId] || 'Cargando...' : 'Desconocido';
        const isOwner = group.ownerId === userId;
        const typeLabel = MATCH_TYPE_LABELS[group.type] ?? group.type;
        const modeLabel = getGroupModeLabel(group.hasFixedTeams, group.isChallengeMode);

        return (
          <Card key={group.id} style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.cardHeader}>
                {group.photoUrl ? (
                  <Avatar.Image size={48} source={{ uri: group.photoUrl }} />
                ) : (
                  <Avatar.Text
                    size={48}
                    label={group.name.charAt(0).toUpperCase()}
                    style={{ backgroundColor: theme.colors.primaryContainer }}
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
                  <Text variant="labelSmall" style={styles.metaText}>
                    {typeLabel} · {modeLabel} · {ownerName}
                  </Text>
                </View>

                <View style={styles.cardActions}>
                  <Menu
                    visible={openMenuGroupId === group.id}
                    onDismiss={() => setOpenMenuGroupId(null)}
                    contentStyle={{ backgroundColor: '#FFFFFF' }}
                    anchor={
                      <IconButton
                        icon="dots-vertical"
                        size={22}
                        iconColor={theme.colors.onSurfaceVariant}
                        onPress={() => setOpenMenuGroupId(group.id)}
                      />
                    }
                  >
                    <Menu.Item
                      leadingIcon="account-plus"
                      onPress={() => handleAddPlayer(group.id)}
                      title="Agregar jugador"
                    />
                    <Menu.Item
                      leadingIcon="account-group"
                      onPress={() => handleManageMembers(group.id)}
                      title="Gestionar miembros"
                    />
                    <Menu.Item
                      leadingIcon="account-clock"
                      onPress={() => handleJoinRequests(group.id)}
                      title="Solicitudes de unión"
                    />
                    {group.hasFixedTeams && (
                      <Menu.Item
                        leadingIcon="shield-account"
                        onPress={() => handleManageTeams(group.id)}
                        title="Administrar equipos"
                      />
                    )}
                    <Menu.Item
                      leadingIcon="cog-outline"
                      onPress={() => handleOpenSettings(group.id)}
                      title="Configuración"
                    />
                  </Menu>
                </View>
              </View>

              {!isOwner && (
                <Button
                  mode="text"
                  compact
                  textColor={theme.colors.error}
                  onPress={() => handleLeaveGroup(group)}
                  style={styles.leaveButton}
                >
                  Abandonar grupo
                </Button>
              )}
            </Card.Content>
          </Card>
        );
      })}

      <FAB
        icon="plus"
        label="Crear Grupo"
        color='white'
        style={{ ...styles.fab, backgroundColor: theme.colors.primary, }}
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

                {/* ── Copy members section ─────────────────────────────── */}
                <View style={styles.copyMembersToggleRow}>
                  <View style={styles.copyMembersToggleLabel}>
                    <Icon name="account-multiple-plus" size={20} color={theme.colors.primary} />
                    <Text variant="labelMedium">Copiar miembros desde otro grupo</Text>
                  </View>
                  <Switch
                    value={copyMembers}
                    onValueChange={setCopyMembers}
                    color={theme.colors.primary}
                    disabled={ownedGroups.length === 0 || isCreating}
                  />
                </View>

                {ownedGroups.length === 0 && (
                  <Text variant="bodySmall" style={styles.copyMembersHelper}>
                    No tenés grupos propios desde donde copiar.
                  </Text>
                )}

                {copyMembers && ownedGroups.length > 0 && (
                  <View style={styles.copyMembersSection}>
                    <Text variant="labelMedium" style={styles.copyMembersSectionTitle}>
                      Seleccioná el grupo origen
                    </Text>
                    <View style={styles.chipRow}>
                      {ownedGroups.map(g => (
                        <Chip
                          key={g.id}
                          selected={sourceGroupId === g.id}
                          onPress={() => handleSourceGroupChange(g.id)}
                          selectedColor={'white'}
                          disabled={isCreating}
                          style={{
                            backgroundColor: theme.colors.primary,

                          }}
                          textStyle={{ color: 'white' }}
                        >
                          {g.name}
                        </Chip>
                      ))}
                    </View>

                    {isLoadingSourceMembers && (
                      <View style={styles.membersLoadingRow}>
                        <ActivityIndicator size="small" />
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Cargando miembros...
                        </Text>
                      </View>
                    )}

                    {!isLoadingSourceMembers && sourceMembers.length > 0 && (
                      <>
                        <View style={styles.memberSelectActions}>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {selectedMemberIds.size} de {sourceMembers.length} seleccionados
                          </Text>
                          <View style={styles.memberSelectButtons}>
                            <Button compact mode="text" onPress={handleSelectAll} disabled={isCreating}>
                              Todos
                            </Button>
                            <Button compact mode="text" onPress={handleDeselectAll} disabled={isCreating}>
                              Ninguno
                            </Button>
                          </View>
                        </View>
                        {sourceMembers.map(member => {
                          const isSelected = selectedMemberIds.has(member.id);
                          return (
                            <TouchableOpacity
                              key={member.id}
                              style={styles.memberRow}
                              onPress={() => toggleMember(member.id)}
                              activeOpacity={0.7}
                              disabled={isCreating}
                            >
                              {member.photoUrl ? (
                                <Avatar.Image size={32} source={{ uri: member.photoUrl }} />
                              ) : (
                                <Avatar.Text
                                  size={32}
                                  label={member.displayName.charAt(0).toUpperCase()}
                                  style={{ backgroundColor: theme.colors.primaryContainer }}
                                  color={theme.colors.primary}
                                />
                              )}
                              <Text variant="bodyMedium" style={styles.memberName} numberOfLines={1}>
                                {member.displayName}
                              </Text>
                              <Icon
                                name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                size={22}
                                color={isSelected ? theme.colors.primary : theme.colors.outline}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </>
                    )}
                  </View>
                )}
                {/* ─────────────────────────────────────────────────────── */}

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
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 0,
  },
  cardContent: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    fontWeight: '700',
  },
  description: {
    opacity: 0.65,
    lineHeight: 18,
  },
  ownerText: {
    opacity: 0.45,
    marginTop: 2,
  },
  leaveButton: {
    alignSelf: 'flex-end',
    marginTop: 0,
    marginBottom: -4,
  },
  cardActions: {
    marginRight: -8,
  },
  metaText: {
    opacity: 0.45,
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
  // Copy members
  copyMembersToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 4,
  },
  copyMembersToggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  copyMembersHelper: {
    color: '#888',
    marginBottom: 4,
  },
  copyMembersSection: {
    marginTop: 8,
    gap: 10,
    marginBottom: 8,
  },
  copyMembersSectionTitle: {
    color: '#444',
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  membersLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  memberSelectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberSelectButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  memberName: {
    flex: 1,
    color: '#1A1A1A',
  },
});
