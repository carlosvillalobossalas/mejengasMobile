import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  Surface,
  Text,
  useTheme,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { ChallengeMatch, ChallengeMatchPlayer } from '../repositories/matches/matchesByChallengeRepository';
import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  match: ChallengeMatch;
  groupName: string;
  groupMembers: GroupMemberV2[];
  isExpanded: boolean;
  onToggle: () => void;
  /** Whether the current user can vote for MVP in this match */
  canVote?: boolean;
  /** Whether the current user has already voted */
  hasVoted?: boolean;
  onVotePress?: () => void;
  /** Whether to show edit button (admins only) */
  canEdit?: boolean;
  onEditPress?: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POSITION_ORDER: Record<ChallengeMatchPlayer['position'], number> = {
  POR: 0,
  DEF: 1,
  MED: 2,
  DEL: 3,
};

const sortByPosition = (players: ChallengeMatchPlayer[]) =>
  [...players].sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position]);

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const weekday = date.toLocaleDateString('es-ES', { weekday: 'long' });
  const day = date.getDate();
  const month = date.toLocaleDateString('es-ES', { month: 'long' });
  const year = date.getFullYear();
  return `${weekday}, ${day} de ${month} de ${year}`;
};

const formatDateWithTime = (dateString: string): string => {
  const date = new Date(dateString);
  const datePart = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart}, ${timePart}`;
};

// ─── Player row ───────────────────────────────────────────────────────────────

type PlayerRowProps = {
  player: ChallengeMatchPlayer;
  groupMembers: GroupMemberV2[];
  mvpGroupMemberId: string | null;
  accentColor: string;
  theme: MD3Theme;
};

function PlayerRow({ player, groupMembers, mvpGroupMemberId, accentColor, theme: t }: PlayerRowProps) {
  const member = groupMembers.find(m => m.id === player.groupMemberId);
  const displayName = member?.displayName ?? 'Desconocido';
  const isMvp = mvpGroupMemberId === player.groupMemberId;
  const hasStats = player.goals > 0 || player.assists > 0 || player.ownGoals > 0;

  return (
    <View style={playerStyles(t).row}>
      <View style={playerStyles(t).left}>
        <View style={[playerStyles(t).positionBadge, { backgroundColor: accentColor }]}>
          <Text style={playerStyles(t).positionText}>{player.position}</Text>
        </View>
        <Text variant="bodyMedium" style={playerStyles(t).name} numberOfLines={1}>
          {displayName}
        </Text>
        {player.isSub && (
          <View style={playerStyles(t).subBadge}>
            <Text style={playerStyles(t).subText}>SUP</Text>
          </View>
        )}
        {isMvp && <Icon name="star" size={16} color="#FFD700" />}
      </View>
      {hasStats && (
        <View style={playerStyles(t).stats}>
          {player.goals > 0 && (
            <View style={playerStyles(t).stat}>
              <Icon name="soccer" size={13} color={accentColor} />
              <Text style={[playerStyles(t).statVal, { color: accentColor }]}>{player.goals}</Text>
            </View>
          )}
          {player.assists > 0 && (
            <View style={playerStyles(t).stat}>
              <Icon name="shoe-cleat" size={12} color="#666" />
              <Text style={playerStyles(t).statGrey}>{player.assists}</Text>
            </View>
          )}
          {player.ownGoals > 0 && (
            <View style={playerStyles(t).stat}>
              <Icon name="close-circle-outline" size={13} color="#E57373" />
              <Text style={playerStyles(t).statRed}>{player.ownGoals}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChallengeMatchCard({
  match,
  groupName,
  groupMembers,
  isExpanded,
  onToggle,
  canVote = false,
  hasVoted = false,
  onVotePress,
  canEdit = false,
  onEditPress,
}: Props) {
  const theme = useTheme();

  const teamColor = theme.colors.primary;
  const opponentColor = theme.colors.secondary;

  const teamWon = match.goalsTeam > match.goalsOpponent;
  const opponentWon = match.goalsOpponent > match.goalsTeam;
  const isDraw = match.goalsTeam === match.goalsOpponent;

  const resultLabel = teamWon
    ? '¡Victoria!'
    : opponentWon
      ? 'Derrota'
      : 'Empate';

  const resultColor = isDraw ? '#757575' : teamWon ? '#388E3C' : '#D32F2F';

  const isScheduled = match.status === 'scheduled';
  const isCancelled = match.status === 'cancelled';

  const sortedPlayers = sortByPosition(match.players);
  const starters = sortedPlayers.filter(p => !p.isSub && p.groupMemberId !== null);
  const subs = sortedPlayers.filter(p => p.isSub && p.groupMemberId !== null);

  const opponentLabel = match.opponentName.trim() || 'Rival';

  return (
    <Card style={styles(theme).card} onPress={onToggle}>
      <Card.Content style={styles(theme).cardContent}>
        {/* Date */}
        <View style={styles(theme).dateRow}>
          <Icon name="calendar" size={15} color={theme.colors.onSurfaceVariant} />
          <Text variant="labelMedium" style={styles(theme).dateText}>
            {isScheduled ? formatDateWithTime(match.date) : formatDate(match.date)}
          </Text>
          {isScheduled && (
            <Chip compact style={styles(theme).scheduledChip} textStyle={styles(theme).scheduledChipText}>
              Programado
            </Chip>
          )}
          {isCancelled && (
            <Chip compact style={styles(theme).cancelledChip} textStyle={styles(theme).cancelledChipText}>
              Cancelado
            </Chip>
          )}
        </View>

        {/* Score row */}
        <View style={styles(theme).scoreRow}>
          {/* Group's team */}
          <View style={styles(theme).teamBlock}>
            <Avatar.Icon
              size={52}
              icon="shield-account"
              style={{ backgroundColor: `${teamColor}30` }}
              color={teamColor}
            />
            <Text variant="titleSmall" style={[styles(theme).teamName, { color: teamColor }]} numberOfLines={2}>
              {groupName}
            </Text>
          </View>

          {/* Scores */}
          <View style={styles(theme).scoresBlock}>
            <Surface style={[styles(theme).scoreBubble, { backgroundColor: `${teamColor}25` }]} elevation={2}>
              <Text variant="displaySmall" style={[styles(theme).scoreText, { color: teamColor }]}>
                {match.goalsTeam}
              </Text>
            </Surface>
            <Text variant="titleMedium" style={styles(theme).vsText}>
              VS
            </Text>
            <Surface style={[styles(theme).scoreBubble, { backgroundColor: `${opponentColor}25` }]} elevation={2}>
              <Text variant="displaySmall" style={[styles(theme).scoreText, { color: opponentColor }]}>
                {match.goalsOpponent}
              </Text>
            </Surface>
          </View>

          {/* Opponent */}
          <View style={[styles(theme).teamBlock, styles(theme).teamBlockRight]}>
            <Avatar.Icon
              size={52}
              icon="shield-outline"
              style={{ backgroundColor: `${opponentColor}20` }}
              color={opponentColor}
            />
            <Text variant="titleSmall" style={[styles(theme).teamName, { color: opponentColor }]} numberOfLines={2}>
              {opponentLabel}
            </Text>
          </View>
        </View>

        {/* Result chip (only for played / cancelled) */}
        {!isScheduled && (
          <View style={styles(theme).resultRow}>
            <Chip
              style={[styles(theme).resultChip, { backgroundColor: isCancelled ? '#BDBDBD' : resultColor }]}
              textStyle={styles(theme).resultChipText}
            >
              {isCancelled ? 'Cancelado' : resultLabel}
            </Chip>
          </View>
        )}

        {/* MVP vote button */}
        {canVote && (
          <Button
            mode={hasVoted ? 'outlined' : 'contained-tonal'}
            icon={() => <Icon name="star-circle-outline" color="white" size={16} />}
            onPress={onVotePress}
            style={styles(theme).voteButton}
            contentStyle={styles(theme).voteButtonContent}
            compact
          >
            <Text style={{ color: theme.colors.onSecondary }}>
              {hasVoted ? 'Cambiar voto' : 'Votar MVP'}
            </Text>
          </Button>
        )}

        <Divider style={styles(theme).divider} />

        {/* Expanded: players + actions */}
        {isExpanded && (
          <>
            {/* Players list */}
            <View style={styles(theme).sectionHeader}>
              <Icon name="account-group" size={20} color={theme.colors.primary} />
              <Text variant="titleMedium" style={styles(theme).sectionTitle}>
                Jugadores
              </Text>
            </View>

            {starters.map(player => (
              <PlayerRow
                key={player.groupMemberId}
                player={player}
                groupMembers={groupMembers}
                mvpGroupMemberId={match.mvpGroupMemberId}
                accentColor={teamColor}
                theme={theme}
              />
            ))}

            {subs.length > 0 && (
              <>
                <Divider style={styles(theme).subDivider} />
                <Text variant="labelMedium" style={styles(theme).subLabel}>
                  Suplentes
                </Text>
                {subs.map(player => (
                  <PlayerRow
                    key={player.groupMemberId}
                    player={player}
                    groupMembers={groupMembers}
                    mvpGroupMemberId={match.mvpGroupMemberId}
                    accentColor={teamColor}
                    theme={theme}
                  />
                ))}
              </>
            )}

            {/* Edit button for admins */}
            {canEdit && (
              <Button
                mode="outlined"
                icon={() => <Icon name="pencil" size={16} color={theme.colors.primary} />}
                onPress={onEditPress}
                style={styles(theme).editButton}
                compact
              >
                Editar partido
              </Button>
            )}
          </>
        )}

        {/* Expand indicator */}
        <View style={styles(theme).expandRow}>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={theme.colors.primary}
          />
        </View>
      </Card.Content>
    </Card>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    card: {
      marginBottom: 16,
      borderRadius: 12,
      backgroundColor: theme.colors.onPrimary,
    },
    cardContent: {
      gap: 12,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    dateText: {
      textTransform: 'capitalize',
      color: theme.colors.onSurfaceVariant,
      flex: 1,
    },
    scheduledChip: {
      backgroundColor: '#E3F2FD',
      height: 22,
    },
    scheduledChipText: {
      fontSize: 11,
      color: '#1565C0',
    },
    cancelledChip: {
      backgroundColor: '#FFEBEE',
      height: 22,
    },
    cancelledChipText: {
      fontSize: 11,
      color: '#C62828',
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    teamBlock: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
    },
    teamBlockRight: {
      alignItems: 'center',
    },
    teamName: {
      fontWeight: 'bold',
      textAlign: 'center',
    },
    scoresBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 8,
    },
    scoreBubble: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreText: {
      fontWeight: 'bold',
    },
    vsText: {
      fontWeight: 'bold',
      color: '#888',
    },
    resultRow: {
      alignItems: 'center',
    },
    resultChip: {
      paddingHorizontal: 8,
    },
    resultChipText: {
      color: '#FFF',
      fontWeight: 'bold',
    },
    voteButton: {
      alignSelf: 'center',
      marginTop: 8,
      backgroundColor: theme.colors.secondary,
    },
    voteButtonContent: {
      paddingHorizontal: 4,
    },
    divider: {
      marginVertical: 4,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    sectionTitle: {
      fontWeight: 'bold',
    },
    subDivider: {
      marginVertical: 6,
    },
    subLabel: {
      color: '#888',
      marginBottom: 4,
    },
    editButton: {
      marginTop: 12,
      alignSelf: 'flex-start',
    },
    expandRow: {
      alignItems: 'center',
      marginTop: 4,
    },
  });

const playerStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    left: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    positionBadge: {
      width: 36,
      height: 22,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    positionText: {
      color: '#FFF',
      fontSize: 11,
      fontWeight: 'bold',
    },
    name: {
      flex: 1,
      color: theme.colors.onSurface,
    },
    subBadge: {
      backgroundColor: '#B0BEC5',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    subText: {
      color: '#FFF',
      fontSize: 10,
      fontWeight: 'bold',
    },
    stats: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    stat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    statVal: {
      fontSize: 13,
      fontWeight: '600',
    },
    statGrey: {
      fontSize: 13,
      color: '#666',
    },
    statRed: {
      fontSize: 13,
      color: '#E57373',
    },
  });
