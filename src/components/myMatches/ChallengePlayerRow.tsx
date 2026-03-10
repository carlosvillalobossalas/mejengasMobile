import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { Text, useTheme, type MD3Theme } from 'react-native-paper';

import type { GroupMemberV2 } from '../../repositories/groupMembersV2/groupMembersV2Repository';
import type { ChallengeMatchPlayer } from '../../repositories/matches/matchesByChallengeRepository';

type Props = {
    player: ChallengeMatchPlayer;
    groupMembers: GroupMemberV2[];
    mvpGroupMemberId: string | null;
    accentColor: string;
};

export default function ChallengePlayerRow({ player, groupMembers, mvpGroupMemberId, accentColor }: Props) {
    const theme = useTheme();

    const member = player.groupMemberId ? groupMembers.find(m => m.id === player.groupMemberId) : undefined;
    const displayName = member?.displayName ?? 'Por asignar';
    const isMvp = player.groupMemberId !== null && mvpGroupMemberId === player.groupMemberId;
    const hasStats = player.goals > 0 || player.assists > 0 || player.ownGoals > 0;

    return (
        <View style={styles.row}>
            <View style={styles.left}>
                <View style={[styles.positionBadge, { backgroundColor: accentColor }]}>
                    <Text style={styles.positionText}>{player.position}</Text>
                </View>
                <Text variant="bodyMedium" style={[styles.name, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {displayName}
                </Text>
                {player.isSub ? (
                    <View style={styles.subBadge}>
                        <Text style={styles.subText}>SUP</Text>
                    </View>
                ) : null}
                {isMvp ? <Icon name="star" size={16} color="#FFD700" /> : null}
            </View>
            {hasStats ? (
                <View style={styles.stats}>
                    {player.goals > 0 ? (
                        <View style={styles.statItem}>
                            <Icon name="soccer" size={13} color={accentColor} />
                            <Text style={[styles.statValue, { color: accentColor }]}>{player.goals}</Text>
                        </View>
                    ) : null}
                    {player.assists > 0 ? (
                        <View style={styles.statItem}>
                            <Icon name="shoe-cleat" size={12} color="#666" />
                            <Text style={styles.statGrey}>{player.assists}</Text>
                        </View>
                    ) : null}
                    {player.ownGoals > 0 ? (
                        <View style={styles.statItem}>
                            <Icon name="close-circle-outline" size={13} color="#E57373" />
                            <Text style={styles.statRed}>{player.ownGoals}</Text>
                        </View>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    positionBadge: {
        width: 36,
        height: 22,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    positionText: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: 'bold',
    },
    name: {
        flex: 1,
    },
    subBadge: {
        backgroundColor: '#B0BEC5',
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    subText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    stats: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    statValue: {
        fontSize: 13,
        fontWeight: '600',
    },
    statGrey: {
        fontSize: 13,
        color: '#666',
    },
    statRed: {
        fontSize: 13,
        color: '#E57373',
    },
});
