import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text, Button, IconButton, useTheme, ActivityIndicator, Snackbar } from 'react-native-paper';

import { useAppSelector } from '../app/hooks';
import {
    subscribePendingApplicationsByGroup,
    reviewPublicMatchApplication,
    type PublicMatchApplication,
} from '../repositories/publicListings/publicMatchApplicationsRepository';

export default function PublicMatchApplicationsScreen() {
    const theme = useTheme();
    const { selectedGroupId } = useAppSelector(state => state.groups);

    const [pendingApplications, setPendingApplications] = useState<PublicMatchApplication[]>([]);
    const [pendingApplicationsError, setPendingApplicationsError] = useState<string | null>(null);
    const [isLoadingApplications, setIsLoadingApplications] = useState(false);
    const [processingApplicationId, setProcessingApplicationId] = useState<string | null>(null);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarVisible, setSnackbarVisible] = useState(false);

    useEffect(() => {
        if (!selectedGroupId) {
            setPendingApplications([]);
            setPendingApplicationsError(null);
            setIsLoadingApplications(false);
            return;
        }

        setIsLoadingApplications(true);
        const unsubscribe = subscribePendingApplicationsByGroup(
            selectedGroupId,
            rows => {
                setPendingApplications(rows);
                setPendingApplicationsError(null);
                setIsLoadingApplications(false);
            },
            error => {
                setPendingApplications([]);
                setPendingApplicationsError(error.message || 'No se pudieron cargar las postulaciones.');
                setIsLoadingApplications(false);
            },
        );

        return unsubscribe;
    }, [selectedGroupId]);

    const handleReview = async (
        applicationId: string,
        decision: 'accepted' | 'rejected',
        membershipMode: 'temporary' | 'permanent' = 'temporary',
    ) => {
        setProcessingApplicationId(applicationId);
        try {
            await reviewPublicMatchApplication({ applicationId, decision, membershipMode });
            setSnackbarMessage(
                decision === 'accepted'
                    ? membershipMode === 'permanent'
                        ? 'Postulación aceptada (membresía permanente)'
                        : 'Postulación aceptada (membresía temporal)'
                    : 'Postulación rechazada',
            );
            setSnackbarVisible(true);
        } catch (error) {
            setSnackbarMessage(error instanceof Error ? error.message : 'No se pudo procesar la postulación');
            setSnackbarVisible(true);
        } finally {
            setProcessingApplicationId(null);
        }
    };

    const formatDate = (value: string | null): string => {
        if (!value) return 'Sin fecha';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
        return parsed.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text variant="titleLarge" style={styles.title}>Postulaciones recibidas</Text>
            <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Revisa y responde las postulaciones del grupo activo.</Text>

            <Card style={styles.card}>
                <Card.Content style={styles.cardContent}>
                    {!selectedGroupId ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            Selecciona un grupo para revisar postulaciones.
                        </Text>
                    ) : isLoadingApplications ? (
                        <View style={styles.loadingWrap}>
                            <ActivityIndicator color={theme.colors.primary} />
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                Cargando postulaciones...
                            </Text>
                        </View>
                    ) : pendingApplications.length === 0 ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {pendingApplicationsError ?? 'No hay postulaciones pendientes.'}
                        </Text>
                    ) : (
                        <View style={styles.applicationsList}>
                            {pendingApplications.map(application => {
                                const isProcessing = processingApplicationId === application.id;
                                return (
                                    <View
                                        key={application.id}
                                        style={[styles.applicationCard, { borderColor: theme.colors.outlineVariant }]}
                                    >
                                        <Text variant="titleSmall" style={styles.applicationTitle}>
                                            {application.applicantDisplayName}
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                            Solicitud: {formatDate(application.createdAt)}
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                            Partido: {application.sourceMatchType}
                                        </Text>
                                        {application.preferredPositions.length > 0 ? (
                                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                                Posiciones: {application.preferredPositions.join(', ')}
                                            </Text>
                                        ) : null}
                                        {application.note ? (
                                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                                Nota: {application.note}
                                            </Text>
                                        ) : null}

                                        <View style={styles.applicationActions}>
                                            <IconButton
                                                icon="close"
                                                size={20}
                                                style={styles.rejectIconButton}
                                                iconColor={theme.colors.error}
                                                onPress={() => {
                                                    void handleReview(application.id, 'rejected');
                                                }}
                                                disabled={isProcessing}
                                            />
                                            <Button
                                                mode="contained"
                                                style={styles.actionButton}
                                                buttonColor={theme.colors.secondary}
                                                textColor={theme.colors.onSecondary}
                                                onPress={() => {
                                                    void handleReview(application.id, 'accepted', 'temporary');
                                                }}
                                                loading={isProcessing}
                                                disabled={isProcessing}
                                            >
                                                Temporal
                                            </Button>
                                            <Button
                                                mode="contained"
                                                style={styles.actionButton}
                                                buttonColor={theme.colors.secondary}
                                                textColor={theme.colors.onSecondary}
                                                onPress={() => {
                                                    void handleReview(application.id, 'accepted', 'permanent');
                                                }}
                                                loading={isProcessing}
                                                disabled={isProcessing}
                                            >
                                                Permanente
                                            </Button>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </Card.Content>
            </Card>

            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={2500}>
                {snackbarMessage}
            </Snackbar>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    content: { padding: 16, gap: 12, paddingBottom: 24 },
    title: { fontWeight: '700' },
    subtitle: { marginBottom: 4 },
    card: { borderRadius: 14, backgroundColor: '#FFFFFF' },
    cardContent: { gap: 10 },
    loadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    applicationsList: { gap: 10 },
    applicationCard: {
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 5,
        gap: 4,
        // backgroundColor: 'blue'
    },
    applicationTitle: { fontWeight: '700' },
    applicationActions: {
        marginTop: 6,
        flexDirection: 'row',
        flexWrap: 'nowrap',
        gap: 4,
        alignItems: 'center',
    },
    actionButton: {
        flex: 1,
        minWidth: 0,
    },
    rejectIconButton: {
        margin: 0,
    },
});
