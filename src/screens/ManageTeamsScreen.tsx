import React, { useCallback, useState } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Image } from 'react-native';
import {
    Text,
    FAB,
    useTheme,
    ActivityIndicator,
    Surface,
    Chip,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';

import { useAppSelector } from '../app/hooks';
import { getTeamsByGroupId, type Team } from '../repositories/teams/teamsRepository';
import type { AppDrawerParamList } from '../navigation/types';

export default function ManageTeamsScreen() {
    const theme = useTheme();
    const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
    const { selectedGroupId, groups } = useAppSelector(state => state.groups);
    const selectedGroup = groups.find(g => g.id === selectedGroupId);

    const [teams, setTeams] = useState<Team[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadTeams = useCallback(async () => {
        if (!selectedGroupId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await getTeamsByGroupId(selectedGroupId);
            setTeams(result);
        } catch {
            setError('Error al cargar los equipos');
        } finally {
            setIsLoading(false);
        }
    }, [selectedGroupId]);

    // Reload each time the screen comes into focus (e.g. after creating/editing a team)
    useFocusEffect(useCallback(() => { loadTeams(); }, [loadTeams]));

    if (!selectedGroupId || !selectedGroup?.hasFixedTeams) {
        return (
            <View style={styles.centerContainer}>
                <Icon name="alert-circle" size={48} color={theme.colors.error} />
                <Text variant="titleMedium" style={styles.centerText}>
                    Esta función solo está disponible para grupos con equipos definidos
                </Text>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Icon name="alert-circle" size={48} color={theme.colors.error} />
                <Text variant="bodyMedium" style={[styles.centerText, { color: theme.colors.error }]}>
                    {error}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={teams}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Icon name="shield-off" size={64} color={theme.colors.onSurfaceVariant} />
                        <Text variant="titleMedium" style={styles.emptyTitle}>
                            No hay equipos creados
                        </Text>
                        <Text variant="bodyMedium" style={styles.emptySubtext}>
                            Toca el botón + para crear el primer equipo
                        </Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <Surface style={styles.teamCard} elevation={1}>
                        {item.photoUrl ? (
                            <Image
                                source={{ uri: item.photoUrl }}
                                style={[styles.teamPhoto, { borderColor: item.color }]}
                            />
                        ) : (
                            <View style={[styles.colorBadge, { backgroundColor: item.color }]} />
                        )}
                        <View style={styles.teamInfo}>
                            <Text variant="titleMedium" style={styles.teamName}>
                                {item.name}
                            </Text>
                            <Chip compact
                                icon={() => (
                                    <Icon name="account" size={16} color="white" /> // Set your custom color here
                                )} selectedColor='white' style={{ ...styles.playerCountChip, backgroundColor: theme.colors.secondary }}>
                                {item.players.length}{' '}
                                {item.players.length === 1 ? 'jugador' : 'jugadores'}
                            </Chip>
                        </View>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('TeamForm', { teamId: item.id })}
                            style={styles.editButton}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Icon name="pencil" size={22} color={theme.colors.primary} />
                        </TouchableOpacity>
                    </Surface>
                )}
            />
            <FAB
                icon="plus"
                style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                onPress={() => navigation.navigate('TeamForm', {})}
                color="#FFF"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    listContent: {
        padding: 16,
        paddingBottom: 80,
        flexGrow: 1,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        gap: 16,
    },
    centerText: {
        textAlign: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 80,
        gap: 12,
    },
    emptyTitle: {
        fontWeight: 'bold',
    },
    emptySubtext: {
        color: '#666',
        textAlign: 'center',
    },
    teamCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        marginBottom: 12,
        padding: 12,
        gap: 12,
        backgroundColor: '#FFF',
    },
    colorBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    teamPhoto: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
    },
    teamInfo: {
        flex: 1,
        gap: 4,
    },
    teamName: {
        fontWeight: 'bold',
    },
    playerCountChip: {
        alignSelf: 'flex-start',
    },
    editButton: {
        padding: 8,
    },
    fab: {
        position: 'absolute',
        right: 16,
        bottom: 24,
    },
});
