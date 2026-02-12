import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
    Card,
    Searchbar,
    Text,
    useTheme,
    Chip,
    IconButton,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon, MaterialDesignIconsIconName } from '@react-native-vector-icons/material-design-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';

import { useAppSelector } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';

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

    const { groups, selectedGroupId } = useAppSelector(state => state.groups);
    const currentUser = useAppSelector(state => state.auth.firestoreUser);

    const activeGroup = useMemo(
        () => groups.find(g => g.id === selectedGroupId),
        [groups, selectedGroupId],
    );

    const isOwner = activeGroup?.ownerId === currentUser?.uid;
    const isAdmin = false; // TODO: check user role in group

    const handleSearch = () => {
        // TODO: Navigate to search screen
        console.log('Search:', searchQuery);
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
                onPress: () => console.log('Navigate to Goalkeepers'),
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
        ];

        if (isOwner || isAdmin) {
            cards.push({
                id: 'admin',
                title: 'Administrar Grupo',
                icon: 'cog',
                color: '#F44336',
                size: 'medium',
                onPress: () => console.log('Navigate to Admin'),
            });
        }

        return cards;
    }, [isOwner, isAdmin, navigation]);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Searchbar
                    placeholder="Buscar grupos o jugadores..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    onSubmitEditing={handleSearch}
                    icon="magnify"
                    style={styles.searchbar}
                    elevation={2}
                />
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
                            <ActionCardItem key={card.id} card={card} theme={theme} />
                        ))}
                </View>

                {/* Right Column */}
                <View style={styles.masonryColumn}>
                    {actionCards
                        .filter((_, index) => index % 2 === 1)
                        .map(card => (
                            <ActionCardItem key={card.id} card={card} theme={theme} />
                        ))}
                </View>
            </View>
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
        small: 140,
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
                        <Icon name={card.icon} size={iconSize} color="#FFFFFF" />
                    </View>
                    <Text
                        variant={card.size === 'large' ? 'headlineSmall' : 'titleLarge'}
                        style={styles.actionTitle}
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
    },
    searchbar: {
        borderRadius: 28,
        elevation: 2,
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
    actionCardContent: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
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
});
