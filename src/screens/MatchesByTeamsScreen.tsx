import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { ScrollView, View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import {
  Text,
  Surface,
  Divider,
  Button,
  Portal,
  useTheme,
  MD3Theme,
  IconButton,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, {
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';

import { useAppSelector } from '../app/hooks';
import { useMatchesByTeams } from '../hooks/useMatchesByTeams';
import { useMvpVoting } from '../hooks/useMvpVoting';
import MatchByTeamsCard from '../components/MatchByTeamsCard';
import MvpVotingModal from '../components/MvpVotingModal';
import { castMvpVoteByTeams } from '../repositories/matches/matchesByTeamsRepository';
import { tapScheduledSlotInMatchByTeams } from '../repositories/matches/matchSignupsRepository';
import type { AppDrawerParamList } from '../navigation/types';

export default function MatchesByTeamsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [selectedVotingMatchId, setSelectedVotingMatchId] = useState<string | null>(null);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string | 'all'>('all');
  const filtersSheetRef = useRef<BottomSheet>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  // One ref per card — used to measure position in scroll content after collapse
  const cardRefs = useRef<Map<string, View | null>>(new Map());

  const eligibleGroups = useMemo(
    () => groups.filter(group => group.hasFixedTeams && !group.isChallengeMode),
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

  const {
    matches,
    teamsMap,
    groupMembers,
    isLoading,
    error,
    selectedYear,
    setSelectedYear,
    yearOptions,
  } = useMatchesByTeams(targetGroupIds);

  const {
    currentUserGroupMemberId,
    canVoteInMatch,
    castVote,
    isVoting,
    voteError,
    clearVoteError,
  } = useMvpVoting(selectedGroupId, firebaseUser?.uid ?? null, castMvpVoteByTeams);

  const selectedVotingMatch = useMemo(
    () => (selectedVotingMatchId ? matches.find(m => m.id === selectedVotingMatchId) ?? null : null),
    [selectedVotingMatchId, matches],
  );

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
        // Collapse first, then wait for layout to settle before scrolling
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
                () => {},
              );
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
    },
    [setSelectedYear],
  );

  const getYearLabel = (year: number | 'historico') => {
    const option = yearOptions.find(o => o.value === year);
    return option?.label ?? year.toString();
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
            onPress={() => navigation.navigate('AddMatchTeams')}
          />
        </View>
      ),
    });
  }, [navigation, theme]);

  const renderBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  if (eligibleGroups.length === 0) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No tienes grupos por equipos
        </Text>
        <Text variant="bodyMedium" style={styles(theme).errorSubtext}>
          Únete o crea un grupo con equipos fijos para ver partidos.
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

      {/* Matches list */}
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
          matches.map(match => (
            <View
              key={match.id}
              ref={el => { cardRefs.current.set(match.id, el); }}
            >
              <MatchByTeamsCard
                match={match}
                groupName={selectedGroupFilter === 'all' ? groupsById.get(match.groupId)?.name : undefined}
                team1={teamsMap.get(match.team1Id)}
                team2={teamsMap.get(match.team2Id)}
                groupMembers={groupMembers}
                isExpanded={expandedMatchId === match.id}
                onToggle={() => handleToggle(match.id)}
                canVote={canVoteInMatch(match)}
                hasVoted={!!(currentUserGroupMemberId && match.mvpVotes[currentUserGroupMemberId])}
                onVotePress={() => setSelectedVotingMatchId(match.id)}
                currentUserGroupMemberId={currentUserGroupMemberId}
                onSlotPress={async ({ team, slotIndex }) => {
                  if (match.status !== 'scheduled' || !firebaseUser?.uid) return;

                  try {
                    await tapScheduledSlotInMatchByTeams({
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
            </View>
          ))
        )}
      </ScrollView>

      {/* Filters bottom sheet */}
      <Portal>
        <BottomSheet
          ref={filtersSheetRef}
          index={-1}
          snapPoints={['65%']}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
        >
          <View style={styles(theme).bottomSheetContent}>
            <Text variant="titleMedium" style={styles(theme).bottomSheetTitle}>
              Filtros
            </Text>
            <Text variant="labelMedium" style={styles(theme).sheetSectionTitle}>
              Temporada
            </Text>
            {yearOptions.map(item => (
              <Button
                key={item.value.toString()}
                mode={selectedYear === item.value ? 'contained' : 'text'}
                onPress={() => handleSelectYear(item.value)}
                style={styles(theme).yearOptionButton}
                contentStyle={styles(theme).yearOptionContent}
              >
                {item.label}
              </Button>
            ))}

            <Text variant="labelMedium" style={styles(theme).sheetSectionTitle}>
              Grupo
            </Text>
            {groupFilterOptions.map(item => (
                <Button
                  key={item.value}
                  mode={selectedGroupFilter === item.value ? 'contained' : 'text'}
                  onPress={() => {
                    setSelectedGroupFilter(item.value);
                  }}
                  style={styles(theme).yearOptionButton}
                  contentStyle={styles(theme).yearOptionContent}
                >
                  {item.label}
                </Button>
            ))}

            <Button
              mode="contained"
              onPress={() => filtersSheetRef.current?.close()}
              style={styles(theme).applyFiltersButton}
            >
              Aplicar
            </Button>
          </View>
        </BottomSheet>
      </Portal>

      {/* MVP voting modal */}
      <MvpVotingModal
        visible={selectedVotingMatchId !== null}
        match={selectedVotingMatch}
        allPlayers={groupMembers}
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

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
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
      marginBottom: 16,
      fontWeight: 'bold',
    },
    sheetSectionTitle: {
      marginTop: 8,
      marginBottom: 6,
      color: theme.colors.onSurfaceVariant,
      fontWeight: '700',
    },
    yearOptionButton: {
      marginVertical: 4,
    },
    yearOptionContent: {
      paddingVertical: 8,
    },
    applyFiltersButton: {
      marginTop: 12,
    },
    emptyState: {
      padding: 48,
      alignItems: 'center',
      gap: 16,
    },
    emptyText: {
      textAlign: 'center',
      color: '#666',
    },
    emptySubtext: {
      textAlign: 'center',
      color: '#999',
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
  });
