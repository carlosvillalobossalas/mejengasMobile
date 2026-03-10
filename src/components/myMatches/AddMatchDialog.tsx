import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { Button, Divider, Modal, Portal, Text, useTheme, type MD3Theme } from 'react-native-paper';

import type { Group } from '../../repositories/groups/groupsRepository';

type AddMatchRoute = 'AddMatch' | 'AddMatchTeams' | 'AddChallengeMatch';
type IconName = React.ComponentProps<typeof Icon>['name'];

type Props = {
    visible: boolean;
    step: 'type' | 'group';
    compatibleGroups: Group[];
    onTypeSelect: (route: AddMatchRoute) => void;
    onGroupSelect: (groupId: string) => void;
    onBack: () => void;
    onDismiss: () => void;
};

const MATCH_TYPES: Array<{
    route: AddMatchRoute;
    title: string;
    description: string;
    icon: IconName;
    bgColor: string;
    iconColorKey: 'primary' | 'secondary' | null;
    iconColorFallback?: string;
}> = [
    {
        route: 'AddMatch',
        title: 'Libre',
        description: 'Libre, dos equipos sin fijos',
        icon: 'soccer',
        bgColor: '',   // uses primaryContainer
        iconColorKey: 'primary',
    },
    {
        route: 'AddMatchTeams',
        title: 'Por equipos',
        description: 'Con equipos fijos del grupo',
        icon: 'account-group',
        bgColor: '',   // uses secondaryContainer
        iconColorKey: 'secondary',
    },
    {
        route: 'AddChallengeMatch',
        title: 'Retos',
        description: 'Mi grupo vs un rival externo',
        icon: 'sword-cross',
        bgColor: '#E8F5E9',
        iconColorKey: null,
        iconColorFallback: '#2E7D32',
    },
];

export default function AddMatchDialog({ visible, step, compatibleGroups, onTypeSelect, onGroupSelect, onBack, onDismiss }: Props) {
    const theme = useTheme();
    const s = styles(theme);

    return (
        <Portal>
            <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={s.modal}>
                {step === 'type' ? (
                    <>
                        <Text variant="titleLarge" style={s.title}>Nuevo partido</Text>
                        <View style={s.content}>
                            {MATCH_TYPES.map((item, index) => {
                                const iconBg = item.iconColorKey === 'primary'
                                    ? theme.colors.primaryContainer
                                    : item.iconColorKey === 'secondary'
                                        ? theme.colors.secondaryContainer
                                        : item.bgColor;
                                const iconColor = item.iconColorKey === 'primary'
                                    ? theme.colors.primary
                                    : item.iconColorKey === 'secondary'
                                        ? theme.colors.secondary
                                        : item.iconColorFallback ?? '#000';

                                return (
                                    <View key={item.route}>
                                        <TouchableOpacity onPress={() => onTypeSelect(item.route)} activeOpacity={0.7}>
                                            <View style={s.row}>
                                                <View style={[s.rowIcon, { backgroundColor: iconBg }]}>
                                                    <Icon name={item.icon} size={22} color={iconColor} />
                                                </View>
                                                <View style={s.rowText}>
                                                    <Text variant="bodyLarge" style={s.rowTitle}>{item.title}</Text>
                                                    <Text variant="bodySmall" style={s.rowDesc}>{item.description}</Text>
                                                </View>
                                                <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                                            </View>
                                        </TouchableOpacity>
                                        {index < MATCH_TYPES.length - 1 ? <Divider /> : null}
                                    </View>
                                );
                            })}
                        </View>
                        <View style={s.actions}>
                            <Button onPress={onDismiss}>Cancelar</Button>
                        </View>
                    </>
                ) : (
                    <>
                        <Text variant="titleLarge" style={s.title}>Seleccionar grupo</Text>
                        <View style={s.content}>
                            {compatibleGroups.map((group, index) => (
                                <View key={group.id}>
                                    <TouchableOpacity onPress={() => onGroupSelect(group.id)} activeOpacity={0.7}>
                                        <View style={s.row}>
                                            <View style={[s.rowIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                                                <Icon name="account-multiple" size={22} color={theme.colors.primary} />
                                            </View>
                                            <View style={s.rowText}>
                                                <Text variant="bodyLarge" style={s.rowTitle}>{group.name}</Text>
                                            </View>
                                            <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                                        </View>
                                    </TouchableOpacity>
                                    {index < compatibleGroups.length - 1 ? <Divider /> : null}
                                </View>
                            ))}
                        </View>
                        <View style={s.actions}>
                            <Button onPress={onBack}>Atrás</Button>
                            <Button onPress={onDismiss}>Cancelar</Button>
                        </View>
                    </>
                )}
            </Modal>
        </Portal>
    );
}

const styles = (theme: MD3Theme) =>
    StyleSheet.create({
        modal: {
            // Must be explicitly white — the theme elevation colors are pinkish (elevation.level3 = rgb(247,226,231))
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            marginHorizontal: 24,
            overflow: 'hidden',
        },
        title: {
            fontWeight: '700',
            color: theme.colors.onSurface,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 12,
        },
        content: {
            // no extra padding — rows handle their own
        },
        actions: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: 16,
            paddingVertical: 8,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 20,
            gap: 14,
        },
        rowIcon: {
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
        },
        rowText: {
            flex: 1,
        },
        rowTitle: {
            fontWeight: '600',
            color: theme.colors.onSurface,
        },
        rowDesc: {
            color: theme.colors.onSurfaceVariant,
            marginTop: 2,
        },
    });
