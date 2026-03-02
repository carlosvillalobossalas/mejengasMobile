import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  Divider,
  Surface,
  useTheme,
  MD3Theme,
  Button,
  Portal,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';

import { useAppSelector } from '../app/hooks';
import { subscribeToMatchesByGroupId, type Match } from '../repositories/matches/matchesRepository';
import { getGroupMembersV2ByGroupId, getGroupMemberV2ByUserId, type GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import MatchLineup from '../components/MatchLineup';
import PlayersList from '../components/PlayersList';
import MvpVotingModal from '../components/MvpVotingModal';
import { shareMatchOnWhatsApp } from '../services/matches/matchShareService';
import { useMvpVoting } from '../hooks/useMvpVoting';
import type { AppDrawerParamList } from '../navigation/types';

// Icon component for year button - moved outside to avoid warnings
const CalendarIcon = () => <Icon name="calendar-month" size={20} color="#FFFFFF" />;

export default function MatchesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId } = useAppSelector(state => state.groups);
  const { firebaseUser } = useAppSelector(state => state.auth);

  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [allPlayers, setAllPlayers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'historico'>(
    new Date().getFullYear(),
  );
  // ID of the match the voting modal is open for — derived from live allMatches
  const [selectedVotingMatchId, setSelectedVotingMatchId] = useState<string | null>(null);
  // Whether the current user is admin or owner of the selected group
  const [isAdminOrOwner, setIsAdminOrOwner] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
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

  // Load group members once when group changes
  useEffect(() => {
    if (!selectedGroupId) {
      setAllPlayers([]);
      return;
    }

    getGroupMembersV2ByGroupId(selectedGroupId)
      .then(members => setAllPlayers(members))
      .catch(err => console.error('Error loading group members:', err));
  }, [selectedGroupId]);

  // Check if the current user is admin/owner so the edit button can be shown
  useEffect(() => {
    const checkRole = async () => {
      if (!selectedGroupId || !firebaseUser?.uid) {
        setIsAdminOrOwner(false);
        return;
      }
      try {
        const member = await getGroupMemberV2ByUserId(selectedGroupId, firebaseUser.uid);
        const role = member?.role ?? '';
        setIsAdminOrOwner(role === 'admin' || role === 'owner');
      } catch (err) {
        console.error('MatchesScreen: error checking role', err);
        setIsAdminOrOwner(false);
      }
    };

    checkRole();
  }, [selectedGroupId, firebaseUser?.uid]);

  // Subscribe to matches in real-time
  useEffect(() => {
    if (!selectedGroupId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToMatchesByGroupId(selectedGroupId, matchesData => {
      setAllMatches(matchesData);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [selectedGroupId]);

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

  const handleOpenYearSelector = useCallback(() => {
    bottomSheetRef.current?.expand();
  }, []);

  const handleSelectYear = useCallback((year: number | 'historico') => {
    setSelectedYear(year);
    bottomSheetRef.current?.close();
  }, []);

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

  const renderMatch = (match: Match) => {
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
            <View style={styles(theme).compactRow}>
              <Text variant="bodyMedium" style={styles(theme).compactTeam} numberOfLines={1}>
                Equipo 1
              </Text>
              <Text variant="titleMedium" style={[styles(theme).compactScore, { color: resultColor }]}>
                {match.goalsTeam1} – {match.goalsTeam2}
              </Text>
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

  if (!selectedGroupId) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No hay grupo seleccionado
        </Text>
        <Text variant="bodyMedium" style={styles(theme).errorSubtext}>
          Por favor, seleccioná un grupo desde la pantalla de Grupos
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
          <Button
            mode="contained"
            onPress={handleOpenYearSelector}
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

      {/* Year Selection Bottom Sheet */}
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
              keyExtractor={(item: { value: number | 'historico'; label: string }) => item.value.toString()}
              renderItem={({ item }: { item: { value: number | 'historico'; label: string } }) => (
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
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    gap: 12,
  },
  matchCount: {
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.9,
  },
  yearButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 8,
  },
  yearButtonContent: {
    paddingVertical: 4,
  },
  yearButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bottomSheetTitle: {
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  yearOptionButton: {
    marginVertical: 4,
  },
  yearOptionContent: {
    paddingVertical: 8,
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
    minWidth: 64,
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
});
