import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ScrollView, View, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import {
  Text,
  Surface,
  Divider,
  Button,
  Portal,
  Card,
  useTheme,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import auth from '@react-native-firebase/auth';

import { useAppSelector } from '../app/hooks';
import { useChallengeMatches } from '../hooks/useChallengeMatches';
import { useChallengeMatchMvpVoting } from '../hooks/useChallengeMatchMvpVoting';
import ChallengeMvpVotingModal from '../components/ChallengeMvpVotingModal';
import ChallengeMatchLineup from '../components/ChallengeMatchLineup';
import MatchPlayerSlotModal from '../components/MatchPlayerSlotModal';
import { shareChallengeMatchOnWhatsApp } from '../services/matches/challengeMatchShareService';
import type { ChallengeMatch, ChallengeMatchPlayer } from '../repositories/matches/matchesByChallengeRepository';
import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import {
  tapScheduledSlotInChallengeMatch,
  moveScheduledSlotInChallengeMatch,
  removeScheduledSlotInChallengeMatch,
  replaceScheduledSlotInChallengeMatch,
} from '../repositories/matches/matchSignupsRepository';
import type { AppDrawerParamList } from '../navigation/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CalendarIcon = () => <Icon name="calendar-month" size={20} color="#FFFFFF" />;

const POSITION_ORDER: Record<ChallengeMatchPlayer['position'], number> = {
  POR: 0,
  DEF: 1,
  MED: 2,
  DEL: 3,
};

// ─── Player list row ──────────────────────────────────────────────────────────

type PlayerRowProps = {
  player: ChallengeMatchPlayer;
  groupMembers: GroupMemberV2[];
  mvpGroupMemberId: string | null;
  accentColor: string;
  theme: MD3Theme;
};

function PlayerRow({ player, groupMembers, mvpGroupMemberId, accentColor, theme: t }: PlayerRowProps) {
  const member = player.groupMemberId ? groupMembers.find(m => m.id === player.groupMemberId) : undefined;
  const displayName = member?.displayName ?? 'Por asignar';
  const isMvp = player.groupMemberId !== null && mvpGroupMemberId === player.groupMemberId;
  const hasStats = player.goals > 0 || player.assists > 0 || player.ownGoals > 0;

  return (
    <View style={playerRowStyles(t).row}>
      <View style={playerRowStyles(t).left}>
        <View style={[playerRowStyles(t).positionBadge, { backgroundColor: accentColor }]}>
          <Text style={playerRowStyles(t).positionText}>{player.position}</Text>
        </View>
        <Text variant="bodyMedium" style={playerRowStyles(t).name} numberOfLines={1}>
          {displayName}
        </Text>
        {player.isSub && (
          <View style={playerRowStyles(t).subBadge}>
            <Text style={playerRowStyles(t).subText}>SUP</Text>
          </View>
        )}
        {isMvp && <Icon name="star" size={16} color="#FFD700" />}
      </View>
      {hasStats && (
        <View style={playerRowStyles(t).stats}>
          {player.goals > 0 && (
            <View style={playerRowStyles(t).stat}>
              <Icon name="soccer" size={13} color={accentColor} />
              <Text style={[playerRowStyles(t).statVal, { color: accentColor }]}>{player.goals}</Text>
            </View>
          )}
          {player.assists > 0 && (
            <View style={playerRowStyles(t).stat}>
              <Icon name="shoe-cleat" size={12} color="#666" />
              <Text style={playerRowStyles(t).statGrey}>{player.assists}</Text>
            </View>
          )}
          {player.ownGoals > 0 && (
            <View style={playerRowStyles(t).stat}>
              <Icon name="close-circle-outline" size={13} color="#E57373" />
              <Text style={playerRowStyles(t).statRed}>{player.ownGoals}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChallengeMatchesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const currentUser = useAppSelector(state => state.auth.firestoreUser);

  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [selectedVotingMatchId, setSelectedVotingMatchId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    matchId: string;
    slotIndex: number;
    groupMemberId: string;
  } | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const slotModalRef = useRef<BottomSheet>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const cardRefs = useRef<Map<string, View | null>>(new Map());

  const activeGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  const groupName = activeGroup?.name ?? 'Mi Equipo';

  const {
    matches,
    groupMembers,
    isLoading,
    error,
    selectedYear,
    setSelectedYear,
    yearOptions,
  } = useChallengeMatches(selectedGroupId ?? undefined);

  const {
    currentUserGroupMemberId,
    canVoteInMatch,
    castVote,
    isVoting,
    voteError,
    clearVoteError,
  } = useChallengeMatchMvpVoting(selectedGroupId, firebaseUser?.uid ?? null);

  const selectedSlotMatch = useMemo(
    () => (selectedSlot ? matches.find(m => m.id === selectedSlot.matchId) ?? null : null),
    [matches, selectedSlot],
  );

  const selectedSlotPlayer = useMemo(
    () => (selectedSlot ? groupMembers.find(member => member.id === selectedSlot.groupMemberId) ?? null : null),
    [groupMembers, selectedSlot],
  );

  const currentMemberRole = useMemo(() => {
    if (!firebaseUser?.uid) return null;
    return groupMembers.find(member => member.userId === firebaseUser.uid)?.role ?? null;
  }, [groupMembers, firebaseUser?.uid]);

  const selectedVotingMatch = useMemo(
    () => (selectedVotingMatchId ? matches.find(m => m.id === selectedVotingMatchId) ?? null : null),
    [selectedVotingMatchId, matches],
  );

  const isAdmin = useMemo(() => {
    if (!selectedGroupId || !activeGroup || !firebaseUser?.uid) return false;
    if (activeGroup.ownerId === firebaseUser.uid) return true;
    return currentMemberRole === 'admin' || currentMemberRole === 'owner';
  }, [selectedGroupId, activeGroup, firebaseUser?.uid, currentMemberRole]);

  const isMatchCreator = useMemo(() => {
    if (!selectedSlotMatch || !firebaseUser?.uid) return false;
    return selectedSlotMatch.createdByUserId === firebaseUser.uid;
  }, [selectedSlotMatch, firebaseUser?.uid]);

  const canManageSelectedSlot = Boolean(selectedSlotMatch?.status === 'scheduled' && (isAdmin || isMatchCreator));

  const recentSlotPlayerStats = useMemo(() => {
    if (!selectedSlot?.groupMemberId) return [];

    const rows = matches
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter(match => match.status === 'finished')
      .map(match => {
        const player = match.players.find(p => p.groupMemberId === selectedSlot.groupMemberId);
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
  }, [matches, selectedSlot]);

  const selectedSlotMoveOptions = useMemo(() => {
    if (!selectedSlotMatch || !selectedSlot) return [] as Array<{ id: string; label: string; onPress: () => void }>;

    return selectedSlotMatch.players
      .map((player, index) => ({ player, index }))
      .filter(({ player, index }) => index !== selectedSlot.slotIndex && !player.groupMemberId)
      .map(({ player, index }) => ({
        id: `move_${index}`,
        label: `Mover a ${player.position}`,
        onPress: async () => {
          await moveScheduledSlotInChallengeMatch({
            matchId: selectedSlot.matchId,
            fromSlotIndex: selectedSlot.slotIndex,
            toSlotIndex: index,
          });
        },
      }));
  }, [selectedSlotMatch, selectedSlot]);

  const replacementCandidates = useMemo(() => {
    if (!selectedSlotMatch || !selectedSlot) return [];

    const assigned = new Set(
      selectedSlotMatch.players
        .map(p => p.groupMemberId)
        .filter(Boolean),
    );

    return groupMembers
      .filter(member => !assigned.has(member.id) || member.id === selectedSlot.groupMemberId)
      .filter(member => member.id !== selectedSlot.groupMemberId)
      .map(member => ({
        groupMemberId: member.id,
        displayName: member.displayName,
        photoUrl: member.photoUrl,
      }));
  }, [groupMembers, selectedSlotMatch, selectedSlot]);

  const closeSlotModal = useCallback(() => {
    slotModalRef.current?.close();
    setTimeout(() => setSelectedSlot(null), 200);
  }, []);

  const deleteChallengeMatch = useCallback(async (matchId: string) => {
    if (deletingMatchId) return;

    setDeletingMatchId(matchId);
    try {
      const currentAuthUser = auth().currentUser;
      if (!currentAuthUser) throw new Error('No autenticado');

      const idToken = await currentAuthUser.getIdToken();
      const response = await fetch(
        'https://us-central1-mejengas-a7794.cloudfunctions.net/deleteChallengeMatch',
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
    } catch (error) {
      console.error('ChallengeMatchesScreen: error deleting match', error);
      Alert.alert('Error', 'No se pudo eliminar el partido. Intenta de nuevo.');
    } finally {
      setDeletingMatchId(null);
    }
  }, [deletingMatchId]);

  const handleDeletePress = useCallback((matchId: string) => {
    Alert.alert(
      'Eliminar partido',
      'Esta acción borrará el partido de forma permanente. Si estaba finalizado, también se revertirán sus estadísticas. ¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void deleteChallengeMatch(matchId);
          },
        },
      ],
    );
  }, [deleteChallengeMatch]);

  // Group matches by date descending — mirrors MatchesScreen
  const matchesByDate = useMemo(() => {
    const sorted = [...matches].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const grouped = new Map<string, ChallengeMatch[]>();
    for (const match of sorted) {
      const key = new Date(match.date).toLocaleDateString('en-CA');
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(match);
    }
    return Array.from(grouped.entries());
  }, [matches]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

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

  const getStatusLabel = (status: ChallengeMatch['status']): string => {
    switch (status) {
      case 'finished':  return 'Finalizado';
      case 'scheduled': return 'Por jugar';
      case 'cancelled': return 'Cancelado';
      default:          return 'Finalizado';
    }
  };

  const getStatusStyle = (
    status: ChallengeMatch['status'],
  ): { color: string; borderColor: string; backgroundColor: string } => {
    switch (status) {
      case 'scheduled':
        return { color: '#E65100', borderColor: '#E65100', backgroundColor: '#FFF3E0' };
      case 'cancelled':
        return { color: '#B71C1C', borderColor: '#B71C1C', backgroundColor: '#FFEBEE' };
      default:
        return {
          color: theme.colors.primary,
          borderColor: theme.colors.primary,
          backgroundColor: theme.colors.primaryContainer,
        };
    }
  };

  const formatMatchTime = (date: string): string =>
    new Date(date).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  const getResultColor = (match: ChallengeMatch): string => {
    if (match.status !== 'finished') return theme.colors.onSurfaceVariant;
    if (match.goalsTeam > match.goalsOpponent) return '#388E3C';
    if (match.goalsOpponent > match.goalsTeam) return '#D32F2F';
    return '#757575';
  };

  const getYearLabel = (year: number | 'historico'): string => {
    const option = yearOptions.find(o => o.value === year);
    return option?.label ?? year.toString();
  };

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleVote = useCallback(
    async (votedGroupMemberId: string) => {
      if (!selectedVotingMatchId) return;
      await castVote(selectedVotingMatchId, votedGroupMemberId);
    },
    [selectedVotingMatchId, castVote],
  );

  const handleToggle = useCallback((matchId: string) => {
    setExpandedMatchId(prev => {
      const isCurrentlyExpanded = prev === matchId;
      if (isCurrentlyExpanded) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const cardNode = cardRefs.current.get(matchId);
            if (cardNode && scrollViewRef.current) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cardNode.measureLayout(scrollViewRef.current as any, (_left, top) => {
                scrollViewRef.current?.scrollTo({ y: top, animated: true });
              }, () => {});
            }
          });
        });
        return null;
      }
      return matchId;
    });
  }, []);

  const handleSelectYear = useCallback(
    (year: number | 'historico') => {
      setSelectedYear(year);
      bottomSheetRef.current?.close();
    },
    [setSelectedYear],
  );

  const renderBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  // ─── Render single match card ────────────────────────────────────────────────

  const renderMatch = (match: ChallengeMatch) => {
    const isExpanded = expandedMatchId === match.id;
    const resultColor = getResultColor(match);
    const hasVoted = !!(currentUserGroupMemberId && match.mvpVotes[currentUserGroupMemberId]);
    const opponentLabel = match.opponentName.trim() || 'Rival';
    const isScheduled = match.status === 'scheduled';
    const teamColor = match.teamColor ?? activeGroup?.defaultTeam1Color ?? theme.colors.primary;
    const baseOpponentColor = match.opponentColor ?? activeGroup?.defaultTeam2Color ?? '#FFFFFF';
    const opponentColor =
      baseOpponentColor.toLowerCase() === teamColor.toLowerCase()
        ? '#111111'
        : baseOpponentColor;

    const sortedPlayers = [...match.players].sort(
      (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position],
    );
    const starters = sortedPlayers.filter(p => !p.isSub);
    const subs = sortedPlayers.filter(p => p.isSub);

    return (
      <View
        key={match.id}
        ref={el => { cardRefs.current.set(match.id, el); }}
      >
        <Card
          style={[styles(theme).matchCard, { borderLeftColor: resultColor }]}
          onPress={() => handleToggle(match.id)}
        >
          <Card.Content style={styles(theme).cardContent}>

            {/* Compact row: groupName | status+score | rival | chevron */}
            <View style={styles(theme).compactRow}>
              <Text variant="bodyMedium" style={styles(theme).compactTeam} numberOfLines={1}>
                {groupName}
              </Text>
              <View style={styles(theme).compactScoreColumn}>
                <Text style={[styles(theme).statusLabel, getStatusStyle(match.status)]}>
                  {getStatusLabel(match.status)}
                </Text>
                {isScheduled ? (
                  <Text
                    variant="titleMedium"
                    style={[styles(theme).compactScore, { color: theme.colors.onSurfaceVariant }]}
                  >
                    {formatMatchTime(match.date)}
                  </Text>
                ) : (
                  <Text
                    variant="titleMedium"
                    style={[styles(theme).compactScore, { color: resultColor }]}
                  >
                    {match.goalsTeam} – {match.goalsOpponent}
                  </Text>
                )}
              </View>
              <Text variant="bodyMedium" style={styles(theme).compactTeamRight} numberOfLines={1}>
                {opponentLabel}
              </Text>
              <Icon
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.onSurfaceVariant}
              />
            </View>

            {/* Expanded section */}
            {isExpanded && (
              <>
                <Divider style={styles(theme).divider} />

                {/* Actions */}
                <View style={styles(theme).expandedActions}>
                  <TouchableOpacity
                    onPress={() => shareChallengeMatchOnWhatsApp(match, groupName, groupMembers)}
                    style={styles(theme).expandedActionItem}
                    activeOpacity={0.7}
                  >
                    <Icon name="whatsapp" size={22} color="#25D366" />
                    <Text variant="labelSmall" style={styles(theme).expandedActionLabel}>
                      Compartir
                    </Text>
                  </TouchableOpacity>
                  {isAdmin && (
                    <TouchableOpacity
                      onPress={() => navigation.navigate('EditChallengeMatch', { matchId: match.id })}
                      style={styles(theme).expandedActionItem}
                      activeOpacity={0.7}
                    >
                      <Icon name="pencil" size={22} color={theme.colors.primary} />
                      <Text variant="labelSmall" style={styles(theme).expandedActionLabel}>
                        Editar
                      </Text>
                    </TouchableOpacity>
                  )}
                  {isAdmin && (
                    <TouchableOpacity
                      onPress={() => handleDeletePress(match.id)}
                      style={styles(theme).expandedActionItem}
                      activeOpacity={0.7}
                      disabled={deletingMatchId === match.id}
                    >
                      <Icon name="delete-outline" size={22} color={theme.colors.error} />
                      <Text variant="labelSmall" style={styles(theme).expandedActionLabelDanger}>
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

                {/* Lineup */}
                {starters.length > 0 && (
                  <>
                    <View style={styles(theme).sectionHeader}>
                      <Icon name="soccer-field" size={20} color={theme.colors.primary} />
                      <Text variant="titleMedium" style={styles(theme).sectionTitle}>
                        Alineación
                      </Text>
                    </View>
                    <ChallengeMatchLineup
                      players={match.players}
                      allPlayers={groupMembers}
                      mvpGroupMemberId={match.mvpGroupMemberId}
                      teamColor={teamColor}
                      secondaryTeamColor={opponentColor}
                      teamName={groupName}
                      secondaryTeamName="Rival"
                      matchDate={match.date}
                      onSlotPress={async ({ slotIndex, groupMemberId }) => {
                        if (!firebaseUser?.uid) return;

                        if (groupMemberId) {
                          setSelectedSlot({
                            matchId: match.id,
                            slotIndex,
                            groupMemberId,
                          });
                          setTimeout(() => slotModalRef.current?.expand(), 80);
                          return;
                        }

                        if (match.status !== 'scheduled') return;

                        try {
                          await tapScheduledSlotInChallengeMatch({
                            matchId: match.id,
                            userId: firebaseUser.uid,
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
                  </>
                )}

                {/* Players list */}
                <View style={styles(theme).sectionHeader}>
                  <Icon name="account-group" size={20} color={theme.colors.primary} />
                  <Text variant="titleMedium" style={styles(theme).sectionTitle}>
                    Jugadores
                  </Text>
                </View>

                {starters.map((player, idx) => (
                  <PlayerRow
                    key={player.groupMemberId ?? `starter_${idx}`}
                    player={player}
                    groupMembers={groupMembers}
                    mvpGroupMemberId={match.mvpGroupMemberId}
                    accentColor={theme.colors.primary}
                    theme={theme}
                  />
                ))}

                {subs.length > 0 && (
                  <>
                    <Divider style={styles(theme).subDivider} />
                    <Text variant="labelMedium" style={styles(theme).subLabel}>
                      Suplentes
                    </Text>
                    {subs.map((player, idx) => (
                      <PlayerRow
                        key={player.groupMemberId ?? `sub_${idx}`}
                        player={player}
                        groupMembers={groupMembers}
                        mvpGroupMemberId={match.mvpGroupMemberId}
                        accentColor={theme.colors.primary}
                        theme={theme}
                      />
                    ))}
                  </>
                )}
              </>
            )}

          </Card.Content>
        </Card>
      </View>
    );
  };

  // ─── Early returns ───────────────────────────────────────────────────────────

  if (!selectedGroupId) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>No hay grupo seleccionado</Text>
        <Text variant="bodyMedium" style={styles(theme).errorSubtext}>
          Por favor, selección un grupo desde la pantalla de Grupos
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>Cargando partidos...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>{error}</Text>
      </View>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  return (
    <View style={styles(theme).container}>

      {/* Header */}
      <Surface style={styles(theme).header} elevation={2}>
        <View style={styles(theme).headerContent}>
          <Text variant="bodySmall" style={styles(theme).matchCount}>
            Total: {matches.length} partido{matches.length !== 1 ? 's' : ''}
          </Text>
          <Button
            mode="contained"
            onPress={() => bottomSheetRef.current?.expand()}
            icon={CalendarIcon}
            style={styles(theme).yearButton}
            contentStyle={styles(theme).yearButtonContent}
            labelStyle={styles(theme).yearButtonLabel}
          >
            {getYearLabel(selectedYear)}
          </Button>
        </View>
      </Surface>

      <Divider />

      {/* Match list */}
      <ScrollView
        ref={scrollViewRef}
        style={styles(theme).scrollView}
        contentContainerStyle={styles(theme).contentContainer}
      >
        {matches.length === 0 ? (
          <View style={styles(theme).emptyState}>
            <Icon name="soccer" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={styles(theme).emptyText}>No hay partidos registrados</Text>
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

      {/* Year selection bottom sheet */}
      <Portal>
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={['50%']}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
        >
          <View style={styles(theme).bottomSheetContent}>
            <Text variant="titleMedium" style={styles(theme).bottomSheetTitle}>
              Seleccionar Temporada
            </Text>
            <BottomSheetFlatList
              data={yearOptions}
              keyExtractor={(item: { value: number | 'historico'; label: string }) =>
                item.value.toString()
              }
              renderItem={({
                item,
              }: {
                item: { value: number | 'historico'; label: string };
              }) => (
                <Button
                  mode={selectedYear === item.value ? 'contained' : 'text'}
                  onPress={() => handleSelectYear(item.value)}
                  style={styles(theme).yearOptionButton}
                  contentStyle={styles(theme).yearOptionContent}
                >
                  {item.label}
                </Button>
              )}
            />
          </View>
        </BottomSheet>
      </Portal>

      {/* MVP voting modal */}
      <ChallengeMvpVotingModal
        visible={selectedVotingMatchId !== null}
        match={selectedVotingMatch}
        allPlayers={groupMembers}
        currentUserGroupMemberId={currentUserGroupMemberId}
        isVoting={isVoting}
        voteError={voteError}
        onVote={handleVote}
        onDismiss={() => { setSelectedVotingMatchId(null); clearVoteError(); }}
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
                        await removeScheduledSlotInChallengeMatch({
                          matchId: selectedSlot.matchId,
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
                    icon: 'arrow-expand',
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
              await replaceScheduledSlotInChallengeMatch({
                matchId: selectedSlot.matchId,
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    scrollView: { flex: 1 },
    contentContainer: { padding: 16, paddingBottom: 32 },
    header: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    headerContent: { gap: 12 },
    matchCount: { color: '#FFFFFF', textAlign: 'center', opacity: 0.9 },
    yearButton: { backgroundColor: 'rgba(255, 255, 255, 0.2)', marginVertical: 8 },
    yearButtonContent: { paddingVertical: 4 },
    yearButtonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    bottomSheetContent: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    bottomSheetTitle: { textAlign: 'center', marginBottom: 16, fontWeight: 'bold' },
    yearOptionButton: { marginVertical: 4 },
    yearOptionContent: { paddingVertical: 8 },
    emptyState: { padding: 48, alignItems: 'center', gap: 16 },
    emptyText: { textAlign: 'center', color: '#666' },
    emptySubtext: { textAlign: 'center', color: '#999' },
    matchCard: {
      marginBottom: 6,
      borderRadius: 8,
      backgroundColor: theme.colors.onPrimary,
      borderLeftWidth: 4,
      paddingVertical: 10,
      paddingHorizontal: 5,
    },
    cardContent: { gap: 4, paddingVertical: 8, paddingHorizontal: 8 },
    compactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    compactTeam: { flex: 1, fontWeight: '600' },
    compactTeamRight: { flex: 1, fontWeight: '600', textAlign: 'right' },
    compactScoreColumn: { alignItems: 'center', gap: 3, minWidth: 80 },
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
    compactScore: { fontWeight: 'bold', fontSize: 18, textAlign: 'center' },
    divider: { marginVertical: 8 },
    subDivider: { marginVertical: 6 },
    subLabel: { color: '#888', marginBottom: 4 },
    expandedActions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    expandedActionItem: { alignItems: 'center', gap: 4 },
    expandedActionLabel: { color: theme.colors.onSurfaceVariant },
    expandedActionLabelDanger: { color: theme.colors.error },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    sectionTitle: { fontWeight: 'bold' },
    spacing: { height: 16 },
    dateHeader: { paddingHorizontal: 4, paddingTop: 12, paddingBottom: 4 },
    dateHeaderText: {
      color: theme.colors.primary,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 16,
    },
    loadingText: { color: '#666' },
    errorText: { textAlign: 'center', color: '#F44336' },
    errorSubtext: { textAlign: 'center', color: '#666' },
  });

const playerRowStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    positionBadge: {
      width: 36,
      height: 22,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    positionText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
    name: { flex: 1, color: theme.colors.onSurface },
    subBadge: { backgroundColor: '#B0BEC5', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
    subText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    stats: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    statVal: { fontSize: 13, fontWeight: '600' },
    statGrey: { fontSize: 13, color: '#666' },
    statRed: { fontSize: 13, color: '#E57373' },
  });
