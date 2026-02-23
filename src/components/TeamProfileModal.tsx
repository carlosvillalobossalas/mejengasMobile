import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Avatar,
  Divider,
  useTheme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Team } from '../repositories/teams/teamsRepository';
import {
  type TeamSeasonStats,
} from '../repositories/teams/teamSeasonStatsRepository';
import {
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamProfileModalProps = {
  teamId: string | null;
  allStats: TeamSeasonStats[];
  teamsMap: Map<string, Team>;
  groupMembers: GroupMemberV2[];
  bottomSheetRef: React.RefObject<BottomSheet | null>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const hexToRgba = (hex: string, alpha: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(33,150,243,${alpha})`;
  return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`;
};

const getInitials = (name: string): string =>
  name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

// Position display order
const POSITION_ORDER: Record<string, number> = {
  POR: 0,
  DEF: 1,
  MED: 2,
  DEL: 3,
};
const POSITION_LABEL: Record<string, string> = {
  POR: 'POR',
  DEF: 'DEF',
  MED: 'MED',
  DEL: 'DEL',
};
const POSITION_COLOR: Record<string, string> = {
  POR: '#9C27B0',
  DEF: '#2196F3',
  MED: '#4CAF50',
  DEL: '#F44336',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function TeamProfileModal({
  teamId,
  allStats,
  teamsMap,
  groupMembers,
  bottomSheetRef,
}: TeamProfileModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Derive team and its stats from props
  const team = teamId ? teamsMap.get(teamId) ?? null : null;

  const teamStats = teamId
    ? allStats.filter(s => s.teamId === teamId)
    : [];

  // Aggregate histórico totals
  const historicTotals = teamStats.reduce(
    (acc, s) => ({
      matches: acc.matches + s.matches,
      won: acc.won + s.won,
      draw: acc.draw + s.draw,
      lost: acc.lost + s.lost,
      points: acc.points + s.points,
      goals: acc.goals + s.goals,
      goalsConceded: acc.goalsConceded + s.goalsConceded,
    }),
    { matches: 0, won: 0, draw: 0, lost: 0, points: 0, goals: 0, goalsConceded: 0 },
  );

  // Members that belong to this team
  const teamMembersMap = new Map<string, GroupMemberV2>(
    groupMembers.map(m => [m.id, m]),
  );
  const teamPlayers = (team?.players ?? [])
    .slice()
    .sort(
      (a, b) =>
        (POSITION_ORDER[a.defaultPosition] ?? 99) -
        (POSITION_ORDER[b.defaultPosition] ?? 99),
    );

  // Sort seasons descending
  const sortedSeasons = [...teamStats].sort((a, b) => b.season - a.season);

  const renderBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    [],
  );

  const color = team?.color ?? theme.colors.primary;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['85%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      topInset={insets.top}
    >
      <BottomSheetScrollView style={styles.container}>
        {!team && (
          <View style={styles.centerContainer}>
            <Icon name="alert-circle" size={48} color={theme.colors.error} />
            <Text style={styles.errorText}>Equipo no encontrado</Text>
          </View>
        )}

        {team && (
          <>
            {/* ── Header ── */}
            <View style={[styles.profileSection, { backgroundColor: hexToRgba(color, 0.08) }]}>
              {team.photoUrl ? (
                <Avatar.Image size={88} source={{ uri: team.photoUrl }} style={styles.avatar} />
              ) : (
                <Avatar.Icon
                  size={88}
                  icon="shield"
                  style={[styles.avatar, { backgroundColor: hexToRgba(color, 0.2) }]}
                  color={color}
                />
              )}
              <Text style={[styles.teamName, { color }]}>{team.name}</Text>
            </View>

            <Divider />

            {/* ── Histórico totals ── */}
            {teamStats.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="chart-bar" size={20} color={theme.colors.primary} />
                  <Text style={styles.sectionTitle}>Histórico Total</Text>
                </View>

                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Icon name="soccer" size={28} color="#2196F3" />
                    <Text style={styles.statValue}>{historicTotals.goals}</Text>
                    <Text style={styles.statLabel}>Goles</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="shield-outline" size={28} color="#F44336" />
                    <Text style={styles.statValue}>{historicTotals.goalsConceded}</Text>
                    <Text style={styles.statLabel}>Goles recibidos</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="tshirt-crew" size={28} color="#FF9800" />
                    <Text style={styles.statValue}>
                      {historicTotals.won}-{historicTotals.draw}-{historicTotals.lost}
                    </Text>
                    <Text style={styles.statLabel}>V-E-D</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="calendar-check" size={28} color="#9C27B0" />
                    <Text style={styles.statValue}>{historicTotals.matches}</Text>
                    <Text style={styles.statLabel}>Partidos</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="star-circle" size={28} color="#FFB300" />
                    <Text style={[styles.statValue, { color }]}>{historicTotals.points}</Text>
                    <Text style={styles.statLabel}>Puntos</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon
                      name="delta"
                      size={28}
                      color={
                        historicTotals.goals - historicTotals.goalsConceded >= 0
                          ? '#4CAF50'
                          : '#F44336'
                      }
                    />
                    <Text
                      style={[
                        styles.statValue,
                        {
                          color:
                            historicTotals.goals - historicTotals.goalsConceded >= 0
                              ? '#4CAF50'
                              : '#F44336',
                        },
                      ]}
                    >
                      {historicTotals.goals - historicTotals.goalsConceded > 0
                        ? `+${historicTotals.goals - historicTotals.goalsConceded}`
                        : historicTotals.goals - historicTotals.goalsConceded}
                    </Text>
                    <Text style={styles.statLabel}>Diferencia de goles</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── Per-season stats ── */}
            {sortedSeasons.length > 0 && (
              <>
                <Divider style={styles.sectionDivider} />
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Icon name="calendar-star" size={20} color={theme.colors.primary} />
                    <Text style={styles.sectionTitle}>Por Temporada</Text>
                  </View>

                  {sortedSeasons.map(s => (
                    <View key={s.id} style={styles.seasonCard}>
                      <View style={styles.seasonCardHeader}>
                        <Text style={[styles.seasonYear, { color }]}>Temporada {s.season}</Text>
                        <View style={[styles.ptsChip, { backgroundColor: hexToRgba(color, 0.15) }]}>
                          <Text style={[styles.ptsChipText, { color }]}>{s.points} pts</Text>
                        </View>
                      </View>

                      {/* Mini stat row */}
                      <View style={styles.seasonStatsRow}>
                        <View style={styles.seasonStat}>
                          <Text style={styles.seasonStatValue}>{s.matches}</Text>
                          <Text style={styles.seasonStatLabel}>PJ</Text>
                        </View>
                        <View style={styles.seasonStat}>
                          <Text style={[styles.seasonStatValue, { color: '#4CAF50' }]}>{s.won}</Text>
                          <Text style={styles.seasonStatLabel}>G</Text>
                        </View>
                        <View style={styles.seasonStat}>
                          <Text style={styles.seasonStatValue}>{s.draw}</Text>
                          <Text style={styles.seasonStatLabel}>E</Text>
                        </View>
                        <View style={styles.seasonStat}>
                          <Text style={[styles.seasonStatValue, { color: '#F44336' }]}>{s.lost}</Text>
                          <Text style={styles.seasonStatLabel}>P</Text>
                        </View>
                        <View style={styles.seasonStat}>
                          <Text style={styles.seasonStatValue}>{s.goals}</Text>
                          <Text style={styles.seasonStatLabel}>GF</Text>
                        </View>
                        <View style={styles.seasonStat}>
                          <Text style={styles.seasonStatValue}>{s.goalsConceded}</Text>
                          <Text style={styles.seasonStatLabel}>GC</Text>
                        </View>
                        <View style={styles.seasonStat}>
                          <Text
                            style={[
                              styles.seasonStatValue,
                              {
                                color:
                                  s.goals - s.goalsConceded >= 0 ? '#4CAF50' : '#F44336',
                              },
                            ]}
                          >
                            {s.goals - s.goalsConceded > 0
                              ? `+${s.goals - s.goalsConceded}`
                              : s.goals - s.goalsConceded}
                          </Text>
                          <Text style={styles.seasonStatLabel}>DG</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── Players ── */}
            {teamPlayers.length > 0 && (
              <>
                <Divider style={styles.sectionDivider} />
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Icon name="account-group" size={20} color={theme.colors.primary} />
                    <Text style={styles.sectionTitle}>
                      Jugadores ({teamPlayers.length})
                    </Text>
                  </View>

                  {teamPlayers.map(tp => {
                    const member = teamMembersMap.get(tp.groupMemberId);
                    const posColor = POSITION_COLOR[tp.defaultPosition] ?? theme.colors.primary;

                    return (
                      <View key={tp.groupMemberId} style={styles.playerRow}>
                        {member?.photoUrl ? (
                          <Avatar.Image size={36} source={{ uri: member.photoUrl }} />
                        ) : (
                          <Avatar.Text
                            size={36}
                            label={getInitials(member?.displayName ?? '?')}
                            style={{ backgroundColor: hexToRgba(color, 0.2) }}
                            color={color}
                          />
                        )}
                        <Text style={styles.playerName} numberOfLines={1}>
                          {member?.displayName ?? tp.groupMemberId}
                        </Text>
                        <View style={[styles.positionBadge, { backgroundColor: hexToRgba(posColor, 0.15) }]}>
                          <Text style={[styles.positionText, { color: posColor }]}>
                            {POSITION_LABEL[tp.defaultPosition] ?? tp.defaultPosition}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Empty state when no stats */}
            {teamStats.length === 0 && (
              <View style={styles.emptyContainer}>
                <Icon name="information-outline" size={48} color={theme.colors.onSurfaceDisabled} />
                <Text style={styles.emptyText}>
                  No hay estadísticas disponibles todavía
                </Text>
              </View>
            )}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centerContainer: { padding: 40, alignItems: 'center' },
  errorText: { marginTop: 16, fontSize: 16, textAlign: 'center', color: '#F44336' },

  // Header
  profileSection: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  avatar: { marginBottom: 4 },
  teamName: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  colorBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  colorLabel: { fontSize: 12, color: '#888' },

  // Sections
  section: { padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  sectionDivider: { marginVertical: 4 },

  // Stats grid (historic)
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 8,
  },
  statValue: { fontSize: 20, fontWeight: 'bold', marginTop: 6, marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#757575' },

  // Season cards
  seasonCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  seasonCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  seasonYear: { fontSize: 15, fontWeight: 'bold' },
  ptsChip: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  ptsChipText: { fontSize: 13, fontWeight: 'bold' },
  seasonStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seasonStat: { alignItems: 'center', flex: 1 },
  seasonStatValue: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  seasonStatLabel: { fontSize: 10, color: '#888', marginTop: 2 },

  // Players
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  playerName: { flex: 1, fontSize: 14, color: '#333' },
  positionBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  positionText: { fontSize: 12, fontWeight: 'bold' },

  // Empty
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { marginTop: 16, fontSize: 14, color: '#757575', textAlign: 'center' },
});
