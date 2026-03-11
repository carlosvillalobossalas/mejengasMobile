import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Divider, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import auth from '@react-native-firebase/auth';
import type { Match } from '../../repositories/matches/matchesRepository';
import { castMvpVoteByTeams, type MatchByTeams } from '../../repositories/matches/matchesByTeamsRepository';
import { type ChallengeMatch, type ChallengeMatchPlayer } from '../../repositories/matches/matchesByChallengeRepository';
import type { GroupMemberV2 } from '../../repositories/groupMembersV2/groupMembersV2Repository';
import type { Team } from '../../repositories/teams/teamsRepository';
import type { Group } from '../../repositories/groups/groupsRepository';
import MatchLineup from '../MatchLineup';
import PlayersList from '../PlayersList';
import ChallengeMatchLineup from '../ChallengeMatchLineup';
import MatchByTeamsPlayersList from '../MatchByTeamsPlayersList';
import MvpVotingModal from '../MvpVotingModal';
import ChallengeMvpVotingModal from '../ChallengeMvpVotingModal';
import ChallengePlayerRow from './ChallengePlayerRow';
import { TYPE_LABEL, type SelectedMatch } from './types';
import { shareMatchOnWhatsApp } from '../../services/matches/matchShareService';
import { shareChallengeMatchOnWhatsApp } from '../../services/matches/challengeMatchShareService';
import { useMvpVoting } from '../../hooks/useMvpVoting';
import { useChallengeMatchMvpVoting } from '../../hooks/useChallengeMatchMvpVoting';

const CHALLENGE_POSITION_ORDER: Record<ChallengeMatchPlayer['position'], number> = {
    POR: 0,
    DEF: 1,
    MED: 2,
    DEL: 3,
};

type Props = {
    bottomSheetRef: React.RefObject<BottomSheet | null>;
    selectedMatch: SelectedMatch | null;
    classicByGroup: Record<string, Match[]>;
    teamsMatchesByGroup: Record<string, MatchByTeams[]>;
    challengeByGroup: Record<string, ChallengeMatch[]>;
    membersByGroup: Record<string, GroupMemberV2[]>;
    memberIdsByGroup: Record<string, string | null>;
    teamsByGroup: Record<string, Team[]>;
    groupsById: Map<string, Group>;
    firebaseUser: { uid: string } | null;
    onDismiss: () => void;
    onNavigate: (route: 'EditMatch' | 'EditChallengeMatch', matchId: string) => void;
};

