import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  Card,
  Searchbar,
  Text,
  useTheme,
  Avatar,
  List,
  Divider,
  Portal,
  Button,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';

import { useAppSelector, useAppDispatch, useDebounce } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';
import {
  subscribeToUserRoleInGroup,
  searchPublicGroupsByName,
} from '../repositories/groups/groupsRepository';
import type { Group } from '../repositories/groups/groupsRepository';
import { selectGroup } from '../features/groups/groupsSlice';
import {
  searchUsersByName,
  type User,
} from '../repositories/users/usersRepository';
import PlayerProfileModal from '../components/PlayerProfileModal';
import GroupInfoModal from '../components/GroupInfoModal';
import { subscribeToGroupMembersV2ByGroupId } from '../repositories/groupMembersV2/groupMembersV2Repository';
import { subscribeToMatchesByGroupId } from '../repositories/matches/matchesRepository';
import { subscribeToMatchesByTeamsByGroupId } from '../repositories/matches/matchesByTeamsRepository';
import { subscribeToMatchesByChallengeByGroupId } from '../repositories/matches/matchesByChallengeRepository';

const MATCH_TYPE_LABELS: Record<string, string> = {
  futbol_5: 'Fútbol 5',
  futbol_7: 'Fútbol 7',
  futbol_11: 'Fútbol 11',
};

type FeedMatchSummary = {
  id: string;
  date: string;
  status: 'scheduled' | 'finished' | 'cancelled';
  title: string;
  subtitle: string;
  playerGoals: number;
  playerAssists: number;
};

const formatMatchDate = (dateIso: string) =>
  new Date(dateIso).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const getStatusCopy = (status: FeedMatchSummary['status']) => {
  if (status === 'scheduled') return 'Programado';
  if (status === 'cancelled') return 'Cancelado';
  return 'Finalizado';
};

