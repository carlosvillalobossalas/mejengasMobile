import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Divider } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { MatchByTeamsPlayer } from '../repositories/matches/matchesByTeamsRepository';
import type { Team } from '../repositories/teams/teamsRepository';
import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';

type Props = {
  players1: MatchByTeamsPlayer[];
  players2: MatchByTeamsPlayer[];
  team1: Team | undefined;
  team2: Team | undefined;
  groupMembers: GroupMemberV2[];
  mvpGroupMemberId: string | null;
};

const POSITION_ORDER: Record<MatchByTeamsPlayer['position'], number> = {
  POR: 0,
  DEF: 1,
  MED: 2,
  DEL: 3,
};

const sortByPosition = (players: MatchByTeamsPlayer[]) =>
  [...players].sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position]);

const splitRoster = (players: MatchByTeamsPlayer[]) => ({
  starters: sortByPosition(players.filter(p => !p.isSub)),
  subs: sortByPosition(players.filter(p => p.isSub)),
});

// ─── Player row ───────────────────────────────────────────────────────────────

type PlayerRowProps = {
  player: MatchByTeamsPlayer;
  groupMembers: GroupMemberV2[];
  mvpGroupMemberId: string | null;
  accentColor: string;
};

function PlayerRow({ player, groupMembers, mvpGroupMemberId, accentColor }: PlayerRowProps) {
  const member = groupMembers.find(m => m.id === player.groupMemberId);
  const displayName = member?.displayName ?? 'Por asignar';
  const isMvp = !!player.groupMemberId && mvpGroupMemberId === player.groupMemberId;
  const hasStats = player.goals > 0 || player.assists > 0 || player.ownGoals > 0;

  return (
    <View style={styles.playerRow}>
      <View style={styles.leftSection}>
        <View style={[styles.positionBadge, { backgroundColor: accentColor }]}>
          <Text style={styles.positionText}>{player.position}</Text>
        </View>
        <Text variant="bodyMedium" style={styles.playerName} numberOfLines={1}>
          {displayName}
        </Text>
        {player.isSub && (
          <View style={styles.subBadge}>
            <Text style={styles.subText}>SUP</Text>
          </View>
        )}
        {isMvp && <Icon name="star" size={16} color="#FFD700" />}
      </View>

      {hasStats && (
        <View style={styles.statsRow}>
          {player.goals > 0 && (
            <View style={styles.statChip}>
              <Icon name="soccer" size={13} color={accentColor} />
              <Text style={[styles.statValue, { color: accentColor }]}>{player.goals}</Text>
            </View>
          )}
          {player.assists > 0 && (
            <View style={styles.statChip}>
              <Icon name="shoe-cleat" size={12} color="#666" />
              <Text style={styles.statValueGrey}>{player.assists}</Text>
            </View>
          )}
          {player.ownGoals > 0 && (
            <View style={styles.statChip}>
              <Icon name="soccer" size={13} color="#D32F2F" />
              <Text style={styles.statValueRed}>{player.ownGoals}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MatchByTeamsPlayersList({
  players1,
  players2,
  team1,
  team2,
  groupMembers,
  mvpGroupMemberId,
}: Props) {
  const t1Color = team1?.color ?? '#2196F3';
  const t2Color = team2?.color ?? '#F44336';

  const { starters: starters1, subs: subs1 } = splitRoster(players1);
  const { starters: starters2, subs: subs2 } = splitRoster(players2);

  const renderTeamSection = (
    starters: MatchByTeamsPlayer[],
    subs: MatchByTeamsPlayer[],
    color: string,
    teamName: string,
  ) => (
    <>
      {/* Team header */}
      <View style={[styles.teamHeader, { backgroundColor: color + '22' }]}>
        <View style={[styles.colorDot, { backgroundColor: color }]} />
        <Text variant="titleSmall" style={[styles.teamTitle, { color }]}>
          {teamName}
        </Text>
      </View>

      {/* Starters */}
      {starters.map((p, idx) => (
        <PlayerRow
          key={`${teamName}_starter_${p.groupMemberId || 'empty'}_${idx}`}
          player={p}
          groupMembers={groupMembers}
          mvpGroupMemberId={mvpGroupMemberId}
          accentColor={color}
        />
      ))}

      {/* Subs */}
      {subs.length > 0 && (
        <>
          <View style={[styles.subsHeader, { borderTopColor: color + '44' }]}>
            <Icon name="swap-horizontal" size={13} color={color} />
            <Text style={[styles.subsTitle, { color }]}>Suplentes</Text>
          </View>
          {subs.map((p, idx) => (
            <PlayerRow
              key={`${teamName}_sub_${p.groupMemberId || 'empty'}_${idx}`}
              player={p}
              groupMembers={groupMembers}
              mvpGroupMemberId={mvpGroupMemberId}
              accentColor={color}
            />
          ))}
        </>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {renderTeamSection(starters1, subs1, t1Color, team1?.name ?? 'Equipo 1')}

      <Divider style={styles.divider} />

      {renderTeamSection(starters2, subs2, t2Color, team2?.name ?? 'Equipo 2')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    overflow: 'hidden',
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  teamTitle: {
    fontWeight: 'bold',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  positionBadge: {
    width: 38,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 10,
  },
  playerName: {
    flex: 1,
  },
  subBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  subText: {
    color: '#388E3C',
    fontSize: 9,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  statValueGrey: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#666',
  },
  statValueRed: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#D32F2F',
  },
  divider: {
    marginVertical: 4,
  },
  subsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    marginTop: 4,
  },
  subsTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
