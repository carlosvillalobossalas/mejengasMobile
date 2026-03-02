import React, { useCallback, useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import {
    Text,
    Button,
    useTheme,
    Avatar,
    ActivityIndicator,
    Chip,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

import type { Group } from '../repositories/groups/groupsRepository';
import {
    createJoinRequest,
    getJoinRequestForUser,
    type JoinRequest,
} from '../repositories/joinRequests/joinRequestsRepository';
import { getGroupMemberV2ByUserId } from '../repositories/groupMembersV2/groupMembersV2Repository';
import { getInvitesByEmail } from '../repositories/invites/invitesRepository';

const MATCH_TYPE_LABELS: Record<string, string> = {
    futbol_5: 'Fútbol 5',
    futbol_7: 'Fútbol 7',
    futbol_11: 'Fútbol 11',
};

type MembershipState =
    | 'loading'
    | 'member'
    | 'invited'
    | 'request_pending'
    | 'request_accepted'
    | 'request_rejected'
    | 'none';

type Props = {
    group: Group | null;
    currentUserId: string | null;
    currentUserEmail: string | null;
    currentUserDisplayName: string | null;
    currentUserPhotoURL: string | null;
    bottomSheetRef: React.RefObject<BottomSheet | null>;
    onRequestSent?: () => void;
};

export default function GroupInfoModal({
    group,
    currentUserId,
    currentUserEmail,
    currentUserDisplayName,
    currentUserPhotoURL,
    bottomSheetRef,
    onRequestSent,
}: Props) {
    const theme = useTheme();
    const [membershipState, setMembershipState] = useState<MembershipState>('loading');
    const [isSending, setIsSending] = useState(false);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Re-check membership state whenever the group or user changes
    useEffect(() => {
        if (!group || !currentUserId) {
            setMembershipState('none');
            return;
        }

        const check = async () => {
            setMembershipState('loading');
            try {
                // 1. Already a member?
                const member = await getGroupMemberV2ByUserId(group.id, currentUserId);
                if (member) {
                    if (isMounted.current) setMembershipState('member');
                    return;
                }

                // 2. Has a pending invite?
                if (currentUserEmail) {
                    const invites = await getInvitesByEmail(currentUserEmail);
                    const hasInvite = invites.some(i => i.groupId === group.id);
                    if (hasInvite) {
                        if (isMounted.current) setMembershipState('invited');
                        return;
                    }
                }

                // 3. Has a join request?
                const request = await getJoinRequestForUser(group.id, currentUserId);
                if (request) {
                    // If the request was accepted but the user is no longer a member
                    // (e.g. they were later unlinked), the accepted state is stale.
                    // Allow them to send a new request.
                    if (request.status === 'accepted') {
                        if (isMounted.current) setMembershipState('none');
                        return;
                    }
                    const stateMap: Record<Exclude<JoinRequest['status'], 'accepted'>, MembershipState> = {
                        pending: 'request_pending',
                        rejected: 'request_rejected',
                    };
                    if (isMounted.current) setMembershipState(stateMap[request.status]);
                    return;
                }

                if (isMounted.current) setMembershipState('none');
            } catch {
                if (isMounted.current) setMembershipState('none');
            }
        };

        check();
    }, [group, currentUserId, currentUserEmail]);

    const handleRequestJoin = useCallback(async () => {
        if (!group || !currentUserId || !currentUserEmail) return;

        setIsSending(true);
        try {
            await createJoinRequest({
                groupId: group.id,
                userId: currentUserId,
                userDisplayName: currentUserDisplayName ?? currentUserEmail,
                userEmail: currentUserEmail,
                userPhotoURL: currentUserPhotoURL ?? null,
            });
            setMembershipState('request_pending');
            onRequestSent?.();
        } catch (e) {
            const message = e instanceof Error ? e.message : 'No se pudo enviar la solicitud.';
            Alert.alert('Error', message);
        } finally {
            setIsSending(false);
        }
    }, [group, currentUserId, currentUserEmail, currentUserDisplayName, currentUserPhotoURL, onRequestSent]);

    const renderBackdrop = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        ),
        [],
    );

    const renderFooter = () => {
        switch (membershipState) {
            case 'loading':
                return <ActivityIndicator size="small" color={theme.colors.primary} style={styles.footerSpacing} />;
            case 'member':
                return (
                    <Chip icon="check-circle" style={[styles.statusChip, { backgroundColor: theme.colors.primaryContainer }]}>
                        Ya eres miembro de este grupo
                    </Chip>
                );
            case 'invited':
                return (
                    <Chip icon="email-check" style={[styles.statusChip, { backgroundColor: theme.colors.secondary }]}>
                        Ya fuiste invitado — revisa tus invitaciones
                    </Chip>
                );
            case 'request_pending':
                return (
                    <Chip icon={() => <Icon name='clock-outline' color={theme.colors.onSecondary} />} style={[styles.statusChip, { backgroundColor: theme.colors.secondary }]}>
                        <Text style={{ color: theme.colors.onSecondary }}>
                            Solicitud enviada — pendiente de aprobación
                        </Text>
                    </Chip>
                );
            case 'request_accepted':
                return (
                    <Chip icon={() => <Icon name='check-circle' color={theme.colors.onSecondary} />}style={[styles.statusChip, { backgroundColor: theme.colors.primaryContainer }]}>
                        Solicitud aceptada
                    </Chip>
                );
            case 'request_rejected':
                return (
                    <Chip icon={() => <Icon name='close-circle' color={theme.colors.onError} />} style={[styles.statusChip, { backgroundColor: theme.colors.errorContainer, }]}>
                        Solicitud rechazada
                    </Chip>
                );
            case 'none':
            default:
                return (
                    <Button
                        mode="contained"
                        onPress={handleRequestJoin}
                        loading={isSending}
                        disabled={isSending}
                        icon="account-plus"
                        style={styles.requestButton}
                    >
                        Solicitar unirse
                    </Button>
                );
        }
    };

    return (
        <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            snapPoints={['55%']}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
        >
            <BottomSheetScrollView contentContainerStyle={styles.container}>
                {group ? (
                    <View style={styles.groupContent}>
                        {/* Group header */}
                        <View style={styles.groupHeader}>
                            <View style={[styles.groupAvatar, { backgroundColor: theme.colors.primaryContainer }]}>
                                <Icon name="account-group" size={36} color={theme.colors.primary} />
                            </View>
                            <Text variant="headlineSmall" style={styles.groupName}>
                                {group.name}
                            </Text>
                            {group.description ? (
                                <Text
                                    variant="bodyMedium"
                                    style={[styles.groupDescription, { color: theme.colors.onSurfaceVariant }]}
                                >
                                    {group.description}
                                </Text>
                            ) : null}
                        </View>

                        {/* Meta chips */}
                        <View style={styles.metaRow}>
                            {group.type && MATCH_TYPE_LABELS[group.type] ? (
                                <Chip icon="soccer" compact style={{ ...styles.metaChip, backgroundColor: theme.colors.onPrimary }}>
                                    {MATCH_TYPE_LABELS[group.type]}
                                </Chip>
                            ) : null}
                            {group.hasFixedTeams ? (
                                <Chip icon="shield-account" compact style={{ ...styles.metaChip, backgroundColor: theme.colors.onPrimary }}>
                                    Equipos fijos
                                </Chip>
                            ) : null}
                            <Chip
                                icon={group.visibility === 'public' ? 'earth' : 'lock'}
                                compact
                                style={{ ...styles.metaChip, backgroundColor: theme.colors.onPrimary }}
                            >
                                {group.visibility === 'public' ? 'Público' : 'Privado'}
                            </Chip>
                        </View>

                        {/* Action / status */}
                        <View style={styles.footer}>
                            {renderFooter()}
                        </View>
                    </View>
                ) : (
                    <View style={styles.empty}>
                        <ActivityIndicator color={theme.colors.primary} />
                    </View>
                )}
            </BottomSheetScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 32,
        gap: 16,
    },
    groupContent: {
        gap: 16,
    },
    groupHeader: {
        alignItems: 'center',
        gap: 8,
    },
    groupAvatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    groupName: {
        fontWeight: '700',
        textAlign: 'center',
    },
    groupDescription: {
        textAlign: 'center',
        opacity: 0.85,
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
    metaChip: {
        alignSelf: 'center',
    },
    footer: {
        marginTop: 8,
        alignItems: 'center',
    },
    requestButton: {
        width: '100%',
        borderRadius: 8,
    },
    statusChip: {
        alignSelf: 'center',
        paddingVertical: 4,
    },
    footerSpacing: {
        marginVertical: 8,
    },
    empty: {
        paddingVertical: 40,
        alignItems: 'center',
    },
});
