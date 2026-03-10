import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import {
    Button,
    Divider,
    FAB,
    Portal,
    Surface,
    Text,
    useTheme,
    type MD3Theme,
} from 'react-native-paper';

import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectGroup } from '../features/groups/groupsSlice';
import type { AppDrawerParamList } from '../navigation/types';
import MatchLineup from '../components/MatchLineup';
import PlayersList from '../components/PlayersList';
import ChallengeMatchLineup from '../components/ChallengeMatchLineup';
import MatchByTeamsPlayersList from '../components/MatchByTeamsPlayersList';
import MvpVotingModal from '../components/MvpVotingModal';
import ChallengeMvpVotingModal from '../components/ChallengeMvpVotingModal';
import MatchCompactCard from '../components/myMatches/MatchCompactCard';
import ChallengePlayerRow from '../components/myMatches/ChallengePlayerRow';
import AddMatchDialog from '../components/myMatches/AddMatchDialog';
import { type MatchTypeFilter, type MatchStatusFilter, type MatchParticipationFilter, type UnifiedMatchItem, type SelectedMatch, TYPE_LABEL, statusLabel } from '../components/myMatches/types';
import {
    subscribeToGroupMembersV2ByGroupId,
    type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import { subscribeToMatchesByGroupId, type Match } from '../repositories/matches/matchesRepository';
import {
    subscribeToMatchesByTeamsByGroupId,
    type MatchByTeams,
    castMvpVoteByTeams,
} from '../repositories/matches/matchesByTeamsRepository';
import {
    subscribeToMatchesByChallengeByGroupId,
    type ChallengeMatch,
    type ChallengeMatchPlayer,
} from '../repositories/matches/matchesByChallengeRepository';
import {
    subscribeToTeamsByGroupId,
    type Team,
} from '../repositories/teams/teamsRepository';
import { shareMatchOnWhatsApp } from '../services/matches/matchShareService';
import { shareChallengeMatchOnWhatsApp } from '../services/matches/challengeMatchShareService';
import { useMvpVoting } from '../hooks/useMvpVoting';
import { useChallengeMatchMvpVoting } from '../hooks/useChallengeMatchMvpVoting';

const CHALLENGE_POSITION_ORDER: Record<ChallengeMatchPlayer['position'], number> = {
    POR: 0,
    DEF: 1,
    MED: 2,
    DEL: 3,
};

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

export default function MyMatchesScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const dispatch = useAppDispatch();
    const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
    const { groups } = useAppSelector(state => state.groups);
    const firebaseUser = useAppSelector(state => state.auth.firebaseUser);

    const filtersSheetRef = useRef<BottomSheet>(null);
    const detailsSheetRef = useRef<BottomSheet>(null);

    const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
    const [selectedYear, setSelectedYear] = useState<number | 'historico'>(new Date().getFullYear());
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string | 'all'>('all');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState<MatchTypeFilter>('all');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState<MatchStatusFilter>('all');
    const [selectedParticipationFilter, setSelectedParticipationFilter] = useState<MatchParticipationFilter>('all');
    const [selectedMatch, setSelectedMatch] = useState<SelectedMatch | null>(null);
    const [selectedVotingMatchId, setSelectedVotingMatchId] = useState<string | null>(null);

    // Add match dialog
    const [addDialogVisible, setAddDialogVisible] = useState(false);
    const [addDialogStep, setAddDialogStep] = useState<'type' | 'group'>('type');
    const [addDialogType, setAddDialogType] = useState<'AddMatch' | 'AddMatchTeams' | 'AddChallengeMatch' | null>(null);

    const [memberIdsByGroup, setMemberIdsByGroup] = useState<Record<string, string | null>>({});
    const [membersByGroup, setMembersByGroup] = useState<Record<string, GroupMemberV2[]>>({});
    const [classicByGroup, setClassicByGroup] = useState<Record<string, Match[]>>({});
    const [teamsMatchesByGroup, setTeamsMatchesByGroup] = useState<Record<string, MatchByTeams[]>>({});
    const [challengeByGroup, setChallengeByGroup] = useState<Record<string, ChallengeMatch[]>>({});
    const [teamsByGroup, setTeamsByGroup] = useState<Record<string, Team[]>>({});

    const groupsById = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);

    useEffect(() => {
        if (groups.length === 0) {
            setSelectedGroupFilter('all');
            return;
        }

        if (selectedGroupFilter !== 'all' && !groups.some(group => group.id === selectedGroupFilter)) {
            setSelectedGroupFilter('all');
        }
    }, [groups, selectedGroupFilter]);

    useEffect(() => {
        if (!firebaseUser?.uid || groups.length === 0) {
            setMemberIdsByGroup({});
            setMembersByGroup({});
            return;
        }

        const unsubscribers = groups.map(group =>
            subscribeToGroupMembersV2ByGroupId(group.id, members => {
                const memberId = members.find(member => member.userId === firebaseUser.uid)?.id ?? null;
                setMemberIdsByGroup(prev => ({ ...prev, [group.id]: memberId }));
                setMembersByGroup(prev => ({ ...prev, [group.id]: members }));
            }),
        );

        return () => {
            unsubscribers.forEach(unsubscribe => unsubscribe());
        };
    }, [groups, firebaseUser?.uid]);

    useEffect(() => {
        if (groups.length === 0) {
            setClassicByGroup({});
            return;
        }

        const unsubscribers = groups.map(group =>
            subscribeToMatchesByGroupId(group.id, matches => {
                setClassicByGroup(prev => ({ ...prev, [group.id]: matches }));
            }),
        );

        return () => {
            unsubscribers.forEach(unsubscribe => unsubscribe());
        };
    }, [groups]);

    useEffect(() => {
        if (groups.length === 0) {
            setTeamsMatchesByGroup({});
            setTeamsByGroup({});
            return;
        }

        const matchUnsubs = groups.map(group =>
            subscribeToMatchesByTeamsByGroupId(group.id, matches => {
                setTeamsMatchesByGroup(prev => ({ ...prev, [group.id]: matches }));
            }),
        );

        const teamsUnsubs = groups.map(group =>
            subscribeToTeamsByGroupId(group.id, teams => {
                setTeamsByGroup(prev => ({ ...prev, [group.id]: teams }));
            }),
        );

        return () => {
            matchUnsubs.forEach(unsubscribe => unsubscribe());
            teamsUnsubs.forEach(unsubscribe => unsubscribe());
        };
    }, [groups]);

    useEffect(() => {
        if (groups.length === 0) {
            setChallengeByGroup({});
            return;
        }

        const unsubscribers = groups.map(group =>
            subscribeToMatchesByChallengeByGroupId(group.id, matches => {
                setChallengeByGroup(prev => ({ ...prev, [group.id]: matches }));
            }),
        );

        return () => {
            unsubscribers.forEach(unsubscribe => unsubscribe());
        };
    }, [groups]);

    const allMatches = useMemo<UnifiedMatchItem[]>(() => {
        const rows: UnifiedMatchItem[] = [];

        groups.forEach(group => {
            const memberId = memberIdsByGroup[group.id];
            if (!memberId) return;

            const classicRows = (classicByGroup[group.id] ?? [])
                .map(match => ({
                    id: match.id,
                    key: `matches_${match.id}`,
                    groupId: group.id,
                    groupName: group.name,
                    type: 'matches' as const,
                    date: match.date,
                    status: (match.status ?? 'finished') as UnifiedMatchItem['status'],
                    leftLabel: 'Equipo 1',
                    rightLabel: 'Equipo 2',
                    leftScore: Number(match.goalsTeam1 ?? 0),
                    rightScore: Number(match.goalsTeam2 ?? 0),
                    isParticipant: [...match.players1, ...match.players2].some(p => p.groupMemberId === memberId),
                }));

            const teamsRows = (teamsMatchesByGroup[group.id] ?? [])
                .map(match => {
                    const teams = teamsByGroup[group.id] ?? [];
                    const team1 = teams.find(team => team.id === match.team1Id);
                    const team2 = teams.find(team => team.id === match.team2Id);

                    return {
                        id: match.id,
                        key: `matchesByTeams_${match.id}`,
                        groupId: group.id,
                        groupName: group.name,
                        type: 'matchesByTeams' as const,
                        date: match.date,
                        status: (match.status ?? 'finished') as UnifiedMatchItem['status'],
                        leftLabel: team1?.name ?? 'Equipo 1',
                        rightLabel: team2?.name ?? 'Equipo 2',
                        leftScore: Number(match.goalsTeam1 ?? 0),
                        rightScore: Number(match.goalsTeam2 ?? 0),
                        isParticipant: [...match.players1, ...match.players2].some(p => p.groupMemberId === memberId),
                    };
                });

            const challengeRows = (challengeByGroup[group.id] ?? [])
                .map(match => ({
                    id: match.id,
                    key: `matchesByChallenge_${match.id}`,
                    groupId: group.id,
                    groupName: group.name,
                    type: 'matchesByChallenge' as const,
                    date: match.date,
                    status: match.status,
                    leftLabel: group.name,
                    rightLabel: match.opponentName.trim() || 'Rival',
                    leftScore: Number(match.goalsTeam ?? 0),
                    rightScore: Number(match.goalsOpponent ?? 0),
                    isParticipant: match.players.some(p => p.groupMemberId === memberId),
                }));

            rows.push(...classicRows, ...teamsRows, ...challengeRows);
        });

        return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [groups, memberIdsByGroup, classicByGroup, teamsMatchesByGroup, challengeByGroup, teamsByGroup]);

    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const startYear = 2025;
        const years: number[] = [];
        for (let year = currentYear; year >= startYear; year -= 1) {
            years.push(year);
        }
        return [{ value: 'historico' as const, label: 'Histórico' }, ...years.map(year => ({ value: year, label: String(year) }))];
    }, []);

    const selectedGroupFilterLabel = useMemo(() => {
        if (selectedGroupFilter === 'all') return 'Todos mis grupos';
        return groupsById.get(selectedGroupFilter)?.name ?? 'Grupo';
    }, [selectedGroupFilter, groupsById]);

    const appliedFiltersRow1 = useMemo(
        () => `Temporada: ${selectedYear === 'historico' ? 'Histórico' : selectedYear} · Grupo: ${selectedGroupFilterLabel}`,
        [selectedYear, selectedGroupFilterLabel],
    );

    const appliedFiltersRow2 = useMemo(
        () => `Tipo: ${selectedTypeFilter === 'all' ? 'Todos' : TYPE_LABEL[selectedTypeFilter]} · Estado: ${selectedStatusFilter === 'all' ? 'Todos' : statusLabel(selectedStatusFilter)} · ${selectedParticipationFilter === 'mine' ? 'Solo los míos' : 'Todos los partidos'}`,
        [selectedTypeFilter, selectedStatusFilter, selectedParticipationFilter],
    );

    const filteredMatches = useMemo(
        () =>
            allMatches.filter(match => {
                if (selectedYear !== 'historico' && new Date(match.date).getFullYear() !== selectedYear) return false;
                if (selectedGroupFilter !== 'all' && match.groupId !== selectedGroupFilter) return false;
                if (selectedTypeFilter !== 'all' && match.type !== selectedTypeFilter) return false;
                if (selectedStatusFilter !== 'all' && match.status !== selectedStatusFilter) return false;
                if (selectedParticipationFilter === 'mine' && !match.isParticipant) return false;
                return true;
            }),
        [allMatches, selectedYear, selectedGroupFilter, selectedTypeFilter, selectedStatusFilter, selectedParticipationFilter],
    );

    const matchesByDate = useMemo(() => {
        const grouped = new Map<string, UnifiedMatchItem[]>();
        filteredMatches.forEach(match => {
            const key = new Date(match.date).toLocaleDateString('en-CA');
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)?.push(match);
        });
        return Array.from(grouped.entries());
    }, [filteredMatches]);

    const selectedClassicMatch = useMemo(
        () =>
            selectedMatch?.type === 'matches'
                ? (classicByGroup[selectedMatch.groupId] ?? []).find(match => match.id === selectedMatch.id) ?? null
                : null,
        [selectedMatch, classicByGroup],
    );

    const selectedTeamsMatch = useMemo(
        () =>
            selectedMatch?.type === 'matchesByTeams'
                ? (teamsMatchesByGroup[selectedMatch.groupId] ?? []).find(match => match.id === selectedMatch.id) ?? null
                : null,
        [selectedMatch, teamsMatchesByGroup],
    );

    const selectedChallengeMatch = useMemo(
        () =>
            selectedMatch?.type === 'matchesByChallenge'
                ? (challengeByGroup[selectedMatch.groupId] ?? []).find(match => match.id === selectedMatch.id) ?? null
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
            starters: sorted.filter(player => !player.isSub),
            subs: sorted.filter(player => player.isSub),
        };
    }, [selectedChallengeMatch]);

    const isAdminOrOwnerForSelectedGroup = useMemo(() => {
        if (!selectedMatch || !firebaseUser?.uid) return false;
        const members = membersByGroup[selectedMatch.groupId] ?? [];
        const member = members.find(m => m.userId === firebaseUser.uid);
        const role = member?.role ?? '';
        return role === 'admin' || role === 'owner';
    }, [selectedMatch, membersByGroup, firebaseUser?.uid]);

    const isOwnerForSelectedGroup = useMemo(() => {
        if (!selectedMatch || !firebaseUser?.uid) return false;
        const group = groupsById.get(selectedMatch.groupId);
        return group?.ownerId === firebaseUser.uid;
    }, [selectedMatch, groupsById, firebaseUser?.uid]);

    // MVP voting hooks — one per match type, active only when the matching type is selected
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

    const deleteClassicMatch = useCallback(async (matchId: string) => {
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
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                    body: JSON.stringify({ data: { matchId } }),
                },
            );
            if (!response.ok) throw new Error('No se pudo eliminar el partido');
            detailsSheetRef.current?.close();
            Alert.alert('Partido eliminado', 'El partido se eliminó correctamente.');
        } catch (err) {
            console.error('MyMatchesScreen: error deleting classic match', err);
            Alert.alert('Error', 'No se pudo eliminar el partido. Intenta de nuevo.');
        } finally {
            setDeletingMatchId(null);
        }
    }, [deletingMatchId]);

    const deleteChallengeMatch = useCallback(async (matchId: string) => {
        if (deletingMatchId) return;
        setDeletingMatchId(matchId);
        try {
            const currentUser = auth().currentUser;
            if (!currentUser) throw new Error('No autenticado');
            const idToken = await currentUser.getIdToken();
            const response = await fetch(
                'https://us-central1-mejengas-a7794.cloudfunctions.net/deleteChallengeMatch',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                    body: JSON.stringify({ data: { matchId } }),
                },
            );
            if (!response.ok) throw new Error('No se pudo eliminar el partido');
            detailsSheetRef.current?.close();
            Alert.alert('Partido eliminado', 'El partido se eliminó correctamente.');
        } catch (err) {
            console.error('MyMatchesScreen: error deleting challenge match', err);
            Alert.alert('Error', 'No se pudo eliminar el partido. Intenta de nuevo.');
        } finally {
            setDeletingMatchId(null);
        }
    }, [deletingMatchId]);

    const handleDeleteMatchPress = useCallback((matchId: string, type: UnifiedMatchItem['type']) => {
        Alert.alert(
            'Eliminar partido',
            '¿Deseas eliminar este partido? Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: () => {
                        if (type === 'matchesByChallenge') {
                            void deleteChallengeMatch(matchId);
                        } else {
                            void deleteClassicMatch(matchId);
                        }
                    },
                },
            ],
        );
    }, [deleteClassicMatch, deleteChallengeMatch]);

    const renderBackdrop = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        ),
        [],
    );

    const openMatchDetails = useCallback((match: UnifiedMatchItem) => {
        setSelectedMatch({ id: match.id, groupId: match.groupId, type: match.type });
        setTimeout(() => detailsSheetRef.current?.expand(), 80);
    }, []);

    const compatibleGroupsForRoute = useCallback(
        (route: 'AddMatch' | 'AddMatchTeams' | 'AddChallengeMatch') =>
            groups.filter(group => {
                if (route === 'AddMatch') return !group.hasFixedTeams && !group.isChallengeMode;
                if (route === 'AddMatchTeams') return group.hasFixedTeams && !group.isChallengeMode;
                return group.isChallengeMode;
            }),
        [groups],
    );

    const handleShareMatch = useCallback(() => {
        if (selectedClassicMatch) {
            void shareMatchOnWhatsApp(selectedClassicMatch, selectedGroupMembers);
        } else if (selectedChallengeMatch && selectedGroup) {
            void shareChallengeMatchOnWhatsApp(selectedChallengeMatch, selectedGroup.name, selectedGroupMembers);
        }
    }, [selectedClassicMatch, selectedChallengeMatch, selectedGroup, selectedGroupMembers]);

    const handleTypeSelect = useCallback((route: 'AddMatch' | 'AddMatchTeams' | 'AddChallengeMatch') => {
        const compatible = compatibleGroupsForRoute(route);
        if (compatible.length === 0) {
            Alert.alert('Sin grupos compatibles', 'No tienes grupos compatibles para este tipo de partido.');
            return;
        }
        setAddDialogType(route);
        setAddDialogStep('group');
    }, [compatibleGroupsForRoute]);

    const handleGroupSelectConfirm = useCallback((groupId: string) => {
        if (!addDialogType || !firebaseUser?.uid) return;
        void dispatch(selectGroup({ userId: firebaseUser.uid, groupId }));
        const route = addDialogType;
        setAddDialogVisible(false);
        setAddDialogStep('type');
        setAddDialogType(null);
        setTimeout(() => navigation.navigate(route), 250);
    }, [addDialogType, dispatch, firebaseUser?.uid, navigation]);

    const compatibleGroupsForDialog = useMemo(
        () => (addDialogType ? compatibleGroupsForRoute(addDialogType) : []),
        [addDialogType, compatibleGroupsForRoute],
    );

    const handleCloseAddDialog = useCallback(() => {
        setAddDialogVisible(false);
        setAddDialogStep('type');
        setAddDialogType(null);
    }, []);

    return (
        <View style={styles(theme).container}>
            <Surface style={styles(theme).header} elevation={2}>
                <View style={styles(theme).headerRow}>
                    <View style={styles(theme).headerStats}>
                        <Text variant="bodySmall" style={styles(theme).headerText}>
                            Total: {filteredMatches.length} partido{filteredMatches.length !== 1 ? 's' : ''}
                        </Text>
                        <Text variant="bodySmall" style={styles(theme).headerText}>
                            {appliedFiltersRow1}
                        </Text>
                        <Text variant="bodySmall" style={styles(theme).headerText}>
                            {appliedFiltersRow2}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={styles(theme).filterButton}
                        onPress={() => filtersSheetRef.current?.expand()}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Icon name="filter-variant" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </Surface>
            <Divider />

            <ScrollView style={styles(theme).scroll} contentContainerStyle={[styles(theme).content, { paddingBottom: insets.bottom + 80 }]}>
                {filteredMatches.length === 0 ? (
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
                            {dateMatches.map(match => (
                                <MatchCompactCard
                                    key={match.key}
                                    match={match}
                                    showGroupLabel={selectedGroupFilter === 'all'}
                                    onPress={() => openMatchDetails(match)}
                                />
                            ))}
                        </View>
                    ))
                )}
            </ScrollView>

            <FAB
                icon="plus"
                color="white"
                style={[styles(theme).fab, { bottom: insets.bottom + 16, backgroundColor: theme.colors.primary }]}
                onPress={() => {
                    setAddDialogStep('type');
                    setAddDialogType(null);
                    setAddDialogVisible(true);
                }}
            />

            <Portal>
                <BottomSheet
                    ref={filtersSheetRef}
                    index={-1}
                    snapPoints={['75%']}
                    enablePanDownToClose
                    topInset={insets.top}
                    backdropComponent={renderBackdrop}
                >
                    <BottomSheetScrollView contentContainerStyle={styles(theme).sheetContent}>
                        <Text variant="titleMedium" style={styles(theme).sheetTitle}>Filtros</Text>

                        <Text variant="labelMedium" style={styles(theme).sectionTitle}>Temporada</Text>
                        {yearOptions.map(option => (
                            <Button
                                key={option.value.toString()}
                                mode={selectedYear === option.value ? 'contained' : 'text'}
                                onPress={() => setSelectedYear(option.value)}
                                style={styles(theme).optionButton}
                                contentStyle={styles(theme).optionButtonContent}
                            >
                                {option.label}
                            </Button>
                        ))}

                        <Text variant="labelMedium" style={styles(theme).sectionTitle}>Grupo</Text>
                        <Button
                            mode={selectedGroupFilter === 'all' ? 'contained' : 'text'}
                            onPress={() => setSelectedGroupFilter('all')}
                            style={styles(theme).optionButton}
                            contentStyle={styles(theme).optionButtonContent}
                        >
                            Todos mis grupos
                        </Button>
                        {groups.map(group => (
                            <Button
                                key={group.id}
                                mode={selectedGroupFilter === group.id ? 'contained' : 'text'}
                                onPress={() => setSelectedGroupFilter(group.id)}
                                style={styles(theme).optionButton}
                                contentStyle={styles(theme).optionButtonContent}
                            >
                                {group.name}
                            </Button>
                        ))}

                        <Text variant="labelMedium" style={styles(theme).sectionTitle}>Tipo</Text>
                        <Button mode={selectedTypeFilter === 'all' ? 'contained' : 'text'} onPress={() => setSelectedTypeFilter('all')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Todos</Button>
                        <Button mode={selectedTypeFilter === 'matches' ? 'contained' : 'text'} onPress={() => setSelectedTypeFilter('matches')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Clásico</Button>
                        <Button mode={selectedTypeFilter === 'matchesByTeams' ? 'contained' : 'text'} onPress={() => setSelectedTypeFilter('matchesByTeams')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Por equipos</Button>
                        <Button mode={selectedTypeFilter === 'matchesByChallenge' ? 'contained' : 'text'} onPress={() => setSelectedTypeFilter('matchesByChallenge')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Reto</Button>

                        <Text variant="labelMedium" style={styles(theme).sectionTitle}>Estado</Text>
                        <Button mode={selectedStatusFilter === 'all' ? 'contained' : 'text'} onPress={() => setSelectedStatusFilter('all')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Todos</Button>
                        <Button mode={selectedStatusFilter === 'scheduled' ? 'contained' : 'text'} onPress={() => setSelectedStatusFilter('scheduled')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Por jugar</Button>
                        <Button mode={selectedStatusFilter === 'finished' ? 'contained' : 'text'} onPress={() => setSelectedStatusFilter('finished')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Finalizado</Button>
                        <Button mode={selectedStatusFilter === 'cancelled' ? 'contained' : 'text'} onPress={() => setSelectedStatusFilter('cancelled')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Cancelado</Button>

                        <Text variant="labelMedium" style={styles(theme).sectionTitle}>Participación</Text>
                        <Button mode={selectedParticipationFilter === 'all' ? 'contained' : 'text'} onPress={() => setSelectedParticipationFilter('all')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Todos los partidos</Button>
                        <Button mode={selectedParticipationFilter === 'mine' ? 'contained' : 'text'} onPress={() => setSelectedParticipationFilter('mine')} style={styles(theme).optionButton} contentStyle={styles(theme).optionButtonContent}>Solo los que jugué</Button>

                        <Button mode="contained" onPress={() => filtersSheetRef.current?.close()} style={styles(theme).applyButton}>
                            Aplicar
                        </Button>
                    </BottomSheetScrollView>
                </BottomSheet>
            </Portal>

            <AddMatchDialog
                visible={addDialogVisible}
                step={addDialogStep}
                compatibleGroups={compatibleGroupsForDialog}
                onTypeSelect={handleTypeSelect}
                onGroupSelect={handleGroupSelectConfirm}
                onBack={() => setAddDialogStep('type')}
                onDismiss={handleCloseAddDialog}
            />

            <Portal>
                <BottomSheet
                    ref={detailsSheetRef}
                    index={-1}
                    snapPoints={['90%']}
                    enablePanDownToClose
                    onChange={index => {
                        if (index === -1) {
                            setSelectedMatch(null);
                            setSelectedVotingMatchId(null);
                        }
                    }}
                    topInset={insets.top}
                    android_keyboardInputMode="adjustResize"
                    backdropComponent={renderBackdrop}
                >
                    <BottomSheetScrollView contentContainerStyle={styles(theme).detailsContent}>
                        <Text variant="titleMedium">Detalle del partido</Text>
                        {selectedMatch ? (
                            <Text variant="labelSmall" style={styles(theme).groupTypeLabel}>
                                {(groupsById.get(selectedMatch.groupId)?.name ?? 'Grupo')} · {TYPE_LABEL[selectedMatch.type]}
                            </Text>
                        ) : null}

                        {/* Acciones rápidas */}
                        {selectedMatch ? (
                            <View style={styles(theme).expandedActions}>
                                {/* Compartir — clásico y reto (teams no tiene share) */}
                                {selectedMatch.type !== 'matchesByTeams' ? (
                                    <TouchableOpacity
                                        onPress={handleShareMatch}
                                        style={styles(theme).expandedActionItem}
                                        activeOpacity={0.7}
                                    >
                                        <Icon name="whatsapp" size={22} color="#25D366" />
                                        <Text variant="labelSmall" style={styles(theme).expandedActionLabel}>Compartir</Text>
                                    </TouchableOpacity>
                                ) : null}

                                {/* Editar */}
                                {isAdminOrOwnerForSelectedGroup && selectedMatch.type !== 'matchesByTeams' ? (
                                    <TouchableOpacity
                                        style={styles(theme).expandedActionItem}
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            detailsSheetRef.current?.close();
                                            const route = selectedMatch.type === 'matchesByChallenge'
                                                ? 'EditChallengeMatch'
                                                : 'EditMatch';
                                            setTimeout(() => navigation.navigate(route, { matchId: selectedMatch.id }), 200);
                                        }}
                                    >
                                        <Icon name="pencil" size={22} color={theme.colors.primary} />
                                        <Text variant="labelSmall" style={styles(theme).expandedActionLabel}>Editar</Text>
                                    </TouchableOpacity>
                                ) : null}

                                {/* Eliminar */}
                                {isOwnerForSelectedGroup && selectedMatch.type !== 'matchesByTeams' ? (
                                    <TouchableOpacity
                                        style={styles(theme).expandedActionItem}
                                        activeOpacity={0.7}
                                        disabled={deletingMatchId === selectedMatch.id}
                                        onPress={() => handleDeleteMatchPress(selectedMatch.id, selectedMatch.type)}
                                    >
                                        <Icon name="delete-outline" size={22} color={theme.colors.error} />
                                        <Text variant="labelSmall" style={styles(theme).expandedActionLabelDanger}>
                                            {deletingMatchId === selectedMatch.id ? 'Eliminando...' : 'Eliminar'}
                                        </Text>
                                    </TouchableOpacity>
                                ) : null}

                                {/* Votar MVP */}
                                {canVoteCurrentMatch ? (
                                    <TouchableOpacity
                                        onPress={() => setSelectedVotingMatchId(selectedMatch.id)}
                                        style={styles(theme).expandedActionItem}
                                        activeOpacity={0.7}
                                    >
                                        <Icon name="star-circle-outline" size={22} color={theme.colors.secondary} />
                                        <Text variant="labelSmall" style={styles(theme).expandedActionLabel}>
                                            {hasAlreadyVoted ? 'Cambiar voto' : 'Votar MVP'}
                                        </Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        ) : null}

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
                                    onSlotPress={() => { }}
                                />
                                <View style={styles(theme).detailSpacer} />
                                <PlayersList
                                    team1Players={selectedClassicMatch.players1}
                                    team2Players={selectedClassicMatch.players2}
                                    allPlayers={selectedGroupMembers}
                                    mvpGroupMemberId={selectedClassicMatch.mvpGroupMemberId}
                                />
                            </>
                        ) : null}

                        {selectedTeamsMatch ? (
                            <>
                                <MatchLineup
                                    team1Players={selectedTeamsMatch.players1}
                                    team2Players={selectedTeamsMatch.players2}
                                    allPlayers={selectedGroupMembers}
                                    mvpGroupMemberId={selectedTeamsMatch.mvpGroupMemberId}
                                    team1Name={selectedTeams.find(team => team.id === selectedTeamsMatch.team1Id)?.name}
                                    team2Name={selectedTeams.find(team => team.id === selectedTeamsMatch.team2Id)?.name}
                                    team1Color={selectedTeams.find(team => team.id === selectedTeamsMatch.team1Id)?.color}
                                    team2Color={selectedTeams.find(team => team.id === selectedTeamsMatch.team2Id)?.color}
                                    matchDate={selectedTeamsMatch.date}
                                    onSlotPress={() => { }}
                                />
                                <View style={styles(theme).detailSpacer} />
                                <MatchByTeamsPlayersList
                                    players1={selectedTeamsMatch.players1}
                                    players2={selectedTeamsMatch.players2}
                                    team1={selectedTeams.find(team => team.id === selectedTeamsMatch.team1Id)}
                                    team2={selectedTeams.find(team => team.id === selectedTeamsMatch.team2Id)}
                                    groupMembers={selectedGroupMembers}
                                    mvpGroupMemberId={selectedTeamsMatch.mvpGroupMemberId}
                                />
                            </>
                        ) : null}

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
                                    onSlotPress={() => { }}
                                />

                                <View style={styles(theme).detailSpacer} />
                                <View style={styles(theme).sectionHeader}>
                                    <Icon name="account-group" size={20} color={theme.colors.primary} />
                                    <Text variant="titleSmall" style={styles(theme).sectionTitleText}>Jugadores</Text>
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
                                        <Divider style={styles(theme).subDivider} />
                                        <Text variant="labelSmall" style={styles(theme).subLabel}>Suplentes</Text>
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
                </BottomSheet>
            </Portal>

            {/* Modal votación MVP — clásicos y por equipos */}
            <MvpVotingModal
                visible={
                    selectedVotingMatchId !== null &&
                    (selectedMatch?.type === 'matches' || selectedMatch?.type === 'matchesByTeams')
                }
                match={selectedClassicMatch ?? selectedTeamsMatch}
                allPlayers={selectedGroupMembers}
                currentUserGroupMemberId={activeMvpMemberId}
                isVoting={isVotingClassic || isVotingTeams}
                voteError={classicVoteError ?? teamsVoteError}
                onVote={async votedId => {
                    if (selectedMatch?.type === 'matchesByTeams') {
                        await castTeamsVote(selectedMatch.id, votedId);
                    } else if (selectedMatch) {
                        await castClassicVote(selectedMatch.id, votedId);
                    }
                }}
                onDismiss={() => setSelectedVotingMatchId(null)}
                onClearError={() => {
                    clearClassicVoteError();
                    clearTeamsVoteError();
                }}
            />

            {/* Modal votación MVP — reto */}
            <ChallengeMvpVotingModal
                visible={selectedVotingMatchId !== null && selectedMatch?.type === 'matchesByChallenge'}
                match={selectedChallengeMatch}
                allPlayers={selectedGroupMembers}
                currentUserGroupMemberId={activeMvpMemberId}
                isVoting={isVotingChallenge}
                voteError={challengeVoteError}
                onVote={async votedId => {
                    if (selectedMatch) await castChallengeVote(selectedMatch.id, votedId);
                }}
                onDismiss={() => setSelectedVotingMatchId(null)}
                onClearError={clearChallengeVoteError}
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
        header: {
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 10,
        },
        headerRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        headerStats: {
            flex: 1,
            gap: 4,
        },
        headerText: {
            color: '#FFFFFF',
            opacity: 0.95,
        },
        filterButton: {
            padding: 4,
        },
        fab: {
            position: 'absolute',
            right: 20,
        },
        scroll: {
            flex: 1,
        },
        content: {
            padding: 16,
            paddingBottom: 32,
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
        groupTypeLabel: {
            color: theme.colors.primary,
            fontWeight: '700',
            marginBottom: 4,
        },
        sheetContent: {
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 24,
        },
        sheetTitle: {
            textAlign: 'center',
            marginBottom: 16,
            fontWeight: 'bold',
        },
        sectionTitle: {
            marginTop: 8,
            marginBottom: 6,
            fontWeight: '700',
            color: theme.colors.onSurfaceVariant,
        },
        optionButton: {
            marginVertical: 4,
        },
        optionButtonContent: {
            paddingVertical: 8,
        },
        expandedActions: {
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
        applyButton: {
            marginTop: 12,
        },
        detailsContent: {
            padding: 16,
            gap: 10,
            paddingBottom: 32,
        },
        detailSpacer: {
            height: 12,
        },
        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
        },
        sectionTitleText: {
            fontWeight: 'bold',
        },
        subDivider: {
            marginVertical: 6,
        },
        subLabel: {
            color: '#888',
            marginBottom: 4,
        },

    });