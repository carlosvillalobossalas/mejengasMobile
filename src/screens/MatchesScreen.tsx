import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  Chip,
  Divider,
  Surface,
  useTheme,
  MD3Theme,
  Button,
  Portal,
  IconButton,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import auth from '@react-native-firebase/auth';

import { useAppSelector } from '../app/hooks';
import { subscribeToMatchesByGroupId, type Match } from '../repositories/matches/matchesRepository';
import { subscribeToGroupMembersV2ByGroupId, getGroupMemberV2ByUserId, type GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import MatchLineup from '../components/MatchLineup';
import PlayersList from '../components/PlayersList';
import MvpVotingModal from '../components/MvpVotingModal';
import MatchPlayerSlotModal from '../components/MatchPlayerSlotModal';
import { shareMatchOnWhatsApp } from '../services/matches/matchShareService';
import { useMvpVoting } from '../hooks/useMvpVoting';
import {
  tapScheduledSlotInMatch,
  moveScheduledSlotInMatch,
  removeScheduledSlotInMatch,
  replaceScheduledSlotInMatch,
  switchScheduledSlotTeamInMatch,
} from '../repositories/matches/matchSignupsRepository';
import type { AppDrawerParamList } from '../navigation/types';

export default function MatchesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const { firebaseUser } = useAppSelector(state => state.auth);

  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [allPlayers, setAllPlayers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string | 'all'>('all');
  const [selectedYear, setSelectedYear] = useState<number | 'historico'>(
    new Date().getFullYear(),
  );
  // ID of the match the voting modal is open for — derived from live allMatches
  const [selectedVotingMatchId, setSelectedVotingMatchId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    matchId: string;
    team: 1 | 2;
    slotIndex: number;
    groupMemberId: string;
  } | null>(null);
  // Whether the current user is admin or owner of the selected group
  const [isAdminOrOwner, setIsAdminOrOwner] = useState(false);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const filtersSheetRef = useRef<BottomSheet>(null);
  const slotModalRef = useRef<BottomSheet>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  // One ref per card — used to measure position in scroll content after collapse
  const cardRefs = useRef<Map<string, View | null>>(new Map());

  const {
    currentUserGroupMemberId,
    canVoteInMatch,
    castVote,
    isVoting,
    voteError,
    clearVoteError,
  } = useMvpVoting(selectedGroupId, firebaseUser?.uid ?? null);

  const selectedGroup = useMemo(
    () => groups.find(group => group.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  const eligibleGroups = useMemo(
    () => groups.filter(group => !group.hasFixedTeams && !group.isChallengeMode),
    [groups],
  );

  useEffect(() => {
    if (eligibleGroups.length === 0) {
      setSelectedGroupFilter('all');
      return;
    }

    if (selectedGroupFilter !== 'all' && !eligibleGroups.some(group => group.id === selectedGroupFilter)) {
      setSelectedGroupFilter(eligibleGroups[0].id);
    }
  }, [eligibleGroups, selectedGroupFilter]);

  const targetGroupIds = useMemo(
    () =>
      selectedGroupFilter === 'all'
        ? eligibleGroups.map(group => group.id)
        : [selectedGroupFilter],
    [selectedGroupFilter, eligibleGroups],
  );

  const groupsById = useMemo(
    () => new Map(groups.map(group => [group.id, group])),
    [groups],
  );

  const isOwner = useMemo(() => {
    if (!selectedGroupId || !firebaseUser?.uid) return false;
    return selectedGroup?.ownerId === firebaseUser.uid;
  }, [selectedGroup, selectedGroupId, firebaseUser?.uid]);

  const selectedSlotMatch = useMemo(
    () => (selectedSlot ? allMatches.find(m => m.id === selectedSlot.matchId) ?? null : null),
    [allMatches, selectedSlot],
  );

  const selectedSlotPlayer = useMemo(
    () => (selectedSlot ? allPlayers.find(player => player.id === selectedSlot.groupMemberId) ?? null : null),
    [allPlayers, selectedSlot],
  );

  const isMatchCreator = useMemo(() => {
    if (!selectedSlotMatch || !firebaseUser?.uid) return false;
    return selectedSlotMatch.createdByUserId === firebaseUser.uid;
  }, [selectedSlotMatch, firebaseUser?.uid]);

  const canManageSelectedSlot = Boolean(selectedSlotMatch?.status === 'scheduled' && (isAdminOrOwner || isMatchCreator));

  const recentSlotPlayerStats = useMemo(() => {
    if (!selectedSlot?.groupMemberId) return [];

    const rows = allMatches
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter(match => match.status === 'finished')
      .map(match => {
        const player = [...match.players1, ...match.players2].find(p => p.groupMemberId === selectedSlot.groupMemberId);
        if (!player) return null;

        return {
          id: `${match.id}_${player.position}`,
          dateLabel: new Date(match.date).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
          position: player.position,
          goals: Number(player.goals ?? 0),
          assists: Number(player.assists ?? 0),
          ownGoals: Number(player.ownGoals ?? 0),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      dateLabel: string;
      position: string;
      goals: number;
      assists: number;
      ownGoals: number;
    }>;

    return rows.slice(0, 10);
  }, [allMatches, selectedSlot]);

  const selectedSlotMoveOptions = useMemo(() => {
    if (!selectedSlotMatch || !selectedSlot) return [] as Array<{ id: string; label: string; onPress: () => void }>;

    const sourceTeamPlayers = selectedSlot.team === 1 ? selectedSlotMatch.players1 : selectedSlotMatch.players2;
    const targetTeamPlayers = selectedSlot.team === 1 ? selectedSlotMatch.players2 : selectedSlotMatch.players1;

    const sameTeamEmpty = sourceTeamPlayers
      .map((player, index) => ({ player, index }))
      .filter(({ player, index }) => index !== selectedSlot.slotIndex && !player.groupMemberId);

    const otherTeamEmpty = targetTeamPlayers
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => !player.groupMemberId);

    const sameTeamActions = sameTeamEmpty.map(({ player, index }) => ({
      id: `same_${index}`,
      label: `Mover a ${player.position} (Equipo ${selectedSlot.team})`,
      onPress: async () => {
        await moveScheduledSlotInMatch({
          matchId: selectedSlot.matchId,
          team: selectedSlot.team,
          fromSlotIndex: selectedSlot.slotIndex,
          toSlotIndex: index,
        });
      },
    }));

    const otherTeamActions = otherTeamEmpty.map(({ player, index }) => ({
      id: `switch_${index}`,
      label: `Cambiar a ${player.position} (Equipo ${selectedSlot.team === 1 ? 2 : 1})`,
      onPress: async () => {
        await switchScheduledSlotTeamInMatch({
          matchId: selectedSlot.matchId,
          fromTeam: selectedSlot.team,
          fromSlotIndex: selectedSlot.slotIndex,
          toSlotIndex: index,
        });
      },
    }));

    return [...sameTeamActions, ...otherTeamActions];
  }, [selectedSlotMatch, selectedSlot]);

  const replacementCandidates = useMemo(() => {
    if (!selectedSlotMatch || !selectedSlot) return [];

    const assigned = new Set(
      [...selectedSlotMatch.players1, ...selectedSlotMatch.players2]
        .map(p => p.groupMemberId)
        .filter(Boolean),
    );

    return allPlayers
      .filter(player => !assigned.has(player.id) || player.id === selectedSlot.groupMemberId)
      .filter(player => player.id !== selectedSlot.groupMemberId)
      .map(player => ({
        groupMemberId: player.id,
        displayName: player.displayName,
        photoUrl: player.photoUrl,
      }));
  }, [allPlayers, selectedSlotMatch, selectedSlot]);

  const closeSlotModal = useCallback(() => {
    slotModalRef.current?.close();
    setTimeout(() => setSelectedSlot(null), 200);
  }, []);

  // Subscribe to group members in real-time for the selected filter scope
  useEffect(() => {
    if (targetGroupIds.length === 0) {
      setAllPlayers([]);
      return;
    }

    const membersByGroup = new Map<string, GroupMemberV2[]>();
    const unsubscribers = targetGroupIds.map(groupId =>
      subscribeToGroupMembersV2ByGroupId(groupId, members => {
        membersByGroup.set(groupId, members);
        const merged = Array.from(membersByGroup.values()).flat();
        const unique = new Map<string, GroupMemberV2>();
        merged.forEach(member => unique.set(member.id, member));
        setAllPlayers(Array.from(unique.values()));
      }),
    );

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [targetGroupIds]);

  // Check if the current user is admin/owner so the edit button can be shown
  useEffect(() => {
    const checkRole = async () => {
      if (selectedGroupFilter === 'all' || !firebaseUser?.uid) {
        setIsAdminOrOwner(false);
        return;
      }
      try {
        const member = await getGroupMemberV2ByUserId(selectedGroupFilter, firebaseUser.uid);
        const role = member?.role ?? '';
        setIsAdminOrOwner(role === 'admin' || role === 'owner');
      } catch (err) {
        console.error('MatchesScreen: error checking role', err);
        setIsAdminOrOwner(false);
      }
    };

    checkRole();
  }, [selectedGroupFilter, firebaseUser?.uid]);

  // Subscribe to matches in real-time
  useEffect(() => {
    if (targetGroupIds.length === 0) {
      setIsLoading(false);
      setAllMatches([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    const matchesByGroup = new Map<string, Match[]>();
    const unsubscribers = targetGroupIds.map(groupId =>
      subscribeToMatchesByGroupId(groupId, matchesData => {
        matchesByGroup.set(groupId, matchesData);
        const merged = Array.from(matchesByGroup.values())
          .flat()
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAllMatches(merged);
        setIsLoading(false);
      }),
    );

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [targetGroupIds]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 2025;
    const years: number[] = [];
    for (let y = currentYear; y >= startYear; y--) {
      years.push(y);
    }
    return [
      { value: 'historico' as const, label: 'Histórico' },
      ...years.map(year => ({ value: year, label: year.toString() })),
    ];
  }, []);

  const matches = useMemo(() => {
    if (selectedYear === 'historico') return allMatches;
    return allMatches.filter(m => new Date(m.date).getFullYear() === selectedYear);
  }, [allMatches, selectedYear]);

  const matchesByDate = useMemo(() => {
    const sorted = [...matches].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const groups = new Map<string, Match[]>();
    for (const match of sorted) {
      const key = new Date(match.date).toLocaleDateString('en-CA');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(match);
    }
    return Array.from(groups.entries());
  }, [matches]);

  const formatDateHeader = (dateKey: string): string => {
    const todayKey = new Date().toLocaleDateString('en-CA');
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = yesterdayDate.toLocaleDateString('en-CA');

    if (dateKey === todayKey) return 'Hoy';
    if (dateKey === yesterdayKey) return 'Ayer';

    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getYearLabel = (year: number | 'historico') => {
    const option = yearOptions.find(opt => opt.value === year);
    return option?.label || year.toString();
  };

  const groupFilterOptions = useMemo(
    () => [
      { value: 'all' as const, label: 'Todos mis grupos' },
      ...eligibleGroups.map(group => ({ value: group.id, label: group.name })),
    ],
    [eligibleGroups],
  );

  const selectedGroupFilterLabel = useMemo(() => {
    if (selectedGroupFilter === 'all') return 'Todos mis grupos';
    return groupsById.get(selectedGroupFilter)?.name ?? 'Grupo';
  }, [selectedGroupFilter, groupsById]);

  const handleSelectYear = useCallback((year: number | 'historico') => {
    setSelectedYear(year);
  }, []);

  const appliedFiltersLabel = useMemo(
    () => `Temporada: ${getYearLabel(selectedYear)} · Grupo: ${selectedGroupFilterLabel}`,
    [selectedYear, selectedGroupFilterLabel],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles(theme).headerActions}>
          <IconButton
            icon="filter-variant"
            iconColor={theme.colors.secondary}
            size={22}
            onPress={() => filtersSheetRef.current?.expand()}
          />
          <IconButton
            icon="plus"
            iconColor={theme.colors.secondary}
            size={22}
            onPress={() => navigation.navigate('AddMatch')}
          />
        </View>
      ),
    });
  }, [navigation, theme]);

  // Derives from live subscription data so mvpVotes reflects in real-time
  const selectedVotingMatch = useMemo(
    () => (selectedVotingMatchId ? allMatches.find(m => m.id === selectedVotingMatchId) ?? null : null),
    [selectedVotingMatchId, allMatches],
  );

  const handleVote = useCallback(
    async (votedGroupMemberId: string) => {
      if (!selectedVotingMatchId) return;
      await castVote(selectedVotingMatchId, votedGroupMemberId);
      // Keep the modal open so the user sees their registered vote
    },
    [selectedVotingMatchId, castVote],
  );

  const deleteMatch = useCallback(async (matchId: string) => {
    if (deletingMatchId) return;

    setDeletingMatchId(matchId);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('No autenticado');

      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        'https://us-central1-mejengas-a7794.cloudfunctions.net/deleteMatch',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ data: { matchId } }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage =
          (errorBody as { error?: { message?: string } })?.error?.message ??
          'No se pudo eliminar el partido';
        throw new Error(errorMessage);
      }

      setExpandedMatchId(prev => (prev === matchId ? null : prev));
      setSelectedVotingMatchId(prev => (prev === matchId ? null : prev));
      Alert.alert('Partido eliminado', 'El partido se eliminó correctamente.');
    } catch (err) {
      console.error('MatchesScreen: error deleting match', err);
      Alert.alert('Error', 'No se pudo eliminar el partido. Intenta de nuevo.');
    } finally {
      setDeletingMatchId(null);
    }
  }, [deletingMatchId]);

  const handleDeleteMatchPress = useCallback((matchId: string) => {
    Alert.alert(
      'Eliminar partido',
      'Esta acción borrará el partido de forma permanente. Si estaba finalizado, también se revertirán sus estadísticas. ¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void deleteMatch(matchId);
          },
        },
      ],
    );
  }, [deleteMatch]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  const getMatchResult = (match: Match): string => {
    if (match.goalsTeam1 > match.goalsTeam2) return 'Victoria Equipo 1';
    if (match.goalsTeam2 > match.goalsTeam1) return 'Victoria Equipo 2';
    return 'Empate';
  };

  const getMatchResultColor = (match: Match): string => {
    if (match.goalsTeam1 > match.goalsTeam2) return theme.colors.primary;
    if (match.goalsTeam2 > match.goalsTeam1) return theme.colors.primary;
    return theme.colors.secondary;
  };

  const toggleMatchExpansion = (matchId: string) => {
    const isCurrentlyExpanded = expandedMatchId === matchId;
    if (isCurrentlyExpanded) {
      // Collapse first, then wait for layout to settle before scrolling
      setExpandedMatchId(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const cardNode = cardRefs.current.get(matchId);
          if (cardNode && scrollViewRef.current) {
            // measureLayout gives the card's Y position in the scroll content
            cardNode.measureLayout(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              scrollViewRef.current as any,
              (_left, top) => {
                scrollViewRef.current?.scrollTo({ y: top, animated: true });
              },
              () => { },
            );
          }
        });
      });
    } else {
      setExpandedMatchId(matchId);
    }
  };

  const getStatusLabel = (status: Match['status']): string => {
    switch (status) {
      case 'finished': return 'Finalizado';
      case 'scheduled': return 'Por jugar';
      case 'cancelled': return 'Cancelado';
      default: return 'Finalizado';
    }
  };

  const formatMatchTime = (date: string): string => {
    return new Date(date).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const getStatusStyle = (status: Match['status'], t: MD3Theme): { color: string; borderColor: string; backgroundColor: string } => {
    switch (status) {
      case 'scheduled': return { color: '#E65100', borderColor: '#E65100', backgroundColor: '#FFF3E0' };
      case 'cancelled': return { color: '#B71C1C', borderColor: '#B71C1C', backgroundColor: '#FFEBEE' };
      default: return { color: t.colors.primary, borderColor: t.colors.primary, backgroundColor: t.colors.primaryContainer };
    }
  };

  const renderMatch = (match: Match) => {
    const groupForMatch = groupsById.get(match.groupId);
    const isExpanded = expandedMatchId === match.id;
    const result = getMatchResult(match);
    const resultColor = getMatchResultColor(match);
    const hasVoted = !!(currentUserGroupMemberId && match.mvpVotes[currentUserGroupMemberId]);

    return (
      <View
        key={match.id}
        ref={el => { cardRefs.current.set(match.id, el); }}
      >
        <Card
          style={[styles(theme).matchCard, { borderLeftColor: resultColor }]}
          onPress={() => toggleMatchExpansion(match.id)}
        >
          <Card.Content style={styles(theme).cardContent}>
            {/* Compact score row */}
            {selectedGroupFilter === 'all' ? (
              <Text variant="labelSmall" style={styles(theme).groupNameLabel}>
                {groupForMatch?.name ?? 'Grupo'}
              </Text>
            ) : null}
            <View style={styles(theme).compactRow}>
              <Text variant="bodyMedium" style={styles(theme).compactTeam} numberOfLines={1}>
                Equipo 1
              </Text>
              <View style={styles(theme).compactScoreColumn}>
                <Text style={[styles(theme).statusLabel, getStatusStyle(match.status, theme)]}>
                  {getStatusLabel(match.status)}
                </Text>
                {match.status === 'scheduled' ? (
                  <Text variant="titleMedium" style={[styles(theme).compactScore, { color: theme.colors.onSurfaceVariant }]}>
                    {formatMatchTime(match.date)}
                  </Text>
                ) : (
                  <Text variant="titleMedium" style={[styles(theme).compactScore, { color: resultColor }]}>
                    {match.goalsTeam1} – {match.goalsTeam2}
                  </Text>
                )}
              </View>
              <Text variant="bodyMedium" style={styles(theme).compactTeamRight} numberOfLines={1}>
                Equipo 2
              </Text>
              <Icon
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.onSurfaceVariant}
              />
            </View>

            {/* Expanded: Actions + Lineups + Players */}
            {isExpanded && (
              <>
                <Divider style={styles(theme).divider} />

                {/* Quick actions */}
                <View style={styles(theme).expandedActions}>
                  <TouchableOpacity
                    onPress={() => shareMatchOnWhatsApp(match, allPlayers)}
                    style={styles(theme).expandedActionItem}
                    activeOpacity={0.7}
                  >
                    <Icon name="whatsapp" size={22} color="#25D366" />
                    <Text variant="labelSmall" style={styles(theme).expandedActionLabel}>
                      Compartir
                    </Text>
                  </TouchableOpacity>
                  {isAdminOrOwner && (
                    <TouchableOpacity
                      onPress={() => navigation.navigate('EditMatch', { matchId: match.id })}
                      style={styles(theme).expandedActionItem}
                      activeOpacity={0.7}
                    >
                      <Icon name="pencil" size={22} color={theme.colors.primary} />
                      <Text variant="labelSmall" style={styles(theme).expandedActionLabel}>
                        Editar
                      </Text>
                    </TouchableOpacity>
                  )}
                  {isOwner && (
                    <TouchableOpacity
                      onPress={() => handleDeleteMatchPress(match.id)}
                      style={styles(theme).expandedActionItem}
                      activeOpacity={0.7}
                      disabled={deletingMatchId === match.id}
                    >
                      <Icon name="delete-outline" size={22} color={theme.colors.error} />
                      <Text
                        variant="labelSmall"
                        style={styles(theme).expandedActionLabelDanger}
                      >
                        {deletingMatchId === match.id ? 'Eliminando...' : 'Eliminar'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {canVoteInMatch(match) && (
                    <TouchableOpacity
                      onPress={() => setSelectedVotingMatchId(match.id)}
                      style={styles(theme).expandedActionItem}
                      activeOpacity={0.7}
                    >
                      <Icon name="star-circle-outline" size={22} color={theme.colors.secondary} />
                      <Text variant="labelSmall" style={styles(theme).expandedActionLabel}>
                        {hasVoted ? 'Cambiar voto' : 'Votar MVP'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Divider style={styles(theme).divider} />
                <View style={styles(theme).sectionHeader}>
                  <Icon name="soccer-field" size={20} color={theme.colors.primary} />
                  <Text variant="titleMedium" style={styles(theme).sectionTitle}>
                    Alineaciones
                  </Text>
                </View>
                <MatchLineup
                  team1Players={match.players1}
                  team2Players={match.players2}
                  allPlayers={allPlayers}
                  mvpGroupMemberId={match.mvpGroupMemberId}
                  team1Color={match.team1Color ?? groupForMatch?.defaultTeam1Color}
                  team2Color={match.team2Color ?? groupForMatch?.defaultTeam2Color}
                  matchDate={match.date}
                  onSlotPress={async ({ team, slotIndex, groupMemberId }) => {
                    if (!firebaseUser?.uid) return;

                    if (groupMemberId) {
                      setSelectedSlot({
                        matchId: match.id,
                        team,
                        slotIndex,
                        groupMemberId,
                      });
                      setTimeout(() => slotModalRef.current?.expand(), 80);
                      return;
                    }

                    if (match.status !== 'scheduled') return;

                    try {
                      await tapScheduledSlotInMatch({
                        matchId: match.id,
                        userId: firebaseUser.uid,
                        team,
                        slotIndex,
                      });
                    } catch (tapError) {
                      const message =
                        tapError instanceof Error
                          ? tapError.message
                          : 'No se pudo actualizar tu lugar en el partido.';
                      Alert.alert('No fue posible actualizar', message);
                    }
                  }}
                />
                <View style={styles(theme).spacing} />
                <PlayersList
                  team1Players={match.players1}
                  team2Players={match.players2}
                  allPlayers={allPlayers}
                  mvpGroupMemberId={match.mvpGroupMemberId}
                />
              </>
            )}
          </Card.Content>
        </Card>
      </View>
    );
  };

  if (eligibleGroups.length === 0) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No tienes grupos modo clásico
        </Text>
        <Text variant="bodyMedium" style={styles(theme).errorSubtext}>
          Únete o crea un grupo sin equipos fijos para ver partidos.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>
          Cargando partidos...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles(theme).container}>
      {/* Header */}
      <Surface style={styles(theme).header} elevation={2}>
        <View style={styles(theme).headerContent}>
          <Text variant="bodySmall" style={styles(theme).matchCount}>
            Total: {matches.length} partido{matches.length !== 1 ? 's' : ''}
          </Text>
          <Text variant="bodySmall" style={styles(theme).appliedFiltersText}>
            {appliedFiltersLabel}
          </Text>
        </View>
      </Surface>

      <Divider />

      {/* Matches List */}
      <ScrollView
        ref={scrollViewRef}
        style={styles(theme).scrollView}
        contentContainerStyle={styles(theme).contentContainer}
      >
        {matches.length === 0 ? (
          <View style={styles(theme).emptyState}>
            <Icon name="soccer" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={styles(theme).emptyText}>
              No hay partidos registrados
            </Text>
            <Text variant="bodyMedium" style={styles(theme).emptySubtext}>
              Los partidos aparecerán aquí cuando se registren
            </Text>
          </View>
        ) : (
          matchesByDate.map(([dateKey, dateMatches]) => (
            <View key={dateKey}>
              <View style={styles(theme).dateHeader}>
                <Text variant="labelMedium" style={styles(theme).dateHeaderText}>
                  {formatDateHeader(dateKey)}
                </Text>
              </View>
              {dateMatches.map(match => renderMatch(match))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Filters Bottom Sheet */}
      <Portal>
        <BottomSheet
          ref={filtersSheetRef}
          index={-1}
          snapPoints={['40%']}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
        >
          <View style={styles(theme).bottomSheetContent}>
            <Text variant="titleMedium" style={styles(theme).bottomSheetTitle}>
              Filtros
            </Text>
            <ScrollView style={styles(theme).filterScroll} contentContainerStyle={styles(theme).filterScrollContent} showsVerticalScrollIndicator={false}>
              <Text variant="labelMedium" style={styles(theme).sheetSectionTitle}>
                Temporada
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles(theme).chipRow}>
                {yearOptions.map(item => (
                  <Chip
                    key={item.value.toString()}
                    selected={selectedYear === item.value}
                    onPress={() => handleSelectYear(item.value)}
                    mode="outlined"
                    style={styles(theme).filterChip}
                  >
                    {item.label}
                  </Chip>
                ))}
              </ScrollView>
              <Text variant="labelMedium" style={styles(theme).sheetSectionTitle}>
                Grupo
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles(theme).chipRow}>
                {groupFilterOptions.map(item => (
                  <Chip
                    key={item.value}
                    selected={selectedGroupFilter === item.value}
                    onPress={() => setSelectedGroupFilter(item.value)}
                    mode="outlined"
                    style={styles(theme).filterChip}
                  >
                    {item.label}
                  </Chip>
                ))}
              </ScrollView>
            </ScrollView>
            <View style={styles(theme).applyButtonContainer}>
              <Button
                mode="contained"
                onPress={() => filtersSheetRef.current?.close()}
                style={styles(theme).applyFiltersButton}
              >
                Aplicar
              </Button>
            </View>
          </View>
        </BottomSheet>
      </Portal>

      {/* MVP Voting Modal */}
      <MvpVotingModal
        visible={selectedVotingMatchId !== null}
        match={selectedVotingMatch}
        allPlayers={allPlayers}
        currentUserGroupMemberId={currentUserGroupMemberId}
        isVoting={isVoting}
        voteError={voteError}
        onVote={handleVote}
        onDismiss={() => {
          setSelectedVotingMatchId(null);
          clearVoteError();
        }}
        onClearError={clearVoteError}
      />

      <Portal>
        <MatchPlayerSlotModal
          bottomSheetRef={slotModalRef}
          playerName={selectedSlotPlayer?.displayName ?? 'Jugador'}
          playerPhotoUrl={selectedSlotPlayer?.photoUrl ?? null}
          recentStats={recentSlotPlayerStats}
          canManage={canManageSelectedSlot}
          quickActions={
            canManageSelectedSlot && selectedSlot
              ? [
                  {
                    id: 'remove',
                    label: 'Remover jugador',
                    icon: 'account-remove-outline',
                    onPress: async () => {
                      try {
                        await removeScheduledSlotInMatch({
                          matchId: selectedSlot.matchId,
                          team: selectedSlot.team,
                          slotIndex: selectedSlot.slotIndex,
                        });
                        closeSlotModal();
                      } catch (e) {
                        Alert.alert('No fue posible actualizar', e instanceof Error ? e.message : 'Error inesperado.');
                      }
                    },
                  },
                  ...selectedSlotMoveOptions.map(option => ({
                    id: option.id,
                    label: option.label,
                    icon: option.id.startsWith('switch_') ? 'swap-horizontal' : 'arrow-expand',
                    onPress: async () => {
                      try {
                        await option.onPress();
                        closeSlotModal();
                      } catch (e) {
                        Alert.alert('No fue posible actualizar', e instanceof Error ? e.message : 'Error inesperado.');
                      }
                    },
                  })),
                ]
              : []
          }
          replacementCandidates={canManageSelectedSlot ? replacementCandidates : []}
          onReplace={async replacementGroupMemberId => {
            if (!selectedSlot) return;
            try {
              await replaceScheduledSlotInMatch({
                matchId: selectedSlot.matchId,
                team: selectedSlot.team,
                slotIndex: selectedSlot.slotIndex,
                replacementGroupMemberId,
              });
              closeSlotModal();
            } catch (e) {
              Alert.alert('No fue posible actualizar', e instanceof Error ? e.message : 'Error inesperado.');
            }
          }}
        />
      </Portal>
    </View>
  );
}

const styles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  headerContent: {
    gap: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  matchCount: {
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.9,
  },
  appliedFiltersText: {
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.95,
  },
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bottomSheetTitle: {
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  filterScroll: {
    flex: 1,
  },
  filterScrollContent: {
    paddingBottom: 8,
  },
  sheetSectionTitle: {
    marginTop: 10,
    marginBottom: 8,
    color: theme.colors.onSurfaceVariant,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    // chip handles its own sizing
  },
  applyButtonContainer: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  applyFiltersButton: {
    // no extra margin needed — container handles spacing
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    gap: 16,
  },
  matchCard: {
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.onPrimary,
    borderLeftWidth: 4,
    paddingVertical: 10,
    paddingHorizontal: 5
  },
  cardContent: {
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareButton: {
    padding: 4,
  },
  dateText: {
    textTransform: 'capitalize',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  teamScore: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamLabel: {
    fontWeight: 'bold',
  },
  scoreSurface: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  scoreText: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  vsContainer: {
    paddingHorizontal: 16,
  },
  vsText: {
    fontWeight: 'bold',
    color: '#666',
  },
  resultContainer: {
    alignItems: 'center',
  },
  resultChip: {
    paddingHorizontal: 8,
  },
  resultText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  divider: {
    marginVertical: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  spacing: {
    height: 16,
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 8,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    color: '#666',
  },
  errorText: {
    textAlign: 'center',
    color: '#F44336',
  },
  errorSubtext: {
    textAlign: 'center',
    color: '#666',
  },
  voteMatchButton: {
    alignSelf: 'center',
    marginVertical: 2,
    backgroundColor: theme.colors.secondary,
  },
  voteMatchButtonContent: {
    paddingHorizontal: 4,
  },
  editMatchButton: {
    alignSelf: 'center',
    marginVertical: 2,
  },
  editMatchButtonContent: {
    paddingHorizontal: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
  },
  emptySubtext: {
    textAlign: 'center',
    color: '#999',
  },
  dateHeader: {
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 4,
  },
  dateHeaderText: {
    color: theme.colors.primary,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  groupNameLabel: {
    color: theme.colors.primary,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusLabel: {
    textAlign: 'center',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  compactScoreColumn: {
    alignItems: 'center',
    gap: 3,
    minWidth: 80,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactTeam: {
    flex: 1,
    fontWeight: '600',
  },
  compactTeamRight: {
    flex: 1,
    fontWeight: '600',
    textAlign: 'right',
  },
  compactScore: {
    fontWeight: 'bold',
    fontSize: 18,
    textAlign: 'center',
  },
  compactFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    // gap: 4,
    minHeight: 28,
    marginTop: 2,
    justifyContent: 'space-between'
  },
  compactResult: {
    fontWeight: '500',
  },
  compactActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  compactActionButton: {
    // height: 30,
    justifyContent: 'center',
  },
  compactActionButtonContent: {
    // height: 30,
    paddingHorizontal: 4,
  },
  compactShareButton: {
    padding: 4,
  },
  expandedActions: {
    flexDirection: 'row',
    // gap: 24,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  expandedActionItem: {
    alignItems: 'center',
    gap: 4,
  },
  expandedActionLabel: {
    color: theme.colors.onSurfaceVariant,
  },
  expandedActionLabelDanger: {
    color: theme.colors.error,
  },
});
