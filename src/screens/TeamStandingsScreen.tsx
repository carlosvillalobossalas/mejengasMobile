import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ScrollView, View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import {
  Text,
  Surface,
  Divider,
  Button,
  Avatar,
  Portal,
  useTheme,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';

import { useAppSelector } from '../app/hooks';
import {
  subscribeToTeamSeasonStatsByGroupId,
  type TeamSeasonStats,
} from '../repositories/teams/teamSeasonStatsRepository';
import { subscribeToTeamsByGroupId, type Team } from '../repositories/teams/teamsRepository';
import {
  subscribeToGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import TeamProfileModal from '../components/TeamProfileModal';

// Icon component outside render to avoid React warnings
const CalendarIcon = () => <Icon name="calendar-month" size={20} color="#FFFFFF" />;

/** Converts a hex color to an rgba string. */
const hexToRgba = (hex: string, alpha: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(33,150,243,${alpha})`;
  return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`;
};

type SortColumn = 'matches' | 'won' | 'draw' | 'lost' | 'goals' | 'goalsConceded' | 'points';

type StandingRow = TeamSeasonStats & { team: Team | undefined };

export default function TeamStandingsScreen() {
  const theme = useTheme();
  const { selectedGroupId } = useAppSelector(state => state.groups);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const teamProfileModalRef = useRef<BottomSheet>(null);

  const [allStats, setAllStats] = useState<TeamSeasonStats[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberV2[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'historico'>(
    new Date().getFullYear(),
  );
  const [sortBy, setSortBy] = useState<SortColumn>('points');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Subscribe to team season stats
  useEffect(() => {
    if (!selectedGroupId) {
      setAllStats([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToTeamSeasonStatsByGroupId(
      selectedGroupId,
      stats => {
        setAllStats(stats);
        setIsLoading(false);
      },
      err => {
        setError(err.message);
        setIsLoading(false);
      },
    );
    return () => unsubscribe();
  }, [selectedGroupId]);

  // Subscribe to group members for player names/photos in team profile
  useEffect(() => {
    if (!selectedGroupId) {
      setGroupMembers([]);
      return;
    }
    const unsubscribe = subscribeToGroupMembersV2ByGroupId(
      selectedGroupId,
      setGroupMembers,
      err => console.error('TeamStandingsScreen: members error', err),
    );
    return () => unsubscribe();
  }, [selectedGroupId]);

  // Subscribe to teams for names/colors/photos
  useEffect(() => {
    if (!selectedGroupId) {
      setTeams([]);
      return;
    }
    const unsubscribe = subscribeToTeamsByGroupId(
      selectedGroupId,
      setTeams,
      err => console.error('TeamStandingsScreen: teams error', err),
    );
    return () => unsubscribe();
  }, [selectedGroupId]);

  const teamsMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const options: Array<{ value: number | 'historico'; label: string }> = [
      { value: 'historico', label: 'Histórico' },
    ];
    for (let y = currentYear; y >= 2025; y--) {
      options.push({ value: y, label: y.toString() });
    }
    return options;
  }, []);

  const standings = useMemo((): StandingRow[] => {
    // Filter by selected year or aggregate for histórico
    let filtered: TeamSeasonStats[];

    if (selectedYear === 'historico') {
      // Aggregate all seasons per team
      const byTeam = new Map<string, TeamSeasonStats>();
      for (const s of allStats) {
        const existing = byTeam.get(s.teamId);
        if (existing) {
          existing.matches += s.matches;
          existing.won += s.won;
          existing.lost += s.lost;
          existing.draw += s.draw;
          existing.points += s.points;
          existing.goals += s.goals;
          existing.goalsConceded += s.goalsConceded;
        } else {
          // Clone so we don't mutate state
          byTeam.set(s.teamId, { ...s });
        }
      }
      filtered = Array.from(byTeam.values());
    } else {
      filtered = allStats.filter(s => s.season === selectedYear);
    }

    return filtered
      .map(s => ({ ...s, team: teamsMap.get(s.teamId) }))
      .sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const diff = sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
        if (diff !== 0) return diff;
        // Tiebreaker: goal difference desc
        return (b.goals - b.goalsConceded) - (a.goals - a.goalsConceded);
      });
  }, [allStats, teamsMap, selectedYear, sortBy, sortDirection]);

  const getYearLabel = (year: number | 'historico') =>
    yearOptions.find(o => o.value === year)?.label ?? year.toString();

  const handleSelectYear = useCallback(
    (year: number | 'historico') => {
      setSelectedYear(year);
      bottomSheetRef.current?.close();
    },
    [],
  );

  const handleSortPress = useCallback(
    (col: SortColumn) => {
      if (sortBy === col) {
        setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortBy(col);
        setSortDirection('desc');
      }
    },
    [sortBy],
  );

  const renderBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  if (!selectedGroupId) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No hay grupo seleccionado
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>
          Cargando tabla...
        </Text>
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

  return (
    <View style={styles(theme).container}>
      {/* Header */}
      <Surface style={styles(theme).header} elevation={2}>
        <View style={styles(theme).headerContent}>
          <Text variant="bodySmall" style={styles(theme).teamCount}>
            {standings.length} equipo{standings.length !== 1 ? 's' : ''}
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

      <ScrollView
        style={styles(theme).scrollView}
        contentContainerStyle={styles(theme).contentContainer}
      >
        {standings.length === 0 ? (
          <View style={styles(theme).emptyState}>
            <Icon name="shield-star" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={styles(theme).emptyText}>
              Sin datos para esta temporada
            </Text>
            <Text variant="bodyMedium" style={styles(theme).emptySubtext}>
              Los resultados aparecerán aquí cuando se registren partidos
            </Text>
          </View>
        ) : (
          <>
            {/* Column header */}
            <View style={styles(theme).columnHeader}>
              <View style={styles(theme).colRank}>
                <Text style={styles(theme).colLabel}>#</Text>
              </View>
              <View style={styles(theme).colTeam}>
                <Text style={styles(theme).colLabel}>Equipo</Text>
              </View>
              {(
                [
                  { col: 'matches', label: 'PJ' },
                  { col: 'won', label: 'G' },
                  { col: 'draw', label: 'E' },
                  { col: 'lost', label: 'P' },
                  { col: 'goals', label: 'GF' },
                  { col: 'goalsConceded', label: 'GC' },
                ] as Array<{ col: SortColumn; label: string }>
              ).map(({ col, label }) => (
                <TouchableOpacity
                  key={col}
                  style={[styles(theme).colStat, styles(theme).sortHeader]}
                  onPress={() => handleSortPress(col)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles(theme).colLabel, sortBy === col && styles(theme).colLabelActive]}>
                    {label}
                  </Text>
                  {sortBy === col && (
                    <Icon
                      name={sortDirection === 'desc' ? 'arrow-down' : 'arrow-up'}
                      size={9}
                      color={theme.colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles(theme).colStatWide, styles(theme).sortHeader]}
                onPress={() => handleSortPress('points')}
                activeOpacity={0.7}
              >
                <Text style={[styles(theme).colLabel, sortBy === 'points' && styles(theme).colLabelActive]}>
                  Pts
                </Text>
                {sortBy === 'points' && (
                  <Icon
                    name={sortDirection === 'desc' ? 'arrow-down' : 'arrow-up'}
                    size={9}
                    color={theme.colors.primary}
                  />
                )}
              </TouchableOpacity>
            </View>

            {standings.map((row, index) => {
              const color = row.team?.color ?? theme.colors.primary;
              const isFirst = index === 0;

              return (
                <TouchableOpacity
                  key={row.teamId}
                  style={[
                    styles(theme).row,
                    { backgroundColor: isFirst ? hexToRgba(color, 0.1) : '#FFFFFF' },
                  ]}
                  onPress={() => {
                    setSelectedTeamId(row.teamId);
                    teamProfileModalRef.current?.expand();
                  }}
                  activeOpacity={0.75}
                >
                  {/* Rank */}
                  <View style={styles(theme).colRank}>
                    {isFirst ? (
                      <Icon name="trophy" size={18} color="#FFB300" />
                    ) : (
                      <Text style={styles(theme).rankText}>{index + 1}</Text>
                    )}
                  </View>

                  {/* Team name + avatar */}
                  <View style={styles(theme).colTeam}>
                    {row.team?.photoUrl ? (
                      <Avatar.Image
                        size={28}
                        source={{ uri: row.team.photoUrl }}
                        style={{ backgroundColor: hexToRgba(color, 0.15) }}
                      />
                    ) : (
                      <Avatar.Icon
                        size={28}
                        icon="shield"
                        style={{ backgroundColor: hexToRgba(color, 0.2) }}
                        color={color}
                      />
                    )}
                    <Text
                      variant="bodyMedium"
                      style={[styles(theme).teamName, { color }]}
                      numberOfLines={1}
                    >
                      {row.team?.name ?? row.teamId}
                    </Text>
                  </View>

                  {/* Stats */}
                  <Text style={[styles(theme).statText, styles(theme).colStat]}>{row.matches}</Text>
                  <Text style={[styles(theme).statText, styles(theme).colStat]}>{row.won}</Text>
                  <Text style={[styles(theme).statText, styles(theme).colStat]}>{row.draw}</Text>
                  <Text style={[styles(theme).statText, styles(theme).colStat]}>{row.lost}</Text>
                  <Text style={[styles(theme).statText, styles(theme).colStat]}>{row.goals}</Text>
                  <Text style={[styles(theme).statText, styles(theme).colStat]}>{row.goalsConceded}</Text>
                  <Text
                    style={[
                      styles(theme).ptsText,
                      styles(theme).colStatWide,
                      { color },
                    ]}
                  >
                    {row.points}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Year selector bottom sheet */}
      <Portal>
          <TeamProfileModal
            teamId={selectedTeamId}
            allStats={allStats}
            teamsMap={teamsMap}
            groupMembers={groupMembers}
            bottomSheetRef={teamProfileModalRef}
          />
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
    </View>
  );
}

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    scrollView: { flex: 1 },
    contentContainer: { paddingTop: 8, paddingBottom: 32, paddingHorizontal: 4 },
    header: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    headerContent: { gap: 12 },
    teamCount: { color: '#FFFFFF', textAlign: 'center', opacity: 0.9 },
    yearButton: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      marginVertical: 8,
    },
    yearButtonContent: { paddingVertical: 4 },
    yearButtonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    columnHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 8,
      marginBottom: 4,
    },
    colLabel: {
      fontSize: 11,
      fontWeight: 'bold',
      color: theme.colors.onSurfaceVariant,
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderRadius: 10,
      marginBottom: 6,
    },
    colRank: {
      width: 24,
      alignItems: 'center',
    },
    colTeam: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingRight: 4,
    },
    colStat: {
      width: 26,
      textAlign: 'center',
    },
    colStatWide: {
      width: 30,
      textAlign: 'center',
    },
    rankText: {
      fontSize: 14,
      fontWeight: 'bold',
      color: theme.colors.onSurfaceVariant,
    },
    teamName: {
      fontWeight: '600',
      flex: 1,
    },
    statText: {
      fontSize: 14,
      color: '#444',
    },
    ptsText: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    emptyState: {
      padding: 48,
      alignItems: 'center',
      gap: 16,
    },
    emptyText: { textAlign: 'center', color: '#666' },
    emptySubtext: { textAlign: 'center', color: '#999' },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 16,
    },
    loadingText: { color: '#666' },
    errorText: { textAlign: 'center', color: '#F44336' },
    bottomSheetContent: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    bottomSheetTitle: { textAlign: 'center', marginBottom: 16, fontWeight: 'bold' },
    yearOptionButton: { marginVertical: 4 },
    yearOptionContent: { paddingVertical: 8 },
    sortHeader: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    colLabelActive: {
      color: theme.colors.primary,
    },
  });