export default function MatchDetailSheet({
    bottomSheetRef,
    selectedMatch,
    classicByGroup,
    teamsMatchesByGroup,
    challengeByGroup,
    membersByGroup,
    memberIdsByGroup,
    teamsByGroup,
    groupsById,
    firebaseUser,
    onDismiss,
    onNavigate,
}: Props) {
    const theme = useTheme();
    const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
    const [selectedVotingMatchId, setSelectedVotingMatchId] = useState<string | null>(null);

    // ── Derived match data ──────────────────────────────────────────────────
    const selectedClassicMatch = useMemo(
        () => selectedMatch?.type === 'matches'
            ? (classicByGroup[selectedMatch.groupId] ?? []).find(m => m.id === selectedMatch.id) ?? null
            : null,
        [selectedMatch, classicByGroup],
    );

    const selectedTeamsMatch = useMemo(
        () => selectedMatch?.type === 'matchesByTeams'
            ? (teamsMatchesByGroup[selectedMatch.groupId] ?? []).find(m => m.id === selectedMatch.id) ?? null
            : null,
        [selectedMatch, teamsMatchesByGroup],
    );

    const selectedChallengeMatch = useMemo(
        () => selectedMatch?.type === 'matchesByChallenge'
            ? (challengeByGroup[selectedMatch.groupId] ?? []).find(m => m.id === selectedMatch.id) ?? null
            : null,
        [selectedMatch, challengeByGroup],
    );

    const selectedGroupMembers = selectedMatch ? membersByGroup[selectedMatch.groupId] ?? [] : [];
    const selectedGroup = selectedMatch ? groupsById.get(selectedMatch.groupId) : undefined;
    const selectedTeams = selectedMatch ? teamsByGroup[selectedMatch.groupId] ?? [] : [];

    const selectedChallengePlayers = useMemo(() => {
        if (!selectedChallengeMatch) return { starters: [] as ChallengeMatchPlayer[], subs: [] as ChallengeMatchPlayer[] };
        const sorted = [...selectedChallengeMatch.players].sort(
            (a, b) => CHALLENGE_POSITION_ORDER[a.position] - CHALLENGE_POSITION_ORDER[b.position],
        );
        return {
            starters: sorted.filter(p => !p.isSub),
            subs: sorted.filter(p => p.isSub),
        };
    }, [selectedChallengeMatch]);

    // ── Permissions ─────────────────────────────────────────────────────────
    const isAdminOrOwnerForSelectedGroup = useMemo(() => {
        if (!selectedMatch || !firebaseUser?.uid) return false;
        const group = groupsById.get(selectedMatch.groupId);
        if (group?.ownerId === firebaseUser.uid) return true;
        const member = (membersByGroup[selectedMatch.groupId] ?? []).find(m => m.userId === firebaseUser.uid);
        const role = member?.role ?? '';
        return role === 'admin' || role === 'owner';
    }, [selectedMatch, membersByGroup, groupsById, firebaseUser?.uid]);

    const isOwnerForSelectedGroup = useMemo(() => {
        if (!selectedMatch || !firebaseUser?.uid) return false;
        return groupsById.get(selectedMatch.groupId)?.ownerId === firebaseUser.uid;
    }, [selectedMatch, groupsById, firebaseUser?.uid]);

    const isCreatorOfSelectedMatch = useMemo(() => {
        if (!selectedMatch || !firebaseUser?.uid) return false;
        const memberId = memberIdsByGroup[selectedMatch.groupId] ?? null;
        const match = selectedClassicMatch ?? selectedTeamsMatch ?? selectedChallengeMatch;
        if (!match) return false;
        if (match.createdByUserId === firebaseUser.uid) return true;
        if (memberId && match.createdByGroupMemberId === memberId) return true;
        return false;
    }, [selectedMatch, firebaseUser?.uid, memberIdsByGroup, selectedClassicMatch, selectedTeamsMatch, selectedChallengeMatch]);

    const canEditSelectedMatch = isAdminOrOwnerForSelectedGroup || isCreatorOfSelectedMatch;

    // ── MVP voting ───────────────────────────────────────────────────────────
    const {
        currentUserGroupMemberId: classicMvpMemberId,
        canVoteInMatch: canVoteClassic,
        castVote: castClassicVote,
        isVoting: isVotingClassic,
        voteError: classicVoteError,
        clearVoteError: clearClassicVoteError,
    } = useMvpVoting(
        selectedMatch?.type === 'matches' ? selectedMatch.groupId : null,
        firebaseUser?.uid ?? null,
    );

    const {
        currentUserGroupMemberId: teamsMvpMemberId,
        canVoteInMatch: canVoteTeams,
        castVote: castTeamsVote,
        isVoting: isVotingTeams,
        voteError: teamsVoteError,
        clearVoteError: clearTeamsVoteError,
    } = useMvpVoting(
        selectedMatch?.type === 'matchesByTeams' ? selectedMatch.groupId : null,
        firebaseUser?.uid ?? null,
        castMvpVoteByTeams,
    );

    const {
        currentUserGroupMemberId: challengeMvpMemberId,
        canVoteInMatch: canVoteChallenge,
        castVote: castChallengeVote,
        isVoting: isVotingChallenge,
        voteError: challengeVoteError,
        clearVoteError: clearChallengeVoteError,
    } = useChallengeMatchMvpVoting(
        selectedMatch?.type === 'matchesByChallenge' ? selectedMatch.groupId : null,
        firebaseUser?.uid ?? null,
    );

    const activeMvpMemberId = selectedMatch?.type === 'matchesByChallenge'
        ? challengeMvpMemberId
        : selectedMatch?.type === 'matchesByTeams'
            ? teamsMvpMemberId
            : classicMvpMemberId;

    const canVoteCurrentMatch = useMemo(() => {
        if (selectedClassicMatch) return canVoteClassic(selectedClassicMatch);
        if (selectedTeamsMatch) return canVoteTeams(selectedTeamsMatch);
        if (selectedChallengeMatch) return canVoteChallenge(selectedChallengeMatch);
        return false;
    }, [selectedClassicMatch, selectedTeamsMatch, selectedChallengeMatch, canVoteClassic, canVoteTeams, canVoteChallenge]);

    const hasAlreadyVoted = useMemo(() => {
        if (!activeMvpMemberId) return false;
        if (selectedClassicMatch) return Boolean(selectedClassicMatch.mvpVotes[activeMvpMemberId]);
        if (selectedTeamsMatch) return Boolean(selectedTeamsMatch.mvpVotes[activeMvpMemberId]);
        if (selectedChallengeMatch) return Boolean(selectedChallengeMatch.mvpVotes[activeMvpMemberId]);
        return false;
    }, [activeMvpMemberId, selectedClassicMatch, selectedTeamsMatch, selectedChallengeMatch]);

    // ── Delete ───────────────────────────────────────────────────────────────
    const deleteClassicMatch = useCallback(async (matchId: string) => {
        if (deletingMatchId) return;
        setDeletingMatchId(matchId);
        try {
            const currentUser = auth().currentUser;
            if (!currentUser) throw new Error('No autenticado');
            const idToken = await currentUser.getIdToken();
            const response = await fetch(
                'https://us-central1-mejengas-a7794.cloudfunctions.net/deleteMatch',
                { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data: { matchId } }) },
            );
            if (!response.ok) throw new Error('No se pudo eliminar el partido');
            bottomSheetRef.current?.close();
            Alert.alert('Partido eliminado', 'El partido se eliminó correctamente.');
        } catch (err) {
            console.error('MatchDetailSheet: error deleting classic match', err);
            Alert.alert('Error', 'No se pudo eliminar el partido. Intenta de nuevo.');
        } finally {
            setDeletingMatchId(null);
        }
    }, [deletingMatchId, bottomSheetRef]);

    const deleteChallengeMatch = useCallback(async (matchId: string) => {
        if (deletingMatchId) return;
        setDeletingMatchId(matchId);
        try {
            const currentUser = auth().currentUser;
            if (!currentUser) throw new Error('No autenticado');
            const idToken = await currentUser.getIdToken();
            const response = await fetch(
                'https://us-central1-mejengas-a7794.cloudfunctions.net/deleteChallengeMatch',
                { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data: { matchId } }) },
            );
            if (!response.ok) throw new Error('No se pudo eliminar el partido');
            bottomSheetRef.current?.close();
            Alert.alert('Partido eliminado', 'El partido se eliminó correctamente.');
        } catch (err) {
            console.error('MatchDetailSheet: error deleting challenge match', err);
            Alert.alert('Error', 'No se pudo eliminar el partido. Intenta de nuevo.');
        } finally {
            setDeletingMatchId(null);
        }
    }, [deletingMatchId, bottomSheetRef]);

    const handleDeleteMatchPress = useCallback((matchId: string, type: SelectedMatch['type']) => {
        Alert.alert(
            'Eliminar partido',
            '¿Deseas eliminar este partido? Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: () => {
                    if (type === 'matchesByChallenge') void deleteChallengeMatch(matchId);
                    else void deleteClassicMatch(matchId);
                }},
            ],
        );
    }, [deleteClassicMatch, deleteChallengeMatch]);

    const handleShareMatch = useCallback(() => {
        if (selectedClassicMatch) {
            void shareMatchOnWhatsApp(selectedClassicMatch, selectedGroupMembers);
        } else if (selectedChallengeMatch && selectedGroup) {
            void shareChallengeMatchOnWhatsApp(selectedChallengeMatch, selectedGroup.name, selectedGroupMembers);
        }
    }, [selectedClassicMatch, selectedChallengeMatch, selectedGroup, selectedGroupMembers]);

    const s = styles(theme);

    return (
        <>
            <BottomSheetScrollView contentContainerStyle={s.content}>
                <Text variant="titleMedium">Detalle del partido</Text>
                {selectedMatch ? (
                    <Text variant="labelSmall" style={s.groupTypeLabel}>
                        {groupsById.get(selectedMatch.groupId)?.name ?? 'Grupo'} · {TYPE_LABEL[selectedMatch.type]}
                    </Text>
                ) : null}

                {/* Acciones rápidas */}
                {selectedMatch ? (
                    <View style={s.actions}>
                        {selectedMatch.type !== 'matchesByTeams' ? (
                            <TouchableOpacity onPress={handleShareMatch} style={s.actionItem} activeOpacity={0.7}>
                                <Icon name="whatsapp" size={22} color="#25D366" />
                                <Text variant="labelSmall" style={s.actionLabel}>Compartir</Text>
                            </TouchableOpacity>
                        ) : null}

                        {canEditSelectedMatch && selectedMatch.type !== 'matchesByTeams' ? (
                            <TouchableOpacity
                                style={s.actionItem}
                                activeOpacity={0.7}
                                onPress={() => {
                                    bottomSheetRef.current?.close();
                                    const route = selectedMatch.type === 'matchesByChallenge' ? 'EditChallengeMatch' : 'EditMatch';
                                    setTimeout(() => onNavigate(route, selectedMatch.id), 200);
                                }}
                            >
                                <Icon name="pencil" size={22} color={theme.colors.primary} />
                                <Text variant="labelSmall" style={s.actionLabel}>Editar</Text>
                            </TouchableOpacity>
                        ) : null}

                        {isOwnerForSelectedGroup && selectedMatch.type !== 'matchesByTeams' ? (
                            <TouchableOpacity
                                style={s.actionItem}
                                activeOpacity={0.7}
                                disabled={deletingMatchId === selectedMatch.id}
                                onPress={() => handleDeleteMatchPress(selectedMatch.id, selectedMatch.type)}
                            >
                                <Icon name="delete-outline" size={22} color={theme.colors.error} />
                                <Text variant="labelSmall" style={s.actionLabelDanger}>
                                    {deletingMatchId === selectedMatch.id ? 'Eliminando...' : 'Eliminar'}
                                </Text>
                            </TouchableOpacity>
                        ) : null}

                        {canVoteCurrentMatch ? (
                            <TouchableOpacity onPress={() => setSelectedVotingMatchId(selectedMatch.id)} style={s.actionItem} activeOpacity={0.7}>
                                <Icon name="star-circle-outline" size={22} color={theme.colors.secondary} />
                                <Text variant="labelSmall" style={s.actionLabel}>
                                    {hasAlreadyVoted ? 'Cambiar voto' : 'Votar MVP'}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                ) : null}

                {/* Classic match */}
                {selectedClassicMatch ? (
                    <>
                        <MatchLineup
                            team1Players={selectedClassicMatch.players1}
                            team2Players={selectedClassicMatch.players2}
                            allPlayers={selectedGroupMembers}
                            mvpGroupMemberId={selectedClassicMatch.mvpGroupMemberId}
                            team1Color={selectedClassicMatch.team1Color ?? selectedGroup?.defaultTeam1Color}
                            team2Color={selectedClassicMatch.team2Color ?? selectedGroup?.defaultTeam2Color}
                            matchDate={selectedClassicMatch.date}
                            onSlotPress={() => {}}
                        />
                        <View style={s.spacer} />
                        <PlayersList
                            team1Players={selectedClassicMatch.players1}
                            team2Players={selectedClassicMatch.players2}
                            allPlayers={selectedGroupMembers}
                            mvpGroupMemberId={selectedClassicMatch.mvpGroupMemberId}
                        />
                    </>
                ) : null}

                {/* Teams match */}
                {selectedTeamsMatch ? (
                    <>
                        <MatchLineup
                            team1Players={selectedTeamsMatch.players1}
                            team2Players={selectedTeamsMatch.players2}
                            allPlayers={selectedGroupMembers}
                            mvpGroupMemberId={selectedTeamsMatch.mvpGroupMemberId}
                            team1Name={selectedTeams.find(t => t.id === selectedTeamsMatch.team1Id)?.name}
                            team2Name={selectedTeams.find(t => t.id === selectedTeamsMatch.team2Id)?.name}
                            team1Color={selectedTeams.find(t => t.id === selectedTeamsMatch.team1Id)?.color}
                            team2Color={selectedTeams.find(t => t.id === selectedTeamsMatch.team2Id)?.color}
                            matchDate={selectedTeamsMatch.date}
                            onSlotPress={() => {}}
                        />
                        <View style={s.spacer} />
                        <MatchByTeamsPlayersList
                            players1={selectedTeamsMatch.players1}
                            players2={selectedTeamsMatch.players2}
                            team1={selectedTeams.find(t => t.id === selectedTeamsMatch.team1Id)}
                            team2={selectedTeams.find(t => t.id === selectedTeamsMatch.team2Id)}
                            groupMembers={selectedGroupMembers}
                            mvpGroupMemberId={selectedTeamsMatch.mvpGroupMemberId}
                        />
                    </>
                ) : null}

                {/* Challenge match */}
                {selectedChallengeMatch ? (
                    <>
                        <ChallengeMatchLineup
                            players={selectedChallengeMatch.players}
                            allPlayers={selectedGroupMembers}
                            mvpGroupMemberId={selectedChallengeMatch.mvpGroupMemberId}
                            teamColor={selectedChallengeMatch.teamColor ?? selectedGroup?.defaultTeam1Color ?? theme.colors.primary}
                            secondaryTeamColor={selectedChallengeMatch.opponentColor ?? selectedGroup?.defaultTeam2Color ?? theme.colors.secondary}
                            teamName={selectedGroup?.name ?? 'Mi equipo'}
                            secondaryTeamName={selectedChallengeMatch.opponentName.trim() || 'Rival'}
                            matchDate={selectedChallengeMatch.date}
                            onSlotPress={() => {}}
                        />
                        <View style={s.spacer} />
                        <View style={s.sectionHeader}>
                            <Icon name="account-group" size={20} color={theme.colors.primary} />
                            <Text variant="titleSmall" style={s.sectionTitle}>Jugadores</Text>
                        </View>
                        {selectedChallengePlayers.starters.map((player, index) => (
                            <ChallengePlayerRow
                                key={player.groupMemberId ?? `starter_${index}`}
                                player={player}
                                groupMembers={selectedGroupMembers}
                                mvpGroupMemberId={selectedChallengeMatch.mvpGroupMemberId}
                                accentColor={theme.colors.primary}
                            />
                        ))}
                        {selectedChallengePlayers.subs.length > 0 ? (
                            <>
                                <Divider style={s.subDivider} />
                                <Text variant="labelSmall" style={s.subLabel}>Suplentes</Text>
                                {selectedChallengePlayers.subs.map((player, index) => (
                                    <ChallengePlayerRow
                                        key={player.groupMemberId ?? `sub_${index}`}
                                        player={player}
                                        groupMembers={selectedGroupMembers}
                                        mvpGroupMemberId={selectedChallengeMatch.mvpGroupMemberId}
                                        accentColor={theme.colors.primary}
                                    />
                                ))}
                            </>
                        ) : null}
                    </>
                ) : null}
            </BottomSheetScrollView>

            {/* MVP Voting Modals */}
            <MvpVotingModal
                visible={selectedVotingMatchId !== null && (selectedMatch?.type === 'matches' || selectedMatch?.type === 'matchesByTeams')}
                match={selectedClassicMatch ?? selectedTeamsMatch}
                allPlayers={selectedGroupMembers}
                currentUserGroupMemberId={activeMvpMemberId}
                isVoting={isVotingClassic || isVotingTeams}
                voteError={classicVoteError ?? teamsVoteError}
                onVote={async votedId => {
                    if (selectedMatch?.type === 'matchesByTeams') await castTeamsVote(selectedMatch.id, votedId);
                    else if (selectedMatch) await castClassicVote(selectedMatch.id, votedId);
                }}
                onDismiss={() => setSelectedVotingMatchId(null)}
                onClearError={() => { clearClassicVoteError(); clearTeamsVoteError(); }}
            />
            <ChallengeMvpVotingModal
                visible={selectedVotingMatchId !== null && selectedMatch?.type === 'matchesByChallenge'}
                match={selectedChallengeMatch}
                allPlayers={selectedGroupMembers}
                currentUserGroupMemberId={activeMvpMemberId}
                isVoting={isVotingChallenge}
                voteError={challengeVoteError}
                onVote={async votedId => { if (selectedMatch) await castChallengeVote(selectedMatch.id, votedId); }}
                onDismiss={() => setSelectedVotingMatchId(null)}
                onClearError={clearChallengeVoteError}
            />
        </>
    );
}

const styles = (theme: MD3Theme) => StyleSheet.create({
    content: { padding: 16, gap: 10, paddingBottom: 32 },
    groupTypeLabel: { color: theme.colors.primary, fontWeight: '700', marginBottom: 4 },
    actions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    actionItem: { alignItems: 'center', gap: 4 },
    actionLabel: { color: theme.colors.onSurfaceVariant },
    actionLabelDanger: { color: theme.colors.error },
    spacer: { height: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    sectionTitle: { fontWeight: 'bold' },
    subDivider: { marginVertical: 6 },
    subLabel: { color: '#888', marginBottom: 4 },
});