export default function HomeFeedScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const [searchQuery, setSearchQuery] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedMemberName, setSelectedMemberName] = useState<string | undefined>(undefined);
  const [selectedMemberPhoto, setSelectedMemberPhoto] = useState<string | undefined>(undefined);
  const [groupResults, setGroupResults] = useState<Group[]>([]);
  const [selectedGroupResult, setSelectedGroupResult] = useState<Group | null>(null);
  const [userMatches, setUserMatches] = useState<FeedMatchSummary[]>([]);

  const bottomSheetRef = useRef<BottomSheet | null>(null);
  const groupSwitcherRef = useRef<BottomSheet | null>(null);
  const groupInfoModalRef = useRef<BottomSheet | null>(null);
  const searchbarRef = useRef<any>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 700);

  const dispatch = useAppDispatch();
  const { groups, selectedGroupId } = useAppSelector(state => state.groups);
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const currentUser = useAppSelector(state => state.auth.firestoreUser);
  const authUserId = firebaseUser?.uid ?? currentUser?.uid ?? null;

  const activeGroup = useMemo(
    () => groups.find(group => group.id === selectedGroupId),
    [groups, selectedGroupId],
  );

  const isOwner = activeGroup?.ownerId === authUserId;
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  const scheduledMatches = useMemo(
    () => userMatches.filter(match => match.status === 'scheduled').slice(0, 5),
    [userMatches],
  );

  const previousMatches = useMemo(
    () => userMatches.filter(match => match.status === 'finished' || match.status === 'cancelled').slice(0, 5),
    [userMatches],
  );

  useEffect(() => {
    if (!selectedGroupId || !authUserId) {
      setUserRole(null);
      return;
    }

    const unsubscribe = subscribeToUserRoleInGroup(
      selectedGroupId,
      authUserId,
      role => setUserRole(role),
      () => setUserRole(null),
    );

    return () => unsubscribe();
  }, [selectedGroupId, authUserId]);

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

  useEffect(() => {
    if (!selectedGroupId || !authUserId || !activeGroup) {
      setUserMatches([]);
      return;
    }

    let currentGroupMemberId: string | null = null;
    let unsubscribeMatches: (() => void) | null = null;

    const unsubscribeMembers = subscribeToGroupMembersV2ByGroupId(
      selectedGroupId,
      members => {
        currentGroupMemberId = members.find(member => member.userId === authUserId)?.id ?? null;
        if (!currentGroupMemberId) {
          setUserMatches([]);
          unsubscribeMatches?.();
          unsubscribeMatches = null;
          return;
        }

        unsubscribeMatches?.();

        if (activeGroup.isChallengeMode) {
          unsubscribeMatches = subscribeToMatchesByChallengeByGroupId(selectedGroupId, matches => {
            const next = matches
              .filter(match => match.players.some(player => player.groupMemberId === currentGroupMemberId))
              .map(match => ({
                id: match.id,
                date: match.date,
                status: match.status,
                title: `${activeGroup.name} vs ${match.opponentName.trim() || 'Rival'}`,
                subtitle:
                  match.status === 'scheduled'
                    ? 'Programado'
                    : `${match.goalsTeam} - ${match.goalsOpponent}`,
                playerGoals:
                  match.players.find(player => player.groupMemberId === currentGroupMemberId)?.goals ?? 0,
                playerAssists:
                  match.players.find(player => player.groupMemberId === currentGroupMemberId)?.assists ?? 0,
              }));
            setUserMatches(next);
          });
          return;
        }

        if (activeGroup.hasFixedTeams) {
          unsubscribeMatches = subscribeToMatchesByTeamsByGroupId(selectedGroupId, matches => {
            const next = matches
              .filter(match =>
                [...match.players1, ...match.players2].some(
                  player => player.groupMemberId === currentGroupMemberId,
                ),
              )
              .map(match => ({
                id: match.id,
                date: match.date,
                status: match.status ?? 'finished',
                title: activeGroup.name,
                subtitle:
                  match.status === 'scheduled'
                    ? 'Programado'
                    : `${match.goalsTeam1} - ${match.goalsTeam2}`,
                playerGoals:
                  [...match.players1, ...match.players2].find(
                    player => player.groupMemberId === currentGroupMemberId,
                  )?.goals ?? 0,
                playerAssists:
                  [...match.players1, ...match.players2].find(
                    player => player.groupMemberId === currentGroupMemberId,
                  )?.assists ?? 0,
              }));
            setUserMatches(next);
          });
          return;
        }

        unsubscribeMatches = subscribeToMatchesByGroupId(selectedGroupId, matches => {
          const next = matches
            .filter(match =>
              [...match.players1, ...match.players2].some(
                player => player.groupMemberId === currentGroupMemberId,
              ),
            )
            .map(match => ({
              id: match.id,
              date: match.date,
              status: match.status ?? 'finished',
              title: activeGroup.name,
              subtitle:
                match.status === 'scheduled'
                  ? 'Programado'
                  : `${match.goalsTeam1} - ${match.goalsTeam2}`,
              playerGoals:
                [...match.players1, ...match.players2].find(
                  player => player.groupMemberId === currentGroupMemberId,
                )?.goals ?? 0,
              playerAssists:
                [...match.players1, ...match.players2].find(
                  player => player.groupMemberId === currentGroupMemberId,
                )?.assists ?? 0,
            }));
          setUserMatches(next);
        });
      },
      () => setUserMatches([]),
    );

    return () => {
      unsubscribeMembers();
      unsubscribeMatches?.();
    };
  }, [selectedGroupId, authUserId, activeGroup]);

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

  const goToMatches = () => {
    if (activeGroup?.isChallengeMode) {
      navigation.navigate('ChallengeMatches');
      return;
    }

    if (activeGroup?.hasFixedTeams) {
      navigation.navigate('MatchesByTeams');
      return;
    }

    navigation.navigate('Matches');
  };

  const renderMatchRow = (
    match: FeedMatchSummary,
    showStatus: boolean = true,
    showPlayerStats: boolean = false,
  ) => (
    <View key={match.id} style={styles.matchRow}>
      <View style={styles.matchInfo}>
        <Text variant="titleSmall">{match.title}</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatMatchDate(match.date)} · {match.subtitle}
        </Text>
        {showPlayerStats && (
          <View style={styles.matchStatsRow}>
            <View style={styles.matchStatItem}>
              <Icon name="soccer" size={13} color={theme.colors.primary} />
              <Text style={[styles.matchStatText, { color: theme.colors.primary }]}> {match.playerGoals}</Text>
            </View>
            <View style={styles.matchStatItem}>
              <Icon name="shoe-cleat" size={12} color={theme.colors.secondary} />
              <Text style={[styles.matchStatText, { color: theme.colors.secondary }]}> {match.playerAssists}</Text>
            </View>
          </View>
        )}
      </View>
      {showStatus && (
        <View style={styles.matchRightColumn}>
          <Icon
            name={match.status === 'scheduled' ? 'calendar-clock' : 'history'}
            size={18}
            color={theme.colors.primary}
          />
          <Text style={[styles.statusPill, { color: theme.colors.primary }]}>{getStatusCopy(match.status)}</Text>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
                  <Text variant="labelSmall" style={[styles.searchSectionLabel, { color: theme.colors.onSurfaceVariant }]}>JUGADORES</Text>
                </View>
                {searchResults.map((member, index) => (
                  <View key={member.id}>
                    <List.Item
                      title={member.displayName ?? 'Sin nombre'}
                      description={member.email ?? 'Usuario registrado'}
                      left={member.photoURL ? () => (
                        <Avatar.Image size={40} source={{ uri: member.photoURL ?? undefined }} style={styles.searchAvatar} />
                      ) : () => (
                        <Avatar.Icon size={40} icon="account" style={styles.searchAvatar} />
                      )}
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
                  <Text variant="labelSmall" style={[styles.searchSectionLabel, { color: theme.colors.onSurfaceVariant }]}>GRUPOS PÚBLICOS</Text>
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

      {!activeGroup && (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text variant="titleMedium">No tienes un grupo activo</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
              Puedes seguir explorando jugadores y oportunidades públicas mientras eliges grupo.
            </Text>
            <Button mode="outlined" style={styles.infoCta} onPress={() => groupSwitcherRef.current?.expand()}>
              Seleccionar grupo
            </Button>
          </Card.Content>
        </Card>
      )}

      <Card style={styles.sectionCard}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <Icon name="soccer-field" size={20} color={theme.colors.primary} />
            <Text variant="titleMedium">Partidos públicos buscando jugadores</Text>
          </View>
          <Text style={styles.sectionKicker}>Publicaciones de la comunidad</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Próximamente podrás ver y sumarte a partidos abiertos.</Text>
        </Card.Content>
      </Card>

      <Card style={styles.sectionCard}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <Icon name="account-search-outline" size={20} color={theme.colors.primary} />
            <Text variant="titleMedium">Jugadores buscando partidos</Text>
          </View>
          <Text style={styles.sectionKicker}>Disponibilidad de jugadores</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Próximamente podrás encontrar jugadores disponibles para completar cupos.</Text>
        </Card.Content>
      </Card>

      <Card style={styles.sectionCard}>
        <Card.Content>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeader}>
              <Icon name="calendar-clock" size={20} color={theme.colors.primary} />
              <Text variant="titleMedium">Mis partidos programados</Text>
            </View>
            <Button compact mode="text" onPress={goToMatches}>Ver todos</Button>
          </View>
          <Text style={styles.sectionKicker}>Próximos compromisos</Text>
          {scheduledMatches.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>No tienes partidos programados.</Text>
          ) : (
            scheduledMatches.map(match => renderMatchRow(match, true, false))
          )}
        </Card.Content>
      </Card>

      <Card style={styles.sectionCard}>
        <Card.Content>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeader}>
              <Icon name="history" size={20} color={theme.colors.primary} />
              <Text variant="titleMedium">Mis partidos previos</Text>
            </View>
            <Button compact mode="text" onPress={goToMatches}>Ver todos</Button>
          </View>
          <Text style={styles.sectionKicker}>Historial reciente</Text>
          {previousMatches.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Aún no tienes historial de partidos.</Text>
          ) : (
            previousMatches.map(match => renderMatchRow(match, false, true))
          )}
        </Card.Content>
      </Card>

      <Portal>
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
                      <Text variant="titleSmall" style={[styles.groupSheetItemName, isSelected && { color: theme.colors.primary }]}>
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

      {(isOwner || isAdmin) && activeGroup && (
        <Button
          mode="contained"
          buttonColor={theme.colors.secondary}
          textColor={theme.colors.onSecondary}
          style={styles.adminCta}
          icon="cog"
          onPress={() => navigation.navigate('Admin')}
        >
          Administrar Grupo
        </Button>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 12, paddingBottom: 26, paddingTop: 10 },
  searchContainer: { zIndex: 0 },
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
  infoCard: { borderRadius: 14, backgroundColor: '#FFFFFF' },
  infoCta: { marginTop: 10, alignSelf: 'flex-start' },
  sectionCard: { borderRadius: 14, backgroundColor: '#FFFFFF' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionKicker: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '600',
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  matchRightColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusPill: {
    fontSize: 10,
    fontWeight: '700',
  },
  matchInfo: { flex: 1, paddingRight: 8 },
  matchStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
  },
  matchStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchStatText: {
    fontSize: 12,
    fontWeight: '700',
  },
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
  adminCta: { marginTop: 2, borderRadius: 24 },
});
