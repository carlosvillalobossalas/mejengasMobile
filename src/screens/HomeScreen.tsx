import React, { useMemo, useState, useEffect, useRef } from 'react';
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
import BottomSheet from '@gorhom/bottom-sheet';

import { useAppSelector, useDebounce } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';
import { getUserRoleInGroup } from '../repositories/groups/groupsRepository';
import { searchUsersByName, type User } from '../repositories/users/usersRepository';
import PlayerProfileModal from '../components/PlayerProfileModal';

type ActionCard = {
    id: string;
    title: string;
    icon: MaterialDesignIconsIconName;
    color: string;
    size: 'small' | 'medium' | 'large';
    onPress: () => void;
};

// Icon render functions for Chips - moved outside component to avoid warnings
const EyeIcon = () => <Icon name="eye" size={16} color="#666" />;
const ShapeIcon = () => <Icon name="shape" size={16} color="#666" />;
const CheckCircleIcon = () => <Icon name="check-circle" size={16} color="#4CAF50" />;

export default function HomeScreen() {
    const theme = useTheme();
    const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
    const [searchQuery, setSearchQuery] = useState('');
    const [userRole, setUserRole] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedUserName, setSelectedUserName] = useState<string | undefined>(undefined);
    const [selectedUserPhoto, setSelectedUserPhoto] = useState<string | undefined>(undefined);
    const bottomSheetRef = useRef<BottomSheet | null>(null);
    const searchbarRef = useRef<any>(null);
    const debouncedSearchQuery = useDebounce(searchQuery, 700);

    const { groups, selectedGroupId } = useAppSelector(state => state.groups);
    const currentUser = useAppSelector(state => state.auth.firestoreUser);

    const activeGroup = useMemo(
        () => groups.find(g => g.id === selectedGroupId),
        [groups, selectedGroupId],
    );

    const isOwner = activeGroup?.ownerId === currentUser?.uid;
    const isAdmin = userRole === 'admin' || userRole === 'owner';

    // Load user role when group or user changes
    useEffect(() => {
        const loadUserRole = async () => {
            if (!selectedGroupId || !currentUser?.uid) {
                setUserRole(null);
                return;
            }

            try {
                const role = await getUserRoleInGroup(selectedGroupId, currentUser.uid);
                setUserRole(role);
            } catch (error) {
                console.error('Error loading user role:', error);
                setUserRole(null);
            }
        };

        loadUserRole();
    }, [selectedGroupId, currentUser?.uid]);

    // Execute search when debounced query changes
    useEffect(() => {
        const executeSearch = async () => {
            if (!debouncedSearchQuery || debouncedSearchQuery.trim().length < 2) {
                setSearchResults([]);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            try {
                const results = await searchUsersByName(debouncedSearchQuery, 8);
                setSearchResults(results);
            } catch (error) {
                console.error('Error searching users:', error);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        executeSearch();
    }, [debouncedSearchQuery]);

    const handleSelectPlayer = (user: User) => {
        // Blur searchbar to hide keyboard and remove focus
        searchbarRef.current?.blur();
        
        setSelectedUserId(user.uid);
        setSelectedUserName(user.displayName || undefined);
        setSelectedUserPhoto(user.photoURL || undefined);
        setSearchQuery('');
        setSearchResults([]);
        
        // Open modal after state is set
        setTimeout(() => {
            bottomSheetRef.current?.expand();
        }, 100);
    };

    const actionCards: ActionCard[] = useMemo(() => {
        const cards: ActionCard[] = [
            {
                id: 'players',
                title: 'Jugadores',
                icon: 'account-group',
                color: '#2196F3',
                size: 'large',
                onPress: () => navigation.navigate('PlayersTable'),
            },
            {
                id: 'goalkeepers',
                title: 'Porteros',
                icon: 'hand-back-right',
                color: '#FF9800',
                size: 'medium',
                onPress: () => navigation.navigate('GoalkeepersTable'),
            },
            {
                id: 'matches',
                title: 'Partidos',
                icon: 'soccer',
                color: '#4CAF50',
                size: 'large',
                onPress: () => navigation.navigate('Matches'),
            },
            {
                id: 'profile',
                title: 'Mi Perfil',
                icon: 'account-circle',
                color: '#9C27B0',
                size: 'small',
                onPress: () => navigation.navigate('Profile'),
            },
            {
                id: 'invitations',
                title: 'Invitaciones',
                icon: 'email-multiple',
                color: '#00BCD4',
                size: 'medium',
                onPress: () => navigation.navigate('Invitations'),
            },
            {
                id: 'admin',
                title: 'Administrar Grupo',
                icon: 'cog',
                color: '#F44336',
                size: 'medium',
                onPress: () => console.log('Navigate to Admin'),
            },
        ];

        return cards;
    }, [navigation]);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Searref={searchbarRef}
                    ch Bar */}
            <View style={styles.searchContainer}>
                <Searchbar
                    placeholder="Buscar jugadores..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    icon="magnify"
                    style={styles.searchbar}
                    elevation={2}
                    loading={isSearching}
                />
                
                {/* Search Results */}
                {searchResults.length > 0 && (
                    <Card style={styles.searchResultsCard} elevation={4}>
                        {searchResults.map((user, index) => (
                            <React.Fragment key={user.id}>
                                <List.Item
                                    title={user.displayName || 'Sin nombre'}
                                    description={user.email}
                                    left={user.photoURL ? () => (
                                        <Avatar.Image
                                            size={40}
                                            source={{ uri: user.photoURL! }}
                                            style={styles.searchAvatar}
                                        />
                                    ) : undefined}
                                    right={() => (
                                        <Icon
                                            name="chevron-right"
                                            size={24}
                                            color={theme.colors.onSurfaceVariant}
                                        />
                                    )}
                                    onPress={() => handleSelectPlayer(user)}
                                    style={styles.searchResultItem}
                                />
                                {index < searchResults.length - 1 && <Divider />}
                            </React.Fragment>
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
                                <Text variant="headlineSmall" style={styles.groupName}>
                                    {activeGroup.name}
                                </Text>
                                {activeGroup.description && (
                                    <Text
                                        variant="bodyMedium"
                                        style={[styles.groupDescription, { color: theme.colors.onSurfaceVariant }]}
                                    >
                                        {activeGroup.description}
                                    </Text>
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
                                    onPress={() => navigation.navigate('Groups')}
                                    style={styles.changeGroupButton}
                                />
                            </View>
                        </View>
                        <View style={styles.groupMeta}>
                            <Chip icon={EyeIcon} compact>
                                {activeGroup.visibility || 'Público'}
                            </Chip>
                            <Chip icon={ShapeIcon} compact>
                                {activeGroup.type || 'General'}
                            </Chip>
                            {activeGroup.isActive && (
                                <Chip
                                    icon={CheckCircleIcon}
                                    compact
                                    style={styles.activeChip}
                                    textStyle={styles.activeChipText}
                                >
                                    Activo
                                </Chip>
                            )}
                        </View>
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
                                isDisabled={card.id === 'admin' && !isOwner && !isAdmin}
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
                                isDisabled={card.id === 'admin' && !isOwner && !isAdmin}
                            />
                        ))}
                </View>
            </View>

            {/* Player Profile Modal */}
            <Portal>
                <PlayerProfileModal
                    userId={selectedUserId}
                    playerName={selectedUserName}
                    playerPhotoURL={selectedUserPhoto}
                    bottomSheetRef={bottomSheetRef}
                />
            </Portal>
        </ScrollView>
    );
}

function ActionCardItem({
    card,
    theme: _theme,
    isDisabled = false,
}: {
    card: ActionCard;
    theme: ReturnType<typeof useTheme>;
    isDisabled?: boolean;
}) {
    const heightMap = {
        small: 155,
        medium: 180,
        large: 220,
    };
    const iconSize = card.size === 'large' ? 64 : card.size === 'medium' ? 56 : 48;

    return (
        <TouchableOpacity
            activeOpacity={isDisabled ? 1 : 0.7}
            onPress={isDisabled ? undefined : card.onPress}
            style={styles.cardTouchable}
            disabled={isDisabled}
        >
            <Card
                style={[
                    styles.actionCard,
                    {
                        height: heightMap[card.size],
                        backgroundColor: card.color,
                    },
                    isDisabled && styles.disabledCard,
                ]}
                elevation={isDisabled ? 1 : 4}
            >
                <Card.Content style={styles.actionCardContent}>
                    {isDisabled && (
                        <View style={styles.lockIconContainer}>
                            <Icon name="lock" size={32} color="rgba(255, 255, 255, 0.9)" />
                        </View>
                    )}
                    <View style={styles.actionIconContainer}>
                        <Icon name={card.icon} size={iconSize} color="#FFFFFF" />
                    </View>
                    <Text
                        variant={card.size === 'large' ? 'headlineSmall' : 'titleLarge'}
                        style={styles.actionTitle}
                        numberOfLines={2}
                    >
                        {card.title}
                    </Text>
                    {isDisabled && (
                        <Text style={styles.disabledText}>
                            Solo para admins
                        </Text>
                    )}
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
        marginBottom: 20,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
    },
    groupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    groupInfo: {
        flex: 1,
        gap: 4,
    },
    groupName: {
        fontWeight: '700',
    },
    groupDescription: {
        opacity: 0.85,
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
    disabledCard: {
        opacity: 0.6,
    },
    actionCardContent: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        position: 'relative',
    },
    lockIconContainer: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 1,
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
        color: '#FFFFFF',
        fontWeight: '700',
        textAlign: 'center',
        textShadowColor: 'rgba(0, 0, 0, 0.4)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
        paddingHorizontal: 8,
    },
    disabledText: {
        color: '#FFFFFF',
        fontSize: 12,
        marginTop: 4,
        opacity: 0.9,
        textAlign: 'center',
    },
});
