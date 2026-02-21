import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  Divider,
  useTheme,
  MD3Theme,
  Portal,
  Modal,
  TextInput,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { useAppSelector } from '../app/hooks';
import {
  getGroupMembersV2ByGroupId,
  unlinkUserFromGroupMemberV2,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import {
  createInvite,
  getPendingInviteForMember,
  type Invite,
} from '../repositories/invites/invitesRepository';

type MemberWithInvite = GroupMemberV2 & {
  pendingInvite: Invite | null;
};

export default function ManageMembersScreen() {
  const theme = useTheme();
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const currentUser = useAppSelector(state => state.auth.firestoreUser);

  const [members, setMembers] = useState<MemberWithInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberWithInvite | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedGroupId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const rawMembers = await getGroupMembersV2ByGroupId(selectedGroupId);
      const withInvites = await Promise.all(
        rawMembers.map(async m => {
          const pendingInvite = await getPendingInviteForMember(m.id);
          return { ...m, pendingInvite };
        }),
      );
      setMembers(withInvites);
    } catch (error) {
      console.error('Error loading members:', error);
      Alert.alert('Error', 'No se pudieron cargar los miembros');
    } finally {
      setIsLoading(false);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Unlink ─────────────────────────────────────────────────────────────────

  const handleUnlink = (member: MemberWithInvite) => {
    Alert.alert(
      'Desvincular cuenta',
      `¿Deseas desvincular la cuenta de usuario de "${member.displayName}"?\n\nSus estadísticas e historial de partidos se conservan.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: async () => {
            setActioningId(member.id);
            try {
              await unlinkUserFromGroupMemberV2(member.id);
              await loadData();
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              Alert.alert('Error', msg);
            } finally {
              setActioningId(null);
            }
          },
        },
      ],
    );
  };

  // ─── Invite ──────────────────────────────────────────────────────────────────

  const openInviteModal = (member: MemberWithInvite) => {
    setSelectedMember(member);
    setInviteEmail('');
    setShowInviteModal(true);
  };

  const handleSendInvite = async () => {
    if (!selectedMember || !selectedGroupId || !currentUser) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      Alert.alert('Error', 'Ingresa un correo electrónico válido');
      return;
    }

    setIsSending(true);
    try {
      const activeGroup = groups.find(g => g.id === selectedGroupId);
      await createInvite({
        groupId: selectedGroupId,
        groupMemberId: selectedMember.id,
        email: inviteEmail.trim(),
        invitedById: currentUser.uid,
        invitedByName: currentUser.displayName ?? currentUser.email ?? 'Admin',
        displayNameSnapshot: selectedMember.displayName,
        groupName: activeGroup?.name ?? '',
      });
      setShowInviteModal(false);
      Alert.alert('Éxito', `Invitación enviada a ${inviteEmail.trim().toLowerCase()}`);
      await loadData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', msg);
    } finally {
      setIsSending(false);
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  if (!selectedGroupId) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No hay grupo seleccionado
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).subtleText}>
          Cargando miembros...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles(theme).container} contentContainerStyle={styles(theme).content}>
      <View style={styles(theme).headerRow}>
        <Icon name="account-group" size={28} color={theme.colors.primary} />
        <Text variant="headlineSmall" style={styles(theme).title}>
          Gestionar miembros
        </Text>
      </View>
      <Text variant="bodySmall" style={styles(theme).subtitle}>
        {members.length} {members.length === 1 ? 'jugador' : 'jugadores'} en el grupo
      </Text>

      {members.length === 0 && (
        <Card style={styles(theme).emptyCard}>
          <Card.Content style={styles(theme).emptyContent}>
            <Icon name="account-off" size={48} color={theme.colors.onSurfaceVariant} />
            <Text style={styles(theme).emptyText}>No hay miembros migrados aún</Text>
          </Card.Content>
        </Card>
      )}

      {members.map(member => {
        const isActioning = actioningId === member.id;
        const isLinked = !!member.userId;
        const hasPendingInvite = !!member.pendingInvite;

        return (
          <Card key={member.id} style={styles(theme).card}>
            <Card.Content>
              {/* Header row */}
              <View style={styles(theme).memberRow}>
                <View style={styles(theme).memberInfo}>
                  <Text variant="titleMedium" style={styles(theme).memberName}>
                    {member.displayName}
                  </Text>

                  <View style={styles(theme).chipRow}>
                    {isLinked ? (
                      <Chip
                        icon="link"
                        compact
                        style={styles(theme).linkedChip}
                        textStyle={styles(theme).linkedChipText}
                      >
                        Vinculado
                      </Chip>
                    ) : (
                      <Chip
                        icon="link-off"
                        compact
                        style={styles(theme).unlinkedChip}
                        textStyle={styles(theme).unlinkedChipText}
                      >
                        Sin cuenta
                      </Chip>
                    )}
                    {hasPendingInvite && (
                      <Chip
                        icon="email-clock"
                        compact
                        style={styles(theme).pendingChip}
                        textStyle={styles(theme).pendingChipText}
                      >
                        Invitación pendiente
                      </Chip>
                    )}
                  </View>

                  {hasPendingInvite && (
                    <Text variant="bodySmall" style={styles(theme).pendingEmail}>
                      → {member.pendingInvite!.email}
                    </Text>
                  )}
                </View>

                {/* Action button */}
                {isLinked ? (
                  <Button
                    mode="outlined"
                    compact
                    disabled={isActioning}
                    loading={isActioning}
                    onPress={() => handleUnlink(member)}
                    textColor={theme.colors.error}
                    style={styles(theme).unlinkButton}
                  >
                    Desvincular
                  </Button>
                ) : (
                  <Button
                    mode="contained"
                    compact
                    disabled={isActioning || hasPendingInvite}
                    loading={isActioning}
                    onPress={() => openInviteModal(member)}
                    style={styles(theme).inviteButton}
                  >
                    {hasPendingInvite ? 'Invitado' : 'Invitar'}
                  </Button>
                )}
              </View>
            </Card.Content>
          </Card>
        );
      })}

      {/* Invite modal */}
      <Portal>
        <Modal
          visible={showInviteModal}
          onDismiss={() => {
            Keyboard.dismiss();
            setShowInviteModal(false);
          }}
          contentContainerStyle={styles(theme).modalWrapper}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles(theme).modalContent}>
                <View style={styles(theme).modalHeader}>
            <Icon name="email-plus" size={32} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles(theme).modalTitle}>
              Invitar jugador
            </Text>
            {selectedMember && (
              <>
                <Text variant="bodyMedium" style={styles(theme).modalSubtitle}>
                  Enlazar cuenta de
                </Text>
                <Text variant="titleMedium" style={styles(theme).modalMemberName}>
                  {selectedMember.displayName}
                </Text>
              </>
            )}
          </View>

          <Divider style={styles(theme).modalDivider} />

          <TextInput
            label="Correo electrónico"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            disabled={isSending}
            style={styles(theme).emailInput}
          />

          <View style={styles(theme).modalButtons}>
            <Button
              mode="outlined"
              onPress={() => setShowInviteModal(false)}
              disabled={isSending}
              style={styles(theme).modalButton}
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              onPress={handleSendInvite}
              loading={isSending}
              disabled={isSending}
              style={styles(theme).modalButton}
            >
              Enviar
            </Button>
          </View>
        </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>
    </ScrollView>
  );
}

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    content: { padding: 16, paddingBottom: 40 },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      padding: 24,
    },
    errorText: { color: theme.colors.error, textAlign: 'center' },
    subtleText: { color: '#666' },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    title: { fontWeight: 'bold' },
    subtitle: { color: '#666', marginBottom: 16 },
    emptyCard: { borderRadius: 12 },
    emptyContent: { alignItems: 'center', paddingVertical: 32, gap: 12 },
    emptyText: { color: '#999', textAlign: 'center' },
    card: { marginBottom: 10, borderRadius: 12 },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    memberInfo: { flex: 1, gap: 6 },
    memberName: { fontWeight: '600' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    linkedChip: { backgroundColor: theme.colors.inversePrimary, alignSelf: 'flex-start' },
    linkedChipText: { fontSize: 11 },
    unlinkedChip: {
      backgroundColor: theme.colors.errorContainer,
      alignSelf: 'flex-start',
    },
    unlinkedChipText: { fontSize: 11, color: theme.colors.error },
    pendingChip: { backgroundColor: '#FFF3E0', alignSelf: 'flex-start' },
    pendingChipText: { fontSize: 11, color: '#E65100' },
    pendingEmail: { color: '#E65100', fontSize: 12 },
    unlinkButton: { borderColor: theme.colors.error },
    inviteButton: {},
    // Modal
    modalWrapper: {
      margin: 20,
    },
    modalContent: {
      backgroundColor: 'white',
      padding: 24,
      borderRadius: 16,
    },
    modalHeader: { alignItems: 'center', gap: 8, marginBottom: 8 },
    modalTitle: { fontWeight: 'bold' },
    modalSubtitle: { color: '#666', textAlign: 'center', lineHeight: 22 },
    modalMemberName: { fontWeight: 'bold', color: theme.colors.primary },
    modalDivider: { marginVertical: 16 },
    emailInput: { marginBottom: 20 },
    modalButtons: { flexDirection: 'row', gap: 12 },
    modalButton: { flex: 1 },
  });
