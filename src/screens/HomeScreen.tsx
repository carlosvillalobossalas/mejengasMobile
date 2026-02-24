import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
    Card,
    Searchbar,
    Text,
    useTheme,
    Chip,
    IconButton,
    Avatar,
    List,
    Divider,
    Portal,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon, MaterialDesignIconsIconName } from '@react-native-vector-icons/material-design-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';

import { useAppSelector, useAppDispatch, useDebounce } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';
import { subscribeToUserRoleInGroup } from '../repositories/groups/groupsRepository';
import type { Group } from '../repositories/groups/groupsRepository';
import { selectGroup } from '../features/groups/groupsSlice';
import {
    searchGroupMembersByDisplayName,
    type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import PlayerProfileModal from '../components/PlayerProfileModal';

type ActionCard = {
    id: string;
    title: string;
    icon: MaterialDesignIconsIconName;
    color: string;
    iconColor: string;
    size: 'small' | 'medium' | 'large';
    onPress: () => void;
};

// Icon render functions for Chips - moved outside component to avoid warnings
const EyeIcon = () => <Icon name="eye" size={16} color="#666" />;
const ShapeIcon = () => <Icon name="shape" size={16} color="#666" />;
const CheckCircleIcon = () => <Icon name="check-circle" size={16} color="#4CAF50" />;

const MATCH_TYPE_LABELS: Record<string, string> = {
    futbol_5: 'Fútbol 5',
    futbol_7: 'Fútbol 7',
    futbol_11: 'Fútbol 11',
};

const SoccerIcon = () => <Icon name="soccer" size={14} color="#555" />;

export default function HomeScreen() {
    const theme = useTheme();
    const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
    const [searchQuery, setSearchQuery] = useState('');
    const [userRole, setUserRole] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<GroupMemberV2[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedGroupMemberId, setSelectedGroupMemberId] = useState<string | null>(null);
    const [selectedMemberName, setSelectedMemberName] = useState<string | undefined>(undefined);
    const [selectedMemberPhoto, setSelectedMemberPhoto] = useState<string | undefined>(undefined);
    const bottomSheetRef = useRef<BottomSheet | null>(null);
    const groupSwitcherRef = useRef<BottomSheet | null>(null);
    const searchbarRef = useRef<any>(null);
    const debouncedSearchQuery = useDebounce(searchQuery, 700);
    const [showGroupDescription, setShowGroupDescription] = useState(false);

    const dispatch = useAppDispatch();

    const { groups, selectedGroupId } = useAppSelector(state => state.groups);
    const currentUser = useAppSelector(state => state.auth.firestoreUser);

    const activeGroup = useMemo(
        () => groups.find(g => g.id === selectedGroupId),
        [groups, selectedGroupId],
    );

    const isOwner = activeGroup?.ownerId === currentUser?.uid;
    const isAdmin = userRole === 'admin' || userRole === 'owner';

    // Reset description panel when switching groups
    useEffect(() => {
        setShowGroupDescription(false);
    }, [selectedGroupId]);

    // Subscribe to user role in real-time so permission changes reflect immediately
    useEffect(() => {
        if (!selectedGroupId || !currentUser?.uid) {
            setUserRole(null);
            return;
        }

        const unsubscribe = subscribeToUserRoleInGroup(
            selectedGroupId,
            currentUser.uid,
            role => setUserRole(role),
            error => {
                console.error('Error subscribing to user role:', error);
                setUserRole(null);
            },
        );

        return () => unsubscribe();
    }, [selectedGroupId, currentUser?.uid]);

    // Execute search when debounced query or selected group changes
    useEffect(() => {
        const executeSearch = async () => {
            if (!debouncedSearchQuery || debouncedSearchQuery.trim().length < 2) {
                setSearchResults([]);
                setIsSearching(false);
                return;
            }

            // Search is scoped to the currently selected group
            if (!selectedGroupId) {
                setSearchResults([]);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            try {
                const results = await searchGroupMembersByDisplayName(selectedGroupId, debouncedSearchQuery);
                setSearchResults(results);
            } catch (error) {
                console.error('Error searching group members:', error);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        executeSearch();
    }, [debouncedSearchQuery, selectedGroupId]);

    const handleSelectMember = (member: GroupMemberV2) => {
        // Blur searchbar to hide keyboard and remove focus
        searchbarRef.current?.blur();

        setSelectedGroupMemberId(member.id);
        setSelectedMemberName(member.displayName);
        setSelectedMemberPhoto(member.photoUrl || undefined);

        setSearchQuery('');
        setSearchResults([]);

        // Open modal after state is set
        setTimeout(() => {
            bottomSheetRef.current?.expand();
        }, 100);
    };

    const handleSwitchGroup = useCallback((groupId: string) => {
        if (!currentUser?.uid) return;
        dispatch(selectGroup({ userId: currentUser.uid, groupId }));
        groupSwitcherRef.current?.close();
    }, [currentUser?.uid, dispatch]);

    const renderGroupBackdrop = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        ),
        [],
    );

    const actionCards: ActionCard[] = useMemo(() => {
        const cards: ActionCard[] = [
            {
                id: 'players',
                title: 'Jugadores',
                icon: 'account-group',
                color: theme.colors.onPrimary,
                iconColor: theme.colors.primary,
                size: 'medium',
                onPress: () => navigation.navigate('PlayersTable'),
            },
            {
                id: 'goalkeepers',
                title: 'Porteros',
                icon: 'hand-back-right',
                color: theme.colors.onPrimary,
                iconColor: theme.colors.primary,
                size: 'large',
                onPress: () => navigation.navigate('GoalkeepersTable'),
            },
            {
                id: 'matches',
                title: 'Partidos',
                icon: 'soccer',
                color: theme.colors.onPrimary,
                iconColor: theme.colors.primary,
                size: 'large',
                onPress: () =>
                    activeGroup?.hasFixedTeams
                        ? navigation.navigate('MatchesByTeams')
                        : navigation.navigate('Matches'),
            },
            ...(activeGroup?.hasFixedTeams
                ? [
                    {
                        id: 'teamStandings',
                        title: 'Tabla de Equipos',
                        icon: 'shield-star' as MaterialDesignIconsIconName,
                        color: theme.colors.onPrimary,
                        iconColor: theme.colors.primary,
                        size: 'large' as const,
                        onPress: () => navigation.navigate('TeamStandings'),
                    },
                ]
                : []),
            {
                id: 'profile',
                title: 'Mi Perfil',
                icon: 'account-circle',
                color: theme.colors.onPrimary,
                iconColor: theme.colors.primary,
                size: 'small',
                onPress: () => navigation.navigate('Profile'),
            },
            ...(isOwner || isAdmin
                ? [
                    {
                        id: 'admin',
                        title: 'Administrar Grupo',
                        icon: 'cog' as MaterialDesignIconsIconName,
                        color: theme.colors.onPrimary,
                        iconColor: theme.colors.primary,
                        size: 'large' as const,
                        onPress: () => navigation.navigate('Admin'),
                    },
                ]
                : []),
            {
                id: 'invitations',
                title: 'Invitaciones',
                icon: 'email-multiple',
                color: theme.colors.onPrimary,
                iconColor: theme.colors.primary,
                size: 'medium',
                onPress: () => navigation.navigate('Invitations'),
            },
        ];

        return cards;
    }, [navigation, theme, activeGroup, isOwner, isAdmin]);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Searchbar
                    ref={searchbarRef}
                    placeholder="Buscar jugadores..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    icon="magnify"
                    iconColor={theme.colors.secondary}
                    style={{ ...styles.searchbar, backgroundColor: theme.colors.onPrimary }}
                    elevation={2}
                    loading={isSearching}
                />

                {/* Search Results */}
                {searchResults.length > 0 && (
                    <Card style={styles.searchResultsCard} elevation={4}>
                        {searchResults.map((member, index) => (
                            <View key={member.id}>
                                <List.Item
                                    title={member.displayName}
                                    description={member.isGuest ? 'Jugador invitado' : 'Miembro del grupo'}
                                    left={member.photoUrl ? () => (
                                        <Avatar.Image
                                            size={40}
                                            source={{ uri: member.photoUrl! }}
                                            style={styles.searchAvatar}
                                        />
                                    ) : () => (
                                        <Avatar.Icon
                                            size={40}
                                            icon="account"
                                            style={styles.searchAvatar}
                                        />
                                    )}
                                    right={() => (
                                        <Icon
                                            name="chevron-right"
                                            size={24}
                                            color={theme.colors.onSurfaceVariant}
                                        />
                                    )}
                                    onPress={() => handleSelectMember(member)}
                                    style={styles.searchResultItem}
                                />
                                {index < searchResults.length - 1 && <Divider />}
                            </View>
                        ))}
                    </Card>
                )}

                {/* No results message */}
                {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                    <Card style={styles.searchResultsCard} elevation={2}>
                        <Card.Content style={styles.noResultsContainer}>
                            <Icon
                                name="account-search"
                                size={48}
                                color={theme.colors.onSurfaceVariant}
                            />
                            <Text
                                variant="bodyMedium"
                                style={[styles.noResultsText, { color: theme.colors.onSurfaceVariant }]}
                            >
                                No se encontraron jugadores
                            </Text>
                        </Card.Content>
                    </Card>
                )}
            </View>

            {/* Group Info Card */}
            {activeGroup && (
                <Card style={styles.groupCard} elevation={3}>
                    <Card.Content>
                        <View style={styles.groupHeader}>
                            <View style={styles.groupInfo}>
                                <View style={styles.groupNameRow}>
                                    <Text variant="headlineSmall" style={styles.groupName}>
                                        {activeGroup.name}
                                    </Text>
                                    {activeGroup.description && (
                                        <IconButton
                                            icon={showGroupDescription ? 'information' : 'information-outline'}
                                            size={18}
                                            onPress={() => setShowGroupDescription(prev => !prev)}
                                            style={styles.infoButton}
                                            iconColor={
                                                showGroupDescription
                                                    ? theme.colors.primary
                                                    : theme.colors.onSurfaceVariant
                                            }
                                        />
                                    )}
                                </View>
                                {showGroupDescription && activeGroup.description && (
                                    <Text
                                        variant="bodyMedium"
                                        style={[styles.groupDescription, { color: theme.colors.onSurfaceVariant }]}
                                    >
                                        {activeGroup.description}
                                    </Text>
                                )}
                                {activeGroup.type && MATCH_TYPE_LABELS[activeGroup.type] && (
                                    <View style={styles.matchTypeRow}>
                                        <Chip
                                            icon={SoccerIcon}
                                            compact
                                            style={styles.matchTypeChip}
                                            textStyle={styles.matchTypeChipText}
                                        >
                                            {MATCH_TYPE_LABELS[activeGroup.type]}
                                        </Chip>
                                    </View>
                                )}
                            </View>
                            <View style={styles.groupActions}>
                                {(isOwner || isAdmin) && (
                                    <View style={styles.crownIcon}>
                                        <Icon name="crown" size={28} color="#FFD700" />
                                    </View>
                                )}
                                <IconButton
                                    icon="swap-horizontal"
                                    size={24}
                                    iconColor={theme.colors.primary}
                                    onPress={() => groupSwitcherRef.current?.expand()}
                                    style={styles.changeGroupButton}
                                />
                            </View>
                        </View>
                        {/* <View style={styles.groupMeta}> */}
                        {/* <Chip icon={EyeIcon} compact>
                                {activeGroup.visibility || 'Público'}
                            </Chip>
                            <Chip icon={ShapeIcon} compact>
                                {activeGroup.type || 'General'}
                            </Chip> */}
                        {/* {activeGroup.isActive && (
                                <Chip
                                    icon={CheckCircleIcon}
                                    compact
                                    style={styles.activeChip}
                                    textStyle={styles.activeChipText}
                                >
                                    Activo
                                </Chip>
                            )}
                        </View> */}
                    </Card.Content>
                </Card>
            )}

            {/* Masonry Grid */}
            <View style={styles.masonryContainer}>
                {/* Left Column */}
                <View style={styles.masonryColumn}>
                    {actionCards
                        .filter((_, index) => index % 2 === 0)
                        .map(card => (
                            <ActionCardItem
                                key={card.id}
                                card={card}
                                theme={theme}
                            />
                        ))}
                </View>

                {/* Right Column */}
                <View style={styles.masonryColumn}>
                    {actionCards
                        .filter((_, index) => index % 2 === 1)
                        .map(card => (
                            <ActionCardItem
                                key={card.id}
                                card={card}
                                theme={theme}
                            />
                        ))}
                </View>
            </View>

            {/* Player Profile Modal */}
            <Portal>
                <BottomSheet
                    ref={groupSwitcherRef}
                    index={-1}
                    snapPoints={['50%']}
                    enablePanDownToClose
                    backdropComponent={renderGroupBackdrop}
                >
                    <View style={styles.groupSheetContent}>
                        <Text variant="titleMedium" style={styles.groupSheetTitle}>
                            Cambiar Grupo
                        </Text>
                        <BottomSheetFlatList
                            data={groups}
                            keyExtractor={(item: Group) => item.id}
                            renderItem={({ item }: { item: Group }) => {
                                const isSelected = item.id === selectedGroupId;
                                return (
                                    <TouchableOpacity
                                        style={styles.groupSheetItem}
                                        onPress={() => handleSwitchGroup(item.id)}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.groupSheetItemInfo}>
                                            <Text
                                                variant="titleSmall"
                                                style={[
                                                    styles.groupSheetItemName,
                                                    isSelected && { color: theme.colors.primary },
                                                ]}
                                            >
                                                {item.name}
                                            </Text>
                                            {item.description ? (
                                                <Text
                                                    variant="bodySmall"
                                                    style={styles.groupSheetItemDesc}
                                                    numberOfLines={1}
                                                >
                                                    {item.description}
                                                </Text>
                                            ) : null}
                                        </View>
                                        {isSelected && (
                                            <Icon name="check-circle" size={22} color={theme.colors.primary} />
                                        )}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </BottomSheet>

                <PlayerProfileModal
                    groupMemberId={selectedGroupMemberId}
                    playerName={selectedMemberName}
                    playerPhotoURL={selectedMemberPhoto}
                    bottomSheetRef={bottomSheetRef}
                />
            </Portal>
        </ScrollView>
    );
}

function ActionCardItem({
    card,
    theme: _theme,
}: {
    card: ActionCard;
    theme: ReturnType<typeof useTheme>;
}) {
    const heightMap = {
        small: 155,
        medium: 180,
        large: 220,
    };
    const iconSize = card.size === 'large' ? 64 : card.size === 'medium' ? 56 : 48;

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={card.onPress}
            style={styles.cardTouchable}
        >
            <Card
                style={[
                    styles.actionCard,
                    {
                        height: heightMap[card.size],
                        backgroundColor: card.color,
                    },
                ]}
                elevation={4}
            >
                <Card.Content style={styles.actionCardContent}>
                    <View style={styles.actionIconContainer}>
                        <Icon name={card.icon} size={iconSize} color={card.iconColor} />
                    </View>
                    <Text
                        variant={card.size === 'large' ? 'headlineSmall' : 'titleLarge'}
                        style={{ ...styles.actionTitle, color: card.iconColor }}
                        numberOfLines={2}
                    >
                        {card.title}
                    </Text>
                </Card.Content>
            </Card>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    searchContainer: {
        marginBottom: 16,
        zIndex: 0,
    },
    searchbar: {
        borderRadius: 28,
        elevation: 2,
    },
    searchResultsCard: {
        marginTop: 8,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        maxHeight: 400,
    },
    searchResultItem: {
        paddingVertical: 8,
    },
    searchAvatar: {
        marginLeft: 8,
        marginRight: 8,
    },
    noResultsContainer: {
        alignItems: 'center',
        paddingVertical: 24,
        gap: 8,
    },
    noResultsText: {
        textAlign: 'center',
    },
    groupCard: {
        marginBottom: 15,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
    },
    groupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    groupInfo: {
        flex: 1,
        gap: 4,
    },
    groupName: {
        fontWeight: '700',
    },
    groupNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    infoButton: {
        margin: 0,
        marginLeft: -2,
    },
    groupDescription: {
        opacity: 0.85,
    },
    matchTypeRow: {
        marginTop: 6,
    },
    matchTypeChip: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(0,0,0,0.06)',
        height: 28,
    },
    matchTypeChipText: {
        fontSize: 12,
        color: '#444',
    },
    crownIcon: {
        margin: 0,
    },
    groupActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    changeGroupButton: {
        margin: 0,
    },
    groupMeta: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    activeChip: {
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
    },
    activeChipText: {
        color: '#4CAF50',
    },
    masonryContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    masonryColumn: {
        flex: 1,
        gap: 12,
    },
    cardTouchable: {
        width: '100%',
    },
    actionCard: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    actionCardContent: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        position: 'relative',
    },
    actionIconContainer: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    actionTitle: {
        // color: '#FFFFFF',
        fontWeight: '700',
        textAlign: 'center',
        textShadowColor: 'rgba(0, 0, 0, 0.4)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
        paddingHorizontal: 8,
        fontSize: 23,

    },
    groupSheetContent: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    groupSheetTitle: {
        textAlign: 'center',
        marginBottom: 12,
        fontWeight: 'bold',
    },
    groupSheetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E0E0E0',
    },
    groupSheetItemInfo: {
        flex: 1,
    },
    groupSheetItemName: {
        fontWeight: '600',
    },
    groupSheetItemDesc: {
        color: '#888',
        marginTop: 2,
    },
});
