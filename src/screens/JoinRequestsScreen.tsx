import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    View,
} from 'react-native';
import {
    Avatar,
    Button,
    Divider,
    MD3Theme,
    Portal,
    Surface,
    Text,
    useTheme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFlatList,
    BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { ScrollView } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppSelector } from '../app/hooks';
import {
    subscribeToPendingJoinRequestsByGroupId,
    acceptJoinRequest,
    rejectJoinRequest,
    type JoinRequest,
} from '../repositories/joinRequests/joinRequestsRepository';
import {
    getGroupMembersV2ByGroupId,
    type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';

export default function JoinRequestsScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { selectedGroupId } = useAppSelector(state => state.groups);
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // State for the "link to existing member" bottom sheet
    const linkSheetRef = useRef<BottomSheet>(null);
    const [pendingRequest, setPendingRequest] = useState<JoinRequest | null>(null);
    const [guestMembers, setGuestMembers] = useState<GroupMemberV2[]>([]);
    const [isLoadingGuests, setIsLoadingGuests] = useState(false);
    const [isProcessing, setIsProcessing] = useState<string | null>(null); // requestId being processed

    useEffect(() => {
        if (!selectedGroupId) return;
        setIsLoading(true);
        const unsubscribe = subscribeToPendingJoinRequestsByGroupId(
            selectedGroupId,
            data => {
                setRequests(data);
                setIsLoading(false);
            },
            () => setIsLoading(false),
        );
        return () => unsubscribe();
    }, [selectedGroupId]);

    const handleReject = useCallback(
        (request: JoinRequest) => {
            Alert.alert(
                'Rechazar solicitud',
                `¿Rechazar la solicitud de ${request.userDisplayName}?`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Rechazar',
                        style: 'destructive',
                        onPress: async () => {
                            setIsProcessing(request.id);
                            try {
                                await rejectJoinRequest(request.id);
                            } catch (e) {
                                const msg = e instanceof Error ? e.message : 'Error al rechazar.';
                                Alert.alert('Error', msg);
                            } finally {
                                setIsProcessing(null);
                            }
                        },
                    },
                ],
            );
        },
        [],
    );

    const handleAcceptNew = useCallback(async (request: JoinRequest) => {
        // Accept creating a brand-new groupMember_v2 linked to the user
        Alert.alert(
            'Aceptar solicitud',
            `Se creará un nuevo jugador "${request.userDisplayName}" vinculado a esta cuenta. ¿Continuar?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Crear y aceptar',
                    onPress: async () => {
                        setIsProcessing(request.id);
                        try {
                            await acceptJoinRequest({
                                requestId: request.id,
                                groupId: request.groupId,
                                userId: request.userId,
                                userDisplayName: request.userDisplayName,
                                userPhotoURL: request.userPhotoURL,
                            });
                        } catch (e) {
                            const msg = e instanceof Error ? e.message : 'Error al aceptar.';
                            Alert.alert('Error', msg);
                        } finally {
                            setIsProcessing(null);
                        }
                    },
                },
            ],
        );
    }, []);

    const handleOpenLinkSheet = useCallback(async (request: JoinRequest) => {
        if (!selectedGroupId) return;
        setPendingRequest(request);
        setIsLoadingGuests(true);
        setGuestMembers([]);
        setTimeout(() => {
            linkSheetRef.current?.expand();
        }, 100);
        try {
            const all = await getGroupMembersV2ByGroupId(selectedGroupId);
            // Only show guests (userId === null) — linked members are not selectable
            setGuestMembers(all.filter(m => m.userId === null));
        } catch {
            setGuestMembers([]);
        } finally {
            setIsLoadingGuests(false);
        }
    }, [selectedGroupId]);

    const handleLinkToExisting = useCallback(async (member: GroupMemberV2) => {
        if (!pendingRequest) return;
        linkSheetRef.current?.close();
        setIsProcessing(pendingRequest.id);
        try {
            await acceptJoinRequest({
                requestId: pendingRequest.id,
                groupId: pendingRequest.groupId,
                userId: pendingRequest.userId,
                userDisplayName: pendingRequest.userDisplayName,
                userPhotoURL: pendingRequest.userPhotoURL,
                existingMemberId: member.id,
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Error al vincular.';
            Alert.alert('Error', msg);
        } finally {
            setIsProcessing(null);
            setPendingRequest(null);
        }
    }, [pendingRequest]);

    const renderBackdrop = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        ),
        [],
    );

    if (!selectedGroupId) {
        return (
            <View style={styles(theme).center}>
                <Icon name="alert-circle" size={48} color={theme.colors.error} />
                <Text variant="titleMedium">No hay grupo seleccionado</Text>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles(theme).center}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text variant="bodyLarge" style={styles(theme).loadingText}>Cargando solicitudes...</Text>
            </View>
        );
    }

    return (
        <View style={styles(theme).container}>
            <Surface style={styles(theme).header} elevation={2}>
                <Text variant="bodySmall" style={styles(theme).headerCount}>
                    {requests.length === 0
                        ? 'Sin solicitudes pendientes'
                        : `${requests.length} solicitud${requests.length > 1 ? 'es' : ''} pendiente${requests.length > 1 ? 's' : ''}`}
                </Text>
            </Surface>

            <Divider />

            <ScrollView style={styles(theme).list} contentContainerStyle={styles(theme).listContent}>
                {requests.length === 0 ? (
                    <View style={styles(theme).emptyState}>
                        <Icon name="account-check" size={64} color={theme.colors.onSurfaceDisabled} />
                        <Text
                            variant="titleMedium"
                            style={[styles(theme).emptyText, { color: theme.colors.onSurfaceDisabled }]}
                        >
                            No hay solicitudes pendientes
                        </Text>
                    </View>
                ) : (
                    requests.map(request => (
                        <Surface key={request.id} style={styles(theme).requestCard} elevation={1}>
                            <View style={styles(theme).requestHeader}>
                                {request.userPhotoURL ? (
                                    <Avatar.Image size={48} source={{ uri: request.userPhotoURL }} />
                                ) : (
                                    <Avatar.Text
                                        size={48}
                                        label={request.userDisplayName[0]?.toUpperCase() ?? '?'}
                                        style={{ backgroundColor: theme.colors.primaryContainer }}
                                    />
                                )}
                                <View style={styles(theme).requestInfo}>
                                    <Text variant="titleMedium" style={styles(theme).requestName}>
                                        {request.userDisplayName}
                                    </Text>
                                    <Text
                                        variant="bodySmall"
                                        style={{ color: theme.colors.onSurfaceVariant }}
                                    >
                                        {request.userEmail}
                                    </Text>
                                    {request.createdAt && (
                                        <Text
                                            variant="bodySmall"
                                            style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                                        >
                                            {new Date(request.createdAt).toLocaleDateString('es', {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </Text>
                                    )}
                                </View>
                            </View>

                            <View style={styles(theme).requestActions}>
                                <Button
                                    mode="text"
                                    onPress={() => handleReject(request)}
                                    disabled={isProcessing === request.id}
                                    textColor={theme.colors.error}
                                    style={styles(theme).rejectButton}
                                    compact
                                >
                                    Rechazar
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={() => handleOpenLinkSheet(request)}
                                    disabled={isProcessing === request.id}
                                    loading={isProcessing === request.id}
                                    style={styles(theme).linkButton}
                                    compact
                                >
                                    Vincular existente
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={() => handleAcceptNew(request)}
                                    disabled={isProcessing === request.id}
                                    loading={isProcessing === request.id}
                                    style={styles(theme).acceptButton}
                                    compact
                                >
                                    Jugador nuevo
                                </Button>
                            </View>
                        </Surface>
                    ))
                )}
            </ScrollView>

            {/* Link to existing member bottom sheet */}
            <Portal>
                <BottomSheet
                    ref={linkSheetRef}
                    index={-1}
                    snapPoints={['85%']}
                    enablePanDownToClose
                    backdropComponent={renderBackdrop}
                    topInset={insets.top}
                >
                    <View style={styles(theme).sheetHeader}>
                        <Text variant="titleMedium" style={styles(theme).sheetTitle}>
                            Vincular a jugador existente
                        </Text>
                        {pendingRequest && (
                            <Text
                                variant="bodySmall"
                                style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
                            >
                                Seleccioná el jugador al que querés vincular a {pendingRequest.userDisplayName}
                            </Text>
                        )}
                    </View>
                    {isLoadingGuests ? (
                        <View style={styles(theme).center}>
                            <ActivityIndicator color={theme.colors.primary} />
                        </View>
                    ) : guestMembers.length === 0 ? (
                        <View style={styles(theme).emptyState}>
                            <Text
                                variant="bodyMedium"
                                style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', padding: 16 }}
                            >
                                No hay jugadores sin vincular en este grupo
                            </Text>
                        </View>
                    ) : (
                        <BottomSheetFlatList
                            data={guestMembers}
                            keyExtractor={(item: GroupMemberV2) => item.id}
                            ItemSeparatorComponent={Divider}
                            contentContainerStyle={styles(theme).sheetList}
                            renderItem={({ item }: { item: GroupMemberV2 }) => (
                                <Button
                                    mode="text"
                                    onPress={() => handleLinkToExisting(item)}
                                    contentStyle={styles(theme).guestItemContent}
                                    style={styles(theme).guestItem}
                                    icon={item.photoUrl ? () => (
                                        <Avatar.Image size={32} source={{ uri: item.photoUrl! }} />
                                    ) : () => (
                                        <Avatar.Text
                                            size={32}
                                            label={item.displayName[0]?.toUpperCase() ?? '?'}
                                            style={{ backgroundColor: theme.colors.primaryContainer }}
                                        />
                                    )}
                                >
                                    {item.displayName}
                                </Button>
                            )}
                        />
                    )}
                </BottomSheet>
            </Portal>
        </View>
    );
}

const styles = (theme: MD3Theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: 10,
    },
    loadingText: { marginTop: 8 },
    header: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 10,
        alignItems: 'center',
    },
    headerCount: { color: '#FFFFFF', fontWeight: '600' },
    list: { flex: 1 },
    listContent: { padding: 10, gap: 12, paddingBottom: 32 },
    emptyState: {
        paddingTop: 60,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: { textAlign: 'center' },
    requestCard: {
        borderRadius: 12,
        padding: 10,
        gap: 12,
        backgroundColor: '#FFFFFF',
    },
    requestHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    requestInfo: { flex: 1, gap: 2 },
    requestName: { fontWeight: '600' },
    requestActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    rejectButton: { borderColor: theme.colors.error },
    linkButton: {},
    acceptButton: {},
    sheetHeader: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        alignItems: 'center',
        gap: 4,
    },
    sheetTitle: { fontWeight: 'bold', textAlign: 'center' },
    sheetList: { paddingHorizontal: 8, paddingBottom: 24 },
    guestItem: { borderRadius: 0 },
    guestItemContent: {
        justifyContent: 'flex-start',
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
});
