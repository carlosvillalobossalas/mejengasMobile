import { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';

import { useAppSelector } from '../app/hooks';
import {
  subscribeToGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import {
  getTeamById,
  getTeamsByGroupId,
  createTeam,
  updateTeam,
  type TeamPlayer,
} from '../repositories/teams/teamsRepository';
import { uploadTeamPhoto } from '../services/storage/teamPhotoService';

export type Position = TeamPlayer['defaultPosition'];

export type SelectedPlayer = {
  groupMemberId: string;
  displayName: string;
  defaultPosition: Position;
};

export type UseTeamFormResult = {
  teamName: string;
  setTeamName: (name: string) => void;
  teamColor: string;
  setTeamColor: (color: string) => void;
  selectedPlayers: SelectedPlayer[];
  availableMembers: GroupMemberV2[];
  /** Members not already assigned to any other team in the group. */
  freeMembers: GroupMemberV2[];
  /** URI to display in the photo preview: local pick if pending, otherwise saved URL. */
  photoPreviewUri: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  clearError: () => void;
  resetForm: () => void;
  pickPhoto: () => Promise<void>;
  removePhoto: () => void;
  addPlayer: (member: GroupMemberV2) => void;
  removePlayer: (groupMemberId: string) => void;
  setPlayerPosition: (groupMemberId: string, position: Position) => void;
  validate: () => string | null;
  save: () => Promise<boolean>;
};

/**
 * Encapsulates all form logic for creating or editing a team.
 * Pass `teamId` to enter edit mode; omit it for create mode.
 */
export function useTeamForm(teamId?: string): UseTeamFormResult {
  const { selectedGroupId } = useAppSelector(state => state.groups);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);

  const [teamName, setTeamName] = useState('');
  const [teamColor, setTeamColor] = useState('#2196F3');
  const [selectedPlayers, setSelectedPlayers] = useState<SelectedPlayer[]>([]);
  const [availableMembers, setAvailableMembers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Incremented after team data finishes loading so the reconciliation
  // effect re-runs even if the members listener already fired first.
  const [teamLoadedAt, setTeamLoadedAt] = useState(0);
  // groupMemberIds already assigned to a team other than the one being edited
  const [occupiedInOtherTeams, setOccupiedInOtherTeams] = useState<Set<string>>(new Set());
  // Photo: saved URL from Firestore (or null) + a local URI picked but not yet uploaded
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

  // ── Load groupMemberIds already assigned to other teams ─────────────────
  useEffect(() => {
    if (!selectedGroupId) return;

    let isMounted = true;

    const load = async () => {
      const allTeams = await getTeamsByGroupId(selectedGroupId);
      if (!isMounted) return;

      const occupied = new Set<string>();
      allTeams.forEach(t => {
        // Exclude the current team so its own players remain selectable
        if (t.id !== teamId) {
          t.players.forEach(p => occupied.add(p.groupMemberId));
        }
      });
      setOccupiedInOtherTeams(occupied);
    };

    load();
    return () => { isMounted = false; };
  }, [selectedGroupId, teamId]);

  // ── Real-time listener for group members ────────────────────────────────
  useEffect(() => {
    if (!selectedGroupId) return;

    const unsubscribe = subscribeToGroupMembersV2ByGroupId(
      selectedGroupId,
      members => {
        setAvailableMembers(members);
        // In create mode the only loading work is waiting for members
        if (!teamId) setIsLoading(false);
      },
      () => {
        setError('Error al cargar los jugadores del grupo');
        if (!teamId) setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [selectedGroupId, teamId]);

  // ── One-shot load for existing team data (edit mode only) ────────────────
  useEffect(() => {
    if (!teamId) {
      // Create mode: always start with a clean form
      setTeamName('');
      setTeamColor('#2196F3');
      setSelectedPlayers([]);
      setCurrentPhotoUrl(null);
      setLocalPhotoUri(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const existingTeam = await getTeamById(teamId);
        if (!isMounted || !existingTeam) return;

        setTeamName(existingTeam.name);
        setTeamColor(existingTeam.color);
        setCurrentPhotoUrl(existingTeam.photoUrl);
        // We store the raw player list; displayNames will resolve once the
        // members listener fires and availableMembers is populated.
        setSelectedPlayers(
          existingTeam.players.map(p => ({
            groupMemberId: p.groupMemberId,
            displayName: p.groupMemberId, // placeholder until members arrive
            defaultPosition: p.defaultPosition,
          })),
        );
        // Signal reconciliation to re-run now that we have the raw player list
        setTeamLoadedAt(n => n + 1);
      } catch {
        if (isMounted) setError('Error al cargar los datos del equipo');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [teamId]);

  // ── Resolve displayNames once members are available ──────────────────────
  // Runs when either availableMembers or teamLoadedAt changes, covering both
  // race conditions: members arrive first vs. team data arrives first.
  useEffect(() => {
    if (availableMembers.length === 0) return;

    const membersMap = new Map(availableMembers.map(m => [m.id, m]));
    setSelectedPlayers(prev =>
      prev.map(p => ({
        ...p,
        displayName: membersMap.get(p.groupMemberId)?.displayName ?? p.displayName,
      })),
    );
  // teamLoadedAt is intentionally included so this reruns after team data loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableMembers, teamLoadedAt]);

  /** Members not assigned to any team other than the one being edited. */
  const freeMembers = useMemo(
    () => availableMembers.filter(m => !occupiedInOtherTeams.has(m.id)),
    [availableMembers, occupiedInOtherTeams],
  );

  /** URI to show in the photo preview. Prefers the freshly-picked local file. */
  const photoPreviewUri = localPhotoUri ?? currentPhotoUrl;

  const clearError = useCallback(() => setError(null), []);

  const resetForm = useCallback(() => {
    setTeamName('');
    setTeamColor('#2196F3');
    setSelectedPlayers([]);
    setCurrentPhotoUrl(null);
    setLocalPhotoUri(null);
    setError(null);
  }, []);

  const pickPhoto = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 800,
      maxHeight: 800,
      includeBase64: false,
    });

    if (result.didCancel || !result.assets?.length) return;

    const asset = result.assets[0];
    if (!asset.uri) {
      Alert.alert('Error', 'No se pudo obtener la imagen seleccionada');
      return;
    }

    const uri =
      Platform.OS === 'ios' && !asset.uri.startsWith('file://')
        ? `file://${asset.uri}`
        : asset.uri;

    setLocalPhotoUri(uri);
  }, []);

  const removePhoto = useCallback(() => {
    setLocalPhotoUri(null);
    setCurrentPhotoUrl(null);
  }, []);

  // Prevent adding the same player twice
  const addPlayer = useCallback((member: GroupMemberV2) => {
    setSelectedPlayers(prev => {
      if (prev.some(p => p.groupMemberId === member.id)) return prev;
      return [
        ...prev,
        {
          groupMemberId: member.id,
          displayName: member.displayName,
          defaultPosition: 'DEF',
        },
      ];
    });
  }, []);

  const removePlayer = useCallback((groupMemberId: string) => {
    setSelectedPlayers(prev => prev.filter(p => p.groupMemberId !== groupMemberId));
  }, []);

  const setPlayerPosition = useCallback(
    (groupMemberId: string, position: Position) => {
      setSelectedPlayers(prev =>
        prev.map(p =>
          p.groupMemberId === groupMemberId ? { ...p, defaultPosition: position } : p,
        ),
      );
    },
    [],
  );

  const validate = useCallback((): string | null => {
    if (!teamName.trim()) return 'El nombre del equipo es obligatorio';
    if (!teamColor) return 'Selecciona un color para el equipo';
    return null;
  }, [teamName, teamColor, selectedPlayers]);

  const save = useCallback(async (): Promise<boolean> => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return false;
    }

    if (!selectedGroupId || !firebaseUser?.uid) {
      setError('No hay sesión activa');
      return false;
    }

    setIsSaving(true);
    setError(null);

    try {
      const players: TeamPlayer[] = selectedPlayers.map(p => ({
        groupMemberId: p.groupMemberId,
        defaultPosition: p.defaultPosition,
      }));

      if (teamId) {
        // Edit mode: upload new photo first (if any), then update the doc in one write
        let finalPhotoUrl: string | null = currentPhotoUrl;
        if (localPhotoUri) {
          finalPhotoUrl = await uploadTeamPhoto(teamId, localPhotoUri);
        }
        await updateTeam(teamId, {
          name: teamName.trim(),
          color: teamColor,
          photoUrl: finalPhotoUrl,
          players,
          updatedBy: firebaseUser.uid,
        });
      } else {
        // Create mode: write the doc first to get an ID, then upload photo and patch
        const newTeamId = await createTeam({
          groupId: selectedGroupId,
          name: teamName.trim(),
          color: teamColor,
          photoUrl: null,
          players,
          createdBy: firebaseUser.uid,
        });
        if (localPhotoUri) {
          const photoUrl = await uploadTeamPhoto(newTeamId, localPhotoUri);
          await updateTeam(newTeamId, {
            name: teamName.trim(),
            color: teamColor,
            photoUrl,
            players,
            updatedBy: firebaseUser.uid,
          });
        }
      }

      return true;
    } catch {
      setError('Error al guardar el equipo');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [validate, selectedGroupId, firebaseUser, teamId, teamName, teamColor, selectedPlayers, currentPhotoUrl, localPhotoUri]);

  return {
    teamName,
    setTeamName,
    teamColor,
    setTeamColor,
    selectedPlayers,
    availableMembers,
    freeMembers,
    photoPreviewUri,
    isLoading,
    isSaving,
    error,
    clearError,
    resetForm,
    pickPhoto,
    removePhoto,
    addPlayer,
    removePlayer,
    setPlayerPosition,
    validate,
    save,
  };
}
