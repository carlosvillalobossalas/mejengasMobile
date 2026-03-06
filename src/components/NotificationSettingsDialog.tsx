import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Button, Card, Dialog, Divider, Switch, Text, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { Group } from '../repositories/groups/groupsRepository';
import {
    NOTIFICATION_TYPES,
    type GroupNotificationPreferences,
    type NotificationType,
    type UserNotificationPreferences,
    getUserNotificationPreferences,
    runNotificationPreferencesMigration,
    updateGlobalNotificationsEnabled,
    updateGroupNotificationPreference,
} from '../repositories/users/notificationPreferencesRepository';

const NOTIFICATION_LABELS: Record<NotificationType, string> = {
    newMatches: 'Nuevos partidos',
    matchReminders: 'Recordatorios de partido',
    matchUpdates: 'Actualizaciones de partido',
    mvpReminders: 'Recordatorios MVP',
    mvpResults: 'Resultados MVP',
    joinRequests: 'Solicitudes de unión',
    joinRequestUpdates: 'Actualización de solicitudes',
    invites: 'Invitaciones de grupo',
};

const DEFAULT_GROUP_PREFS: GroupNotificationPreferences = {
    all: true,
    newMatches: true,
    matchReminders: true,
    matchUpdates: true,
    mvpReminders: true,
    mvpResults: true,
    joinRequests: true,
    joinRequestUpdates: true,
    invites: true,
};

type Props = {
    visible: boolean;
    userId: string | null;
    groups: Group[];
    onDismiss: () => void;
};

