import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
    Avatar,
    Card,
    Divider,
    List,
    Portal,
    Searchbar,
    Snackbar,
    Text,
    useTheme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppSelector, useAppDispatch, useDebounce } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';
import {
    searchPublicGroupsByName,
    getGroupsByIds,
} from '../repositories/groups/groupsRepository';
import type { Group } from '../repositories/groups/groupsRepository';
import { selectGroup } from '../features/groups/groupsSlice';
import { searchUsersByName, type User } from '../repositories/users/usersRepository';
import PlayerProfileModal from '../components/PlayerProfileModal';
import GroupInfoModal from '../components/GroupInfoModal';
import {
    subscribeToGroupMembersV2ByGroupId,
    type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import { subscribeToMatchesByGroupId, type Match } from '../repositories/matches/matchesRepository';
import {
    subscribeToMatchesByTeamsByGroupId,
    type MatchByTeams,
} from '../repositories/matches/matchesByTeamsRepository';
import {
    subscribeToMatchesByChallengeByGroupId,
    type ChallengeMatch,
} from '../repositories/matches/matchesByChallengeRepository';
import {
    subscribeToTeamsByGroupId,
    type Team,
} from '../repositories/teams/teamsRepository';
import {
    subscribeOpenPublicListings,
    type PublicMatchListing,
} from '../repositories/publicListings/publicMatchListingsRepository';
import PublicMatchListingBottomSheet from '../components/PublicMatchListingBottomSheet';
import MatchDetailSheet from '../components/myMatches/MatchDetailSheet';
import { type UnifiedMatchItem, type SelectedMatch } from '../components/myMatches/types';

const MATCH_TYPE_LABELS: Record<string, string> = {
    futbol_5: 'Fútbol 5',
    futbol_7: 'Fútbol 7',
    futbol_11: 'Fútbol 11',
};

type FeedItem =
    | { kind: 'match'; item: UnifiedMatchItem; sortDate: string }
    | { kind: 'listing'; listing: PublicMatchListing; sortDate: string };

const formatDate = (dateIso: string) =>
    new Date(dateIso).toLocaleDateString('es-ES', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

const STATUS_COLOR: Record<string, string> = {
    scheduled: '#2196F3',
    finished: '#4CAF50',
    cancelled: '#F44336',
};

const STATUS_LABEL: Record<string, string> = {
    scheduled: 'Por jugar',
    finished: 'Finalizado',
    cancelled: 'Cancelado',
};

export default function HomeFeedScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();

    // ── Search ────────────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [groupResults, setGroupResults] = useState<Group[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedMemberName, setSelectedMemberName] = useState<string | undefined>(undefined);
    const [selectedMemberPhoto, setSelectedMemberPhoto] = useState<string | undefined>(undefined);
    const [selectedGroupResult, setSelectedGroupResult] = useState<Group | null>(null);

    // ── Listings ─────────────────────────────────────────────────────────────
    const [publicListings, setPublicListings] = useState<PublicMatchListing[]>([]);
    const [listingGroupNames, setListingGroupNames] = useState<Record<string, string>>({});
    const [publicListingsError, setPublicListingsError] = useState<string | null>(null);
    const [selectedListing, setSelectedListing] = useState<PublicMatchListing | null>(null);

    // ── Match data ───────────────────────────────────────────────────────────
    const [memberIdsByGroup, setMemberIdsByGroup] = useState<Record<string, string | null>>({});
    const [membersByGroup, setMembersByGroup] = useState<Record<string, GroupMemberV2[]>>({});
    const [classicByGroup, setClassicByGroup] = useState<Record<string, Match[]>>({});
    const [teamsMatchesByGroup, setTeamsMatchesByGroup] = useState<Record<string, MatchByTeams[]>>({});
    const [challengeByGroup, setChallengeByGroup] = useState<Record<string, ChallengeMatch[]>>({});
    const [teamsByGroup, setTeamsByGroup] = useState<Record<string, Team[]>>({});

    // ── Selected match ───────────────────────────────────────────────────────
    const [selectedMatch, setSelectedMatch] = useState<SelectedMatch | null>(null);

    // ── Snackbar ─────────────────────────────────────────────────────────────
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarVisible, setSnackbarVisible] = useState(false);

    const bottomSheetRef = useRef<BottomSheet | null>(null);
    const groupSwitcherRef = useRef<BottomSheet | null>(null);
    const groupInfoModalRef = useRef<BottomSheet | null>(null);
    const listingSheetRef = useRef<BottomSheet | null>(null);
    const detailsSheetRef = useRef<BottomSheet | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchbarRef = useRef<any>(null);
    const debouncedSearchQuery = useDebounce(searchQuery, 700);

    const dispatch = useAppDispatch();
    const { groups, selectedGroupId } = useAppSelector(state => state.groups);
    const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
    const currentUser = useAppSelector(state => state.auth.firestoreUser);
    const authUserId = firebaseUser?.uid ?? currentUser?.uid ?? null;

    const groupsById = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);

    useEffect(() => {
        const unsubscribe = subscribeOpenPublicListings(
            rows => {
                setPublicListings(rows);
                setPublicListingsError(null);
            },
            error => {
                setPublicListings([]);
                setPublicListingsError(error.message || 'No se pudieron cargar publicaciones abiertas');
            },
        );
        return unsubscribe;
    }, []);

    useEffect(() => {
        const loadGroupNames = async () => {
            const missingGroupIds = Array.from(
                new Set(
                    publicListings
                        .filter(listing => !listing.groupName)
                        .map(listing => listing.groupId)
                        .filter(Boolean),
                ),
            );

            if (missingGroupIds.length === 0) {
                const hydrated = publicListings.reduce<Record<string, string>>((acc, listing) => {
                    if (listing.groupName) {
                        acc[listing.groupId] = listing.groupName;
                    }
                    return acc;
                }, {});
                setListingGroupNames(hydrated);
                return;
            }

            try {
                const groupsMap = await getGroupsByIds(missingGroupIds);
                const hydrated = publicListings.reduce<Record<string, string>>((acc, listing) => {
                    if (listing.groupName) {
                        acc[listing.groupId] = listing.groupName;
                        return acc;
                    }

                    const group = groupsMap.get(listing.groupId);
                    if (group?.name) {
                        acc[listing.groupId] = group.name;
                    }
                    return acc;
                }, {});
                setListingGroupNames(hydrated);
            } catch {
                const hydrated = publicListings.reduce<Record<string, string>>((acc, listing) => {
                    if (listing.groupName) {
                        acc[listing.groupId] = listing.groupName;
                    }
                    return acc;
                }, {});
                setListingGroupNames(hydrated);
            }
        };

        void loadGroupNames();
    }, [publicListings]);

    useEffect(() => {
        if (!debouncedSearchQuery || debouncedSearchQuery.trim().length < 2) {
            setSearchResults([]);
            setGroupResults([]);
            setIsSearching(false);
            return;
        }

        let isMounted = true;
        const executeSearch = async () => {
            setIsSearching(true);
            try {
                const userGroupIds = groups.map(group => group.id);
                const [usersResults, publicGroups] = await Promise.all([
                    searchUsersByName(debouncedSearchQuery),
                    searchPublicGroupsByName(debouncedSearchQuery, userGroupIds),
                ]);

                if (!isMounted) return;
                setSearchResults(usersResults);
                setGroupResults(publicGroups);
            } catch {
                if (!isMounted) return;
                setSearchResults([]);
                setGroupResults([]);
            } finally {
                if (!isMounted) return;
                setIsSearching(false);
            }
        };

        void executeSearch();

        return () => {
            isMounted = false;
        };
    }, [debouncedSearchQuery, groups]);

    // ── Match subscription effects ─────────────────────────────────────────────
    useEffect(() => {
        if (!firebaseUser?.uid || groups.length === 0) {
            setMemberIdsByGroup({});
            setMembersByGroup({});
            return;
        }
        const unsubscribers = groups.map(group =>
            subscribeToGroupMembersV2ByGroupId(group.id, members => {
                const memberId = members.find(m => m.userId === firebaseUser.uid)?.id ?? null;
                setMemberIdsByGroup(prev => ({ ...prev, [group.id]: memberId }));
                setMembersByGroup(prev => ({ ...prev, [group.id]: members }));
            }),
        );
        return () => unsubscribers.forEach(u => u());
    }, [groups, firebaseUser?.uid]);

    useEffect(() => {
        if (groups.length === 0) { setClassicByGroup({}); return; }
        const unsubscribers = groups.map(g =>
            subscribeToMatchesByGroupId(g.id, matches =>
                setClassicByGroup(prev => ({ ...prev, [g.id]: matches })),
            ),
        );
        return () => unsubscribers.forEach(u => u());
    }, [groups]);

    useEffect(() => {
        if (groups.length === 0) { setTeamsMatchesByGroup({}); setTeamsByGroup({}); return; }
        const matchUnsubs = groups.map(g =>
            subscribeToMatchesByTeamsByGroupId(g.id, matches =>
                setTeamsMatchesByGroup(prev => ({ ...prev, [g.id]: matches })),
            ),
        );
        const teamsUnsubs = groups.map(g =>
            subscribeToTeamsByGroupId(g.id, teams =>
                setTeamsByGroup(prev => ({ ...prev, [g.id]: teams })),
            ),
        );
        return () => {
            matchUnsubs.forEach(u => u());
            teamsUnsubs.forEach(u => u());
        };
    }, [groups]);

    useEffect(() => {
        if (groups.length === 0) { setChallengeByGroup({}); return; }
        const unsubscribers = groups.map(g =>
            subscribeToMatchesByChallengeByGroupId(g.id, matches =>
                setChallengeByGroup(prev => ({ ...prev, [g.id]: matches })),
            ),
        );
        return () => unsubscribers.forEach(u => u());
    }, [groups]);

    // ── Derived data ───────────────────────────────────────────────────────────
    const allMatches = useMemo<UnifiedMatchItem[]>(() => {
        const rows: UnifiedMatchItem[] = [];
        groups.forEach(group => {
            const memberId = memberIdsByGroup[group.id] ?? null;

            (classicByGroup[group.id] ?? []).forEach(match => {
                rows.push({
                    id: match.id,
                    key: `matches_${match.id}`,
                    groupId: group.id,
                    groupName: group.name,
                    type: 'matches',
                    date: match.date,
                    status: (match.status ?? 'finished') as UnifiedMatchItem['status'],
                    leftLabel: 'Equipo 1',
                    rightLabel: 'Equipo 2',
                    leftScore: Number(match.goalsTeam1 ?? 0),
                    rightScore: Number(match.goalsTeam2 ?? 0),
                    isParticipant: memberId !== null && [...match.players1, ...match.players2].some(p => p.groupMemberId === memberId),
                });
            });

            (teamsMatchesByGroup[group.id] ?? []).forEach(match => {
                const teams = teamsByGroup[group.id] ?? [];
                const team1 = teams.find(t => t.id === match.team1Id);
                const team2 = teams.find(t => t.id === match.team2Id);
                rows.push({
                    id: match.id,
                    key: `matchesByTeams_${match.id}`,
                    groupId: group.id,
                    groupName: group.name,
                    type: 'matchesByTeams',
                    date: match.date,
                    status: (match.status ?? 'finished') as UnifiedMatchItem['status'],
                    leftLabel: team1?.name ?? 'Equipo 1',
                    rightLabel: team2?.name ?? 'Equipo 2',
                    leftScore: Number(match.goalsTeam1 ?? 0),
                    rightScore: Number(match.goalsTeam2 ?? 0),
                    isParticipant: memberId !== null && [...match.players1, ...match.players2].some(p => p.groupMemberId === memberId),
                });
            });

            (challengeByGroup[group.id] ?? []).forEach(match => {
                rows.push({
                    id: match.id,
                    key: `matchesByChallenge_${match.id}`,
                    groupId: group.id,
                    groupName: group.name,
                    type: 'matchesByChallenge',
                    date: match.date,
                    status: match.status,
                    leftLabel: group.name,
                    rightLabel: match.opponentName.trim() || 'Rival',
                    leftScore: Number(match.goalsTeam ?? 0),
                    rightScore: Number(match.goalsOpponent ?? 0),
                    isParticipant: memberId !== null && match.players.some(p => p.groupMemberId === memberId),
                });
            });
        });
        return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [groups, memberIdsByGroup, classicByGroup, teamsMatchesByGroup, challengeByGroup, teamsByGroup]);

    const feedItems = useMemo<FeedItem[]>(() => {
        const matchItems: FeedItem[] = allMatches.map(item => ({
            kind: 'match',
            item,
            sortDate: item.date,
        }));
        const listingItems: FeedItem[] = publicListings.map(listing => ({
            kind: 'listing',
            listing,
            // listings have publishedAt, fall back to matchDate
            sortDate: (listing as unknown as Record<string, string>).publishedAt ?? listing.matchDate ?? new Date().toISOString(),
        }));
        return [...matchItems, ...listingItems].sort(
            (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime(),
        );
    }, [allMatches, publicListings]);

    const handleSelectMember = (member: User) => {
        searchbarRef.current?.blur();
        setSelectedUserId(member.id);
        setSelectedMemberName(member.displayName ?? undefined);
        setSelectedMemberPhoto(member.photoURL ?? undefined);
        setSearchQuery('');
        setSearchResults([]);
        setGroupResults([]);
        setTimeout(() => bottomSheetRef.current?.expand(), 100);
    };

    const handleSelectGroupResult = (group: Group) => {
        searchbarRef.current?.blur();
        setSelectedGroupResult(group);
        setSearchQuery('');
        setSearchResults([]);
        setGroupResults([]);
        setTimeout(() => groupInfoModalRef.current?.expand(), 100);
    };

    const handleSwitchGroup = useCallback(
        (groupId: string) => {
            if (!authUserId) return;
            dispatch(selectGroup({ userId: authUserId, groupId }));
            groupSwitcherRef.current?.close();
        },
        [authUserId, dispatch],
    );

    const renderGroupBackdrop = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
        [],
    );

    const handleOpenListing = (listing: PublicMatchListing) => {
        setSelectedListing(listing);
        setTimeout(() => listingSheetRef.current?.expand(), 100);
    };

    const getListingGroupName = (listing: PublicMatchListing): string =>
        listing.groupName ?? listingGroupNames[listing.groupId] ?? 'Grupo';

    const openMatchDetails = useCallback((item: UnifiedMatchItem) => {
        setSelectedMatch({ id: item.id, groupId: item.groupId, type: item.type });
        setTimeout(() => detailsSheetRef.current?.expand(), 80);
    }, []);

    // ── Feed item renderers ────────────────────────────────────────────────────
    const renderFeedItem = ({ item: feedItem }: { item: FeedItem }) => {
        if (feedItem.kind === 'listing') {
            const { listing } = feedItem;
            const groupName = getListingGroupName(listing);
            const spotsLeft = Math.max(0, listing.neededPlayers - listing.acceptedPlayers);
            return (
                <TouchableOpacity
                    style={styles.feedRow}
                    activeOpacity={0.6}
                    onPress={() => handleOpenListing(listing)}
                >
                    <View style={styles.feedMeta}>
                        <View style={[styles.feedDot, { backgroundColor: theme.colors.secondary }]} />
                        <Text
                            variant="labelSmall"
                            style={[styles.feedMetaType, { color: theme.colors.secondary }]}
                        >
                            Búsqueda
                        </Text>
                        <Text variant="labelSmall" style={styles.feedMetaSub} numberOfLines={1}>
                            · {groupName}
                        </Text>
                        <Icon
                            name="chevron-right"
                            size={14}
                            color={theme.colors.onSurfaceVariant}
                            style={styles.feedMetaChevron}
                        />
                    </View>
                    <Text variant="bodyMedium" style={styles.feedRowTitle} numberOfLines={1}>
                        {formatDate(listing.matchDate)}
                        {listing.city ? ` · ${listing.city}` : ''}
                    </Text>
                    <Text variant="bodySmall" style={styles.feedRowSubtitle}>
                        {spotsLeft === 0
                            ? 'Sin cupos disponibles'
                            : `${spotsLeft} cupo${spotsLeft !== 1 ? 's' : ''} disponible${spotsLeft !== 1 ? 's' : ''}`}
                    </Text>
                    {listing.notes ? (
                        <Text variant="bodySmall" style={styles.feedRowNotes} numberOfLines={2}>
                            {listing.notes}
                        </Text>
                    ) : null}
                </TouchableOpacity>
            );
        }

        const { item } = feedItem;
        const typeColor =
            item.type === 'matchesByChallenge'
                ? ((theme.colors as unknown as Record<string, string>).tertiary ?? theme.colors.primary)
                : item.type === 'matchesByTeams'
                    ? theme.colors.secondary
                    : theme.colors.primary;

        return (
            <TouchableOpacity
                style={styles.feedRow}
                activeOpacity={0.6}
                onPress={() => openMatchDetails(item)}
            >
                <View style={styles.feedMeta}>
                    <View style={[styles.feedDot, { backgroundColor: typeColor }]} />
                    <Text variant="labelSmall" style={[styles.feedMetaType, { color: typeColor }]}>
                        Partido
                    </Text>
                    <Text variant="labelSmall" style={styles.feedMetaSub} numberOfLines={1}>
                        · {item.groupName}
                    </Text>
                    {item.isParticipant ? (
                        <View style={styles.participantBadge}>
                            <Icon name="check-circle" size={11} color={theme.colors.primary} />
                            <Text variant="labelSmall" style={[styles.participantLabel, { color: theme.colors.primary }]}>
                                Yo jugué
                            </Text>
                        </View>
                    ) : null}
                </View>
                <Text variant="bodyMedium" style={styles.feedRowTitle}>
                    {item.leftLabel} vs {item.rightLabel}
                </Text>
                {item.status === 'finished' ? (
                    <Text variant="titleMedium" style={[styles.feedRowScore, { color: typeColor }]}>
                        {item.leftScore} – {item.rightScore}
                    </Text>
                ) : null}
                <View style={styles.feedRowBottom}>
                    <Text variant="bodySmall" style={styles.feedRowSubtitle}>
                        {formatDate(item.date)}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
                        <Text variant="labelSmall" style={[styles.statusPillText, { color: STATUS_COLOR[item.status] }]}>
                            {STATUS_LABEL[item.status] ?? item.status}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const ListHeader = (): React.ReactElement => (
        <View style={styles.searchContainer}>
            <Searchbar
                ref={searchbarRef}
                placeholder="Buscar jugadores o grupos..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                icon="magnify"
                iconColor={theme.colors.secondary}
                style={{ ...styles.searchbar, backgroundColor: theme.colors.onPrimary }}
                elevation={2}
                loading={isSearching}
            />

            {(searchResults.length > 0 || groupResults.length > 0) && (
                <Card style={styles.searchResultsCard} elevation={4}>
                    {searchResults.length > 0 && (
                        <View>
                            <View style={styles.searchSectionHeader}>
                                <Icon name="account-group" size={14} color={theme.colors.onSurfaceVariant} />
                                <Text variant="labelSmall" style={[styles.searchSectionLabel, { color: theme.colors.onSurfaceVariant }]}>
                                    JUGADORES
                                </Text>
                            </View>
                            {searchResults.map((member, index) => (
                                <View key={member.id}>
                                    <List.Item
                                        title={member.displayName ?? 'Sin nombre'}
                                        description={member.email ?? 'Usuario registrado'}
                                        left={
                                            member.photoURL
                                                ? () => <Avatar.Image size={40} source={{ uri: member.photoURL ?? undefined }} style={styles.searchAvatar} />
                                                : () => <Avatar.Icon size={40} icon="account" style={styles.searchAvatar} />
                                        }
                                        right={() => <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />}
                                        onPress={() => handleSelectMember(member)}
                                        style={styles.searchResultItem}
                                    />
                                    {index < searchResults.length - 1 && <Divider />}
                                </View>
                            ))}
                        </View>
                    )}

                    {groupResults.length > 0 && (
                        <View>
                            {searchResults.length > 0 && <Divider bold />}
                            <View style={styles.searchSectionHeader}>
                                <Icon name="earth" size={14} color={theme.colors.onSurfaceVariant} />
                                <Text variant="labelSmall" style={[styles.searchSectionLabel, { color: theme.colors.onSurfaceVariant }]}>
                                    GRUPOS PÚBLICOS
                                </Text>
                            </View>
                            {groupResults.map((group, index) => (
                                <View key={group.id}>
                                    <List.Item
                                        title={group.name}
                                        description={group.description || MATCH_TYPE_LABELS[group.type] || 'Grupo público'}
                                        left={() => (
                                            <Avatar.Icon
                                                size={40}
                                                icon="account-group"
                                                style={[styles.searchAvatar, { backgroundColor: theme.colors.primaryContainer }]}
                                                color={theme.colors.primary}
                                            />
                                        )}
                                        right={() => <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />}
                                        onPress={() => handleSelectGroupResult(group)}
                                        style={styles.searchResultItem}
                                    />
                                    {index < groupResults.length - 1 && <Divider />}
                                </View>
                            ))}
                        </View>
                    )}
                </Card>
            )}
        </View>
    );

    const ListEmpty = feedItems.length === 0 ? (
        <View style={styles.emptyState}>
            {groups.length === 0 ? (
                <>
                    <Icon name="account-group-outline" size={48} color={theme.colors.onSurfaceVariant} />
                    <Text variant="titleMedium" style={styles.emptyTitle}>Sin grupos</Text>
                    <Text variant="bodySmall" style={styles.emptySubtitle}>
                        Únete o crea un grupo para ver tus partidos aquí.
                    </Text>
                </>
            ) : (
                <>
                    <Icon name="soccer" size={48} color={theme.colors.onSurfaceVariant} />
                    <Text variant="titleMedium" style={styles.emptyTitle}>Sin actividad todavía</Text>
                    <Text variant="bodySmall" style={styles.emptySubtitle}>
                        Los partidos y publicaciones de tus grupos aparecerán aquí.
                    </Text>
                </>
            )}
        </View>
    ) : null;

    return (
        <View style={styles.container}>
            <FlatList
                data={feedItems}
                keyExtractor={feedItem =>
                    feedItem.kind === 'match' ? feedItem.item.key : `listing_${feedItem.listing.id}`
                }
                renderItem={renderFeedItem}
                ListHeaderComponent={ListHeader}
                ListEmptyComponent={ListEmpty}
                ItemSeparatorComponent={() => <Divider />}
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
            />

            <Portal>
                {/* Listing detail sheet */}
                <PublicMatchListingBottomSheet
                    bottomSheetRef={listingSheetRef}
                    selectedListing={selectedListing}
                    authUserId={authUserId}
                    getListingGroupName={getListingGroupName}
                    backdropComponent={renderGroupBackdrop}
                    onFeedback={message => {
                        setSnackbarMessage(message);
                        setSnackbarVisible(true);
                    }}
                />

                {/* Match detail sheet */}
                <BottomSheet
                    ref={detailsSheetRef}
                    index={-1}
                    snapPoints={['90%']}
                    enablePanDownToClose
                    onChange={index => {
                        if (index === -1) setSelectedMatch(null);
                    }}
                    topInset={insets.top}
                    android_keyboardInputMode="adjustResize"
                    backdropComponent={renderGroupBackdrop}
                >
                    <MatchDetailSheet
                        bottomSheetRef={detailsSheetRef}
                        selectedMatch={selectedMatch}
                        classicByGroup={classicByGroup}
                        teamsMatchesByGroup={teamsMatchesByGroup}
                        challengeByGroup={challengeByGroup}
                        membersByGroup={membersByGroup}
                        memberIdsByGroup={memberIdsByGroup}
                        teamsByGroup={teamsByGroup}
                        groupsById={groupsById}
                        firebaseUser={firebaseUser}
                        onDismiss={() => setSelectedMatch(null)}
                        onNavigate={(route, matchId) => navigation.navigate(route, { matchId })}
                    />
                </BottomSheet>

                {/* Group switcher */}
                <BottomSheet
                    ref={groupSwitcherRef}
                    index={-1}
                    snapPoints={['50%']}
                    enablePanDownToClose
                    backdropComponent={renderGroupBackdrop}
                >
                    <View style={styles.groupSheetContent}>
                        <Text variant="titleMedium" style={styles.groupSheetTitle}>Cambiar Grupo</Text>
                        <BottomSheetFlatList
                            data={groups}
                            keyExtractor={(item: Group) => item.id}
                            renderItem={({ item }: { item: Group }) => {
                                const isSelected = item.id === selectedGroupId;
                                return (
                                    <TouchableOpacity style={styles.groupSheetItem} onPress={() => handleSwitchGroup(item.id)}>
                                        <View style={styles.groupSheetItemInfo}>
                                            <Text
                                                variant="titleSmall"
                                                style={[styles.groupSheetItemName, isSelected && { color: theme.colors.primary }]}
                                            >
                                                {item.name}
                                            </Text>
                                            {item.description ? (
                                                <Text variant="bodySmall" style={styles.groupSheetItemDesc} numberOfLines={1}>
                                                    {item.description}
                                                </Text>
                                            ) : null}
                                        </View>
                                        {isSelected && <Icon name="check-circle" size={22} color={theme.colors.primary} />}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </BottomSheet>

                <PlayerProfileModal
                    userId={selectedUserId}
                    playerName={selectedMemberName}
                    playerPhotoURL={selectedMemberPhoto}
                    bottomSheetRef={bottomSheetRef}
                />

                <GroupInfoModal
                    group={selectedGroupResult}
                    currentUserId={authUserId}
                    currentUserEmail={currentUser?.email ?? firebaseUser?.email ?? null}
                    currentUserDisplayName={currentUser?.displayName ?? firebaseUser?.displayName ?? null}
                    currentUserPhotoURL={(currentUser?.photoURL as string | null) ?? firebaseUser?.photoURL ?? null}
                    bottomSheetRef={groupInfoModalRef}
                />
            </Portal>

            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={2500}>
                {snackbarMessage}
            </Snackbar>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    content: { paddingBottom: 16 },
    searchContainer: { marginBottom: 0, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0' },
    searchbar: { borderRadius: 28, elevation: 2 },
    searchResultsCard: {
        marginTop: 8,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        maxHeight: 400,
    },
    searchResultItem: { paddingVertical: 8 },
    searchAvatar: { marginLeft: 8, marginRight: 8 },
    searchSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 4,
    },
    searchSectionLabel: { fontWeight: '700', letterSpacing: 0.5 },
    emptyState: {
        paddingVertical: 48,
        alignItems: 'center',
        gap: 12,
    },
    emptyTitle: { fontWeight: '700', color: '#444' },
    emptySubtitle: { textAlign: 'center', color: '#888', paddingHorizontal: 32 },
    // Feed rows (Twitter/Facebook style)
    feedRow: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 4,
    },
    feedMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 2,
    },
    feedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    feedMetaType: { fontWeight: '700', letterSpacing: 0.2 },
    feedMetaSub: { color: '#888', flex: 1 },
    feedMetaChevron: { marginLeft: 4 },
    feedRowTitle: { fontWeight: '700', color: '#1A1A1A' },
    feedRowScore: { fontWeight: '900', lineHeight: 28 },
    feedRowSubtitle: { color: '#666' },
    feedRowNotes: { color: '#888', fontStyle: 'italic' },
    feedRowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    participantBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    participantLabel: { fontSize: 10, fontWeight: '700' },
    statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
    statusPillText: { fontSize: 10, fontWeight: '700' },
    // Group switcher sheet
    groupSheetContent: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    groupSheetTitle: { textAlign: 'center', marginBottom: 12, fontWeight: 'bold' },
    groupSheetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E0E0E0',
    },
    groupSheetItemInfo: { flex: 1 },
    groupSheetItemName: { fontWeight: '600' },
    groupSheetItemDesc: { color: '#888', marginTop: 2 },
});
