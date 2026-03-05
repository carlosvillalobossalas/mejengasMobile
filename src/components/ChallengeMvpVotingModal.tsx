import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Modal,
  Portal,
  Text,
  Button,
  Divider,
  useTheme,
  MD3Theme,
  Avatar,
  ActivityIndicator,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { ChallengeMatch } from '../repositories/matches/matchesByChallengeRepository';
import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';

const POSITION_LABEL: Record<string, string> = {
  POR: 'Portero',
  DEF: 'Defensa',
  MED: 'Mediocampista',
  DEL: 'Delantero',
};

type Props = {
  visible: boolean;
  match: ChallengeMatch | null;
  allPlayers: GroupMemberV2[];
  currentUserGroupMemberId: string | null;
  isVoting: boolean;
  voteError: string | null;
  onVote: (votedGroupMemberId: string) => Promise<void>;
  onDismiss: () => void;
  onClearError: () => void;
};

export default function ChallengeMvpVotingModal({
  visible,
  match,
  allPlayers,
  currentUserGroupMemberId,
  isVoting,
  voteError,
  onVote,
  onDismiss,
  onClearError,
}: Props) {
  const theme = useTheme();
  const [votingForId, setVotingForId] = useState<string | null>(null);

  const myCurrentVote = useMemo(() => {
    if (!match || !currentUserGroupMemberId) return null;
    return match.mvpVotes[currentUserGroupMemberId] ?? null;
  }, [match, currentUserGroupMemberId]);

  const participants = useMemo(() => {
    if (!match) return [];
    return match.players
      .filter((p): p is (typeof p) & { groupMemberId: string } => p.groupMemberId !== null)
      .map(p => {
        const member = allPlayers.find(m => m.id === p.groupMemberId);
        return {
          groupMemberId: p.groupMemberId,
          position: p.position,
          displayName: member?.displayName ?? 'Jugador',
          photoUrl: member?.photoUrl ?? null,
          isSub: p.isSub,
        };
      });
  }, [match, allPlayers]);

  const timeRemainingText = useMemo(() => {
    if (!match?.mvpVoting?.closesAt) return '';
    const diffMs = match.mvpVoting.closesAt.toMillis() - Date.now();
    if (diffMs <= 0) return 'La votación ha cerrado';
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (totalHours >= 24) {
      const days = Math.floor(totalHours / 24);
      return `Cierra en ${days}d ${totalHours % 24}h`;
    }
    if (totalHours > 0) return `Cierra en ${totalHours}h ${minutes}m`;
    return `Cierra en ${minutes}m`;
  }, [match?.mvpVoting?.closesAt]);

  const handleVote = async (groupMemberId: string) => {
    setVotingForId(groupMemberId);
    onClearError();
    try {
      await onVote(groupMemberId);
    } finally {
      setVotingForId(null);
    }
  };

  if (!match) return null;

  const s = styles(theme);

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={s.modal}>
        <View style={s.header}>
          <Icon name="star-circle" size={24} color={theme.colors.primary} />
          <Text variant="titleMedium" style={s.title}>
            Votar por el MVP
          </Text>
        </View>

        <Text variant="labelMedium" style={s.timeRemaining}>
          {timeRemainingText}
        </Text>

        {myCurrentVote && (
          <Text variant="labelSmall" style={s.alreadyVotedNote}>
            Ya votaste — podés cambiar tu voto tocando "Votar" en otro jugador
          </Text>
        )}

        {voteError && (
          <Text variant="labelSmall" style={s.errorText}>
            {voteError}
          </Text>
        )}

        <Divider style={s.divider} />

        <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
          {participants.map(p => {
            const isVoted = myCurrentVote === p.groupMemberId;
            const isLoadingThis = votingForId === p.groupMemberId;

            return (
              <View key={p.groupMemberId} style={s.row}>
                <View style={s.playerInfo}>
                  {p.photoUrl ? (
                    <Avatar.Image size={36} source={{ uri: p.photoUrl }} />
                  ) : (
                    <Avatar.Text size={36} label={p.displayName.charAt(0).toUpperCase()} />
                  )}
                  <View style={s.playerText}>
                    <Text variant="bodyMedium" style={s.playerName}>
                      {p.displayName}
                    </Text>
                    <Text variant="labelSmall" style={s.position}>
                      {POSITION_LABEL[p.position] ?? p.position}
                      {p.isSub ? ' · SUP' : ''}
                    </Text>
                  </View>
                </View>

                {isLoadingThis ? (
                  <ActivityIndicator size="small" />
                ) : isVoted ? (
                  <View style={s.votedBadge}>
                    <Icon name="star" size={16} color={theme.colors.primary} />
                    <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
                      Mi voto
                    </Text>
                  </View>
                ) : (
                  <Button
                    mode="outlined"
                    onPress={() => handleVote(p.groupMemberId)}
                    disabled={isVoting}
                    compact
                    style={s.voteButton}
                  >
                    Votar
                  </Button>
                )}
              </View>
            );
          })}
        </ScrollView>

        <Button onPress={onDismiss} style={s.closeButton}>
          Cerrar
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    modal: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 24,
      borderRadius: 16,
      padding: 20,
      height: '70%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    title: {
      fontWeight: 'bold',
    },
    timeRemaining: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 4,
    },
    alreadyVotedNote: {
      color: theme.colors.primary,
      marginBottom: 4,
    },
    errorText: {
      color: theme.colors.error,
      marginBottom: 4,
    },
    divider: {
      marginVertical: 8,
    },
    scroll: {
      flex: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    playerInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    playerText: {
      flex: 1,
    },
    playerName: {
      fontWeight: '500',
    },
    position: {
      color: theme.colors.onSurfaceVariant,
    },
    votedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    voteButton: {
      minWidth: 70,
    },
    closeButton: {
      marginTop: 8,
    },
  });
