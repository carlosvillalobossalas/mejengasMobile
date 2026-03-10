import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
    Avatar,
    Card,
    Chip,
    Divider,
    Surface,
    Text,
    Button,
    useTheme,
    MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { MatchByTeams } from '../repositories/matches/matchesByTeamsRepository';
import type { Team } from '../repositories/teams/teamsRepository';
import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';
import MatchLineup from './MatchLineup';
import MatchByTeamsPlayersList from './MatchByTeamsPlayersList';

type Props = {
    match: MatchByTeams;
    groupName?: string;
    team1: Team | undefined;
    team2: Team | undefined;
    groupMembers: GroupMemberV2[];
    isExpanded: boolean;
    onToggle: () => void;
    /** When true, shows the MVP vote button */
    canVote?: boolean;
    /** Whether the current user has already voted in this match */
    hasVoted?: boolean;
    /** Called when the user taps the vote button */
    onVotePress?: () => void;
    currentUserGroupMemberId?: string | null;
    onSlotPress?: (params: {
        team: 1 | 2;
        slotIndex: number;
        groupMemberId: string | null;
    }) => void;
};

const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const weekday = date.toLocaleDateString('es-ES', { weekday: 'long' });
    const day = date.getDate();
    const month = date.toLocaleDateString('es-ES', { month: 'long' });
    const year = date.getFullYear();
    return `${weekday}, ${day} de ${month} de ${year}`;
};