export default function NotificationSettingsDialog({
    visible,
    userId,
    groups,
    onDismiss,
}: Props) {
    const theme = useTheme();
    const [notificationPrefs, setNotificationPrefs] = useState<UserNotificationPreferences | null>(null);
    const [isLoadingNotificationPrefs, setIsLoadingNotificationPrefs] = useState(false);
    const [isSavingNotificationPrefs, setIsSavingNotificationPrefs] = useState(false);
    const [isRunningMigration, setIsRunningMigration] = useState(false);
    const [expandedNotificationGroups, setExpandedNotificationGroups] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const loadNotificationPreferences = async () => {
            if (!visible) return;

            setExpandedNotificationGroups({});

            if (!userId) {
                setNotificationPrefs(null);
                return;
            }

            setIsLoadingNotificationPrefs(true);
            try {
                const prefs = await getUserNotificationPreferences(userId);
                setNotificationPrefs(prefs);
            } catch (loadError) {
                console.error('Error loading notification preferences:', loadError);
            } finally {
                setIsLoadingNotificationPrefs(false);
            }
        };

        loadNotificationPreferences();
    }, [visible, userId]);

    const handleToggleGlobalNotifications = async (value: boolean) => {
        if (!userId) return;

        setIsSavingNotificationPrefs(true);
        try {
            await updateGlobalNotificationsEnabled(userId, value);
            setNotificationPrefs(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    globalEnabled: value,
                };
            });
        } catch (saveError) {
            console.error('Error updating global notification settings:', saveError);
        } finally {
            setIsSavingNotificationPrefs(false);
        }
    };

    const handleToggleGroupPreference = async (
        groupId: string,
        key: keyof GroupNotificationPreferences,
        value: boolean,
    ) => {
        if (!userId) return;

        setIsSavingNotificationPrefs(true);
        try {
            await updateGroupNotificationPreference(userId, groupId, key, value);
            setNotificationPrefs(prev => {
                if (!prev) return prev;
                const currentGroupPrefs = prev.groups[groupId] ?? DEFAULT_GROUP_PREFS;
                return {
                    ...prev,
                    groups: {
                        ...prev.groups,
                        [groupId]: {
                            ...currentGroupPrefs,
                            [key]: value,
                        },
                    },
                };
            });
        } catch (saveError) {
            console.error('Error updating group notification setting:', saveError);
        } finally {
            setIsSavingNotificationPrefs(false);
        }
    };

    return (
        <Dialog
            visible={visible}
            onDismiss={onDismiss}
            style={[styles.notificationsDialog, { backgroundColor: theme.colors.surface }]}
        >
            <Dialog.Title>Notificaciones</Dialog.Title>
            <Dialog.ScrollArea style={styles.notificationsDialogScrollArea}>
                {isLoadingNotificationPrefs ? (
                    <View style={styles.notificationLoadingRow}>
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                        <Text>Cargando configuración...</Text>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.notificationsScrollContent}>
                        <View
                            style={[
                                styles.notificationRow,
                                styles.globalNotificationCard,
                                { borderColor: theme.colors.outlineVariant },
                            ]}
                        >
                            <View style={styles.notificationRowTextWrap}>
                                <Text style={styles.notificationRowTitle}>Silenciar todo</Text>
                                <Text style={styles.notificationRowSubtitle}>
                                    Desactiva todas las notificaciones en todos tus grupos
                                </Text>
                            </View>
                            <Switch
                                value={notificationPrefs?.globalEnabled ?? true}
                                onValueChange={handleToggleGlobalNotifications}
                                disabled={isSavingNotificationPrefs}
                            />
                        </View>

                        <Divider style={styles.notificationsDivider} />


                        <Divider style={styles.notificationsDivider} />

                        {groups.map(group => {
                            const isExpanded = expandedNotificationGroups[group.id] === true;
                            const groupPrefs = notificationPrefs?.groups[group.id] ?? DEFAULT_GROUP_PREFS;

                            return (
                                <Card key={group.id} style={styles.notificationGroupCard} mode="outlined">
                                    <Card.Content>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            style={styles.notificationGroupHeader}
                                            onPress={() =>
                                                setExpandedNotificationGroups(prev => ({
                                                    ...prev,
                                                    [group.id]: !isExpanded,
                                                }))
                                            }
                                        >
                                            <View style={styles.notificationGroupHeaderLeft}>
                                                <Text style={styles.notificationGroupName}>{group.name}</Text>
                                                <Text style={styles.notificationGroupMeta}>
                                                    {isExpanded ? 'Ocultar opciones' : 'Mostrar opciones'}
                                                </Text>
                                            </View>
                                            <Icon
                                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                                size={22}
                                                color={theme.colors.onSurfaceVariant}
                                            />
                                        </TouchableOpacity>

                                        {isExpanded && (
                                            <View style={styles.notificationGroupOptions}>
                                                <View style={styles.notificationRowCompact}>
                                                    <Text style={styles.notificationRowTitle}>Todas</Text>
                                                    <Switch
                                                        value={groupPrefs.all}
                                                        onValueChange={value =>
                                                            handleToggleGroupPreference(group.id, 'all', value)
                                                        }
                                                        disabled={isSavingNotificationPrefs}
                                                    />
                                                </View>

                                                {NOTIFICATION_TYPES.map(type => (
                                                    <View key={`${group.id}-${type}`} style={styles.notificationRowCompact}>
                                                        <Text style={styles.notificationRowTitle}>{NOTIFICATION_LABELS[type]}</Text>
                                                        <Switch
                                                            value={groupPrefs[type]}
                                                            onValueChange={value =>
                                                                handleToggleGroupPreference(group.id, type, value)
                                                            }
                                                            disabled={isSavingNotificationPrefs}
                                                        />
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </Card.Content>
                                </Card>
                            );
                        })}
                    </ScrollView>
                )}
            </Dialog.ScrollArea>
            <Dialog.Actions style={styles.notificationsDialogActions}>
                <Button onPress={onDismiss}>Cerrar</Button>
            </Dialog.Actions>
        </Dialog>
    );
}

const styles = StyleSheet.create({
    notificationsDialogScrollArea: {
        height: 460,
        paddingHorizontal: 16,
    },
    notificationsDialog: {
        borderRadius: 24,
        overflow: 'hidden',
    },
    notificationsScrollContent: {
        paddingVertical: 8,
        paddingBottom: 12,
    },
    globalNotificationCard: {
        // borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 4,
    },
    notificationLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 20,
    },
    notificationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        gap: 8,
    },
    notificationRowTextWrap: {
        flex: 1,
    },
    notificationRowTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    notificationRowSubtitle: {
        fontSize: 12,
        color: '#757575',
        marginTop: 2,
    },
    notificationsDivider: {
        marginVertical: 8,
    },
    notificationGroupCard: {
        marginBottom: 10,
        backgroundColor: '#FFFFFF',
    },
    notificationGroupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 44,
    },
    notificationGroupHeaderLeft: {
        flex: 1,
        paddingRight: 8,
    },
    notificationGroupName: {
        fontSize: 14,
        fontWeight: '700',
    },
    notificationGroupMeta: {
        fontSize: 12,
        color: '#757575',
        marginTop: 2,
    },
    notificationGroupOptions: {
        marginTop: 6,
    },
    notificationRowCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 38,
    },
    notificationsDialogActions: {
        paddingHorizontal: 16,
        paddingBottom: 14,
        // paddingTop: 8,
    },
    migrationActionsRow: {
        marginBottom: 4,
    },
    migrationButtonContent: {
        minHeight: 36,
    },
});
