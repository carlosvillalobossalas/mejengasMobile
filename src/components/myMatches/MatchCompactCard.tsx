import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { Card, Text, useTheme, type MD3Theme } from 'react-native-paper';

import { TYPE_LABEL, statusLabel, type UnifiedMatchItem } from './types';

type Props = {
    match: UnifiedMatchItem;
    showGroupLabel: boolean;
    onPress: () => void;
};

const getStatusStyle = (
    status: UnifiedMatchItem['status'],
    theme: MD3Theme,
): { color: string; borderColor: string; backgroundColor: string } => {
    if (status === 'scheduled') {
        return { color: '#E65100', borderColor: '#E65100', backgroundColor: '#FFF3E0' };
    }
    if (status === 'cancelled') {
        return { color: '#B71C1C', borderColor: '#B71C1C', backgroundColor: '#FFEBEE' };
    }
    return {
        color: theme.colors.primary,
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primaryContainer,
    };
};

const getResultColor = (match: UnifiedMatchItem, theme: MD3Theme): string => {
    if (match.status !== 'finished') return theme.colors.onSurfaceVariant;

    if (match.type === 'matchesByChallenge') {
        if (match.leftScore > match.rightScore) return '#388E3C';
        if (match.rightScore > match.leftScore) return '#D32F2F';
        return '#757575';
    }

    if (match.leftScore === match.rightScore) return theme.colors.secondary;
    return theme.colors.primary;
};

const formatTime = (dateIso: string): string =>
    new Date(dateIso).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

export default function MatchCompactCard({ match, showGroupLabel, onPress }: Props) {
    const theme = useTheme();
    const resultColor = getResultColor(match, theme);

    return (
        <Card style={[styles.card, { borderLeftColor: resultColor, backgroundColor: theme.colors.onPrimary }]} onPress={onPress}>
            <Card.Content style={styles.content}>
                <Text variant="labelSmall" style={[styles.groupTypeLabel, { color: theme.colors.primary }]}>
                    {showGroupLabel ? `${match.groupName} · ${TYPE_LABEL[match.type]}` : TYPE_LABEL[match.type]}
                </Text>

                <View style={styles.row}>
                    <Text variant="bodyMedium" style={styles.teamLeft} numberOfLines={1}>
                        {match.leftLabel}
                    </Text>

                    <View style={styles.scoreColumn}>
                        <Text style={[styles.statusBadge, getStatusStyle(match.status, theme)]}>
                            {statusLabel(match.status)}
                        </Text>
                        {match.status === 'scheduled' ? (
                            <Text variant="titleMedium" style={[styles.scoreText, { color: theme.colors.onSurfaceVariant }]}>
                                {formatTime(match.date)}
                            </Text>
                        ) : (
                            <Text variant="titleMedium" style={[styles.scoreText, { color: resultColor }]}>
                                {match.leftScore} – {match.rightScore}
                            </Text>
                        )}
                    </View>

                    <Text variant="bodyMedium" style={styles.teamRight} numberOfLines={1}>
                        {match.rightLabel}
                    </Text>

                    <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
                </View>
            </Card.Content>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: 6,
        borderRadius: 8,
        borderLeftWidth: 4,
        paddingVertical: 10,
        paddingHorizontal: 5,
    },
    content: {
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    groupTypeLabel: {
        fontWeight: '700',
        marginBottom: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    teamLeft: {
        flex: 1,
        fontWeight: '600',
    },
    teamRight: {
        flex: 1,
        fontWeight: '600',
        textAlign: 'right',
    },
    scoreColumn: {
        alignItems: 'center',
        gap: 3,
        minWidth: 80,
    },
    statusBadge: {
        textAlign: 'center',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontSize: 8,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 3,
        borderWidth: 1,
    },
    scoreText: {
        fontWeight: 'bold',
        fontSize: 18,
        textAlign: 'center',
    },
});