/** Converts a hex color to an rgba string. Falls back to a blue if parsing fails. */
const hexToRgba = (hex: string, alpha: number): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(33, 150, 243, ${alpha})`;
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

export default function MatchByTeamsCard({
    match,
    groupName,
    team1,
    team2,
    groupMembers,
    isExpanded,
    onToggle,
    canVote = false,
    hasVoted = false,
    onVotePress,
    currentUserGroupMemberId,
    onSlotPress,
}: Props) {
    const theme = useTheme();
    const t1Color = team1?.color ?? theme.colors.primary;
    const t2Color = team2?.color ?? theme.colors.secondary;

    const isTeam1Win = match.goalsTeam1 > match.goalsTeam2;
    const isTeam2Win = match.goalsTeam2 > match.goalsTeam1;
    const isDraw = match.goalsTeam1 === match.goalsTeam2;

    const resultLabel = isTeam1Win
        ? `Ganó ${team1?.name ?? 'Equipo 1'}`
        : isTeam2Win
            ? `Ganó ${team2?.name ?? 'Equipo 2'}`
            : 'Empate';

    const resultColor = isDraw ? '#757575' : isTeam1Win ? t1Color : t2Color;

    return (
        <Card style={styles(theme).card} onPress={onToggle}>
            <Card.Content style={styles(theme).cardContent}>
                {/* Date */}
                <View style={styles(theme).dateRow}>
                    <Icon name="calendar" size={15} color={theme.colors.onSurfaceVariant} />
                    <Text variant="labelMedium" style={styles(theme).dateText}>
                        {formatDate(match.date)}
                    </Text>
                </View>
                {groupName ? (
                    <Text variant="labelSmall" style={styles(theme).groupNameLabel}>
                        {groupName}
                    </Text>
                ) : null}

                {/* Score row */}
                <View style={styles(theme).scoreRow}>
                    {/* Team 1 */}
                    <View style={styles(theme).teamBlock}>
                        {team1?.photoUrl ? (
                            <Avatar.Image
                                size={52}
                                source={{ uri: team1.photoUrl }}
                                style={{ backgroundColor: hexToRgba(t1Color, 0.15) }}
                            />
                        ) : (
                            <Avatar.Icon
                                size={52}
                                icon="shield"
                                style={{ backgroundColor: hexToRgba(t1Color, 0.2) }}
                                color={t1Color}
                            />
                        )}
                        <Text
                            variant="titleSmall"
                            style={[styles(theme).teamName, { color: t1Color }]}
                            numberOfLines={2}
                        >
                            {team1?.name ?? 'Equipo 1'}
                        </Text>
                    </View>

                    {/* Scores */}
                    <View style={styles(theme).scoresBlock}>
                        <Surface
                            style={[styles(theme).scoreBubble, { backgroundColor: hexToRgba(t1Color, 0.15) }]}
                            elevation={2}
                        >
                            <Text
                                variant="displaySmall"
                                style={[styles(theme).scoreText, { color: t1Color }]}
                            >
                                {match.goalsTeam1}
                            </Text>
                        </Surface>
                        <Text variant="titleMedium" style={styles(theme).vsText}>
                            VS
                        </Text>
                        <Surface
                            style={[styles(theme).scoreBubble, { backgroundColor: hexToRgba(t2Color, 0.15) }]}
                            elevation={2}
                        >
                            <Text
                                variant="displaySmall"
                                style={[styles(theme).scoreText, { color: t2Color }]}
                            >
                                {match.goalsTeam2}
                            </Text>
                        </Surface>
                    </View>

                    {/* Team 2 */}
                    <View style={[styles(theme).teamBlock, styles(theme).teamBlockRight]}>
                        {team2?.photoUrl ? (
                            <Avatar.Image
                                size={52}
                                source={{ uri: team2.photoUrl }}
                                style={{ backgroundColor: hexToRgba(t2Color, 0.15) }}
                            />
                        ) : (
                            <Avatar.Icon
                                size={52}
                                icon="shield"
                                style={{ backgroundColor: hexToRgba(t2Color, 0.2) }}
                                color={t2Color}
                            />
                        )}
                        <Text
                            variant="titleSmall"
                            style={[styles(theme).teamName, { color: t2Color }]}
                            numberOfLines={2}
                        >
                            {team2?.name ?? 'Equipo 2'}
                        </Text>
                    </View>
                </View>

                {/* Result chip */}
                <View style={styles(theme).resultRow}>
                    <Chip
                        style={[styles(theme).resultChip, { backgroundColor: resultColor }]}
                        textStyle={styles(theme).resultChipText}
                    >
                        {resultLabel}
                    </Chip>
                </View>

                {/* MVP vote button */}
                {canVote && (
                    <Button
                        mode={hasVoted ? 'outlined' : 'contained-tonal'}
                        icon={() => <Icon name='star-circle-outline' color={'white'} />}
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

                {/* Expanded: lineup + players */}
                {isExpanded && (
                    <>
                        <View style={styles(theme).sectionHeader}>
                            <Icon name="soccer-field" size={20} color={theme.colors.primary} />
                            <Text variant="titleMedium" style={styles(theme).sectionTitle}>
                                Alineaciones
                            </Text>
                        </View>
                        <MatchLineup
                            team1Players={match.players1}
                            team2Players={match.players2}
                            allPlayers={groupMembers}
                            mvpGroupMemberId={match.mvpGroupMemberId}
                            team1Name={team1?.name}
                            team2Name={team2?.name}
                            team1Color={team1?.color}
                            team2Color={team2?.color}
                            matchDate={match.date}
                            onSlotPress={({ team, slotIndex, groupMemberId }) => {
                                if (groupMemberId && groupMemberId !== currentUserGroupMemberId) return;
                                onSlotPress?.({ team, slotIndex, groupMemberId });
                            }}
                        />
                        <View style={styles(theme).spacing} />
                        <MatchByTeamsPlayersList
                            players1={match.players1}
                            players2={match.players2}
                            team1={team1}
                            team2={team2}
                            groupMembers={groupMembers}
                            mvpGroupMemberId={match.mvpGroupMemberId}
                        />
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
        },
        dateText: {
            textTransform: 'capitalize',
            color: theme.colors.onSurfaceVariant,
        },
        groupNameLabel: {
            color: theme.colors.primary,
            fontWeight: '700',
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
        spacing: {
            height: 16,
        },
        expandRow: {
            alignItems: 'center',
            marginTop: 4,
        },
    });
