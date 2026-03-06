import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Avatar,
  Divider,
  List,
  Text,
  useTheme,
  Button,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';

type RecentPlayerMatchStat = {
  id: string;
  dateLabel: string;
  position: string;
  goals: number;
  assists: number;
  ownGoals: number;
};

type QuickAction = {
  id: string;
  label: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
};

type ReplacementCandidate = {
  groupMemberId: string;
  displayName: string;
  photoUrl: string | null;
};

type Props = {
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  playerName: string;
  playerPhotoUrl?: string | null;
  recentStats: RecentPlayerMatchStat[];
  canManage: boolean;
  quickActions: QuickAction[];
  replacementCandidates: ReplacementCandidate[];
  onReplace: (groupMemberId: string) => void;
};

const getInitials = (name: string) => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

export default function MatchPlayerSlotModal({
  bottomSheetRef,
  playerName,
  playerPhotoUrl,
  recentStats,
  canManage,
  quickActions,
  replacementCandidates,
  onReplace,
}: Props) {
  const theme = useTheme();

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['80%']}
      enablePanDownToClose
      backdropComponent={props => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
      )}
    >
      <BottomSheetScrollView style={styles(theme).container}>
        <View style={styles(theme).header}>
          {playerPhotoUrl ? (
            <Avatar.Image size={58} source={{ uri: playerPhotoUrl }} />
          ) : (
            <Avatar.Text size={58} label={getInitials(playerName)} />
          )}
          <Text variant="titleLarge" style={styles(theme).name}>{playerName}</Text>
        </View>

        <Divider style={styles(theme).divider} />

        <Text variant="titleMedium" style={styles(theme).sectionTitle}>Últimos 10 partidos</Text>
        {recentStats.length === 0 ? (
          <Text style={styles(theme).muted}>No hay historial reciente para mostrar.</Text>
        ) : (
          recentStats.map(stat => (
            <View key={stat.id} style={styles(theme).statRow}>
              <View>
                <Text variant="labelMedium">{stat.dateLabel}</Text>
                <Text style={styles(theme).muted}>Posición: {stat.position}</Text>
              </View>
              <View style={styles(theme).statValues}>
                <View style={styles(theme).statItem}>
                  <Icon name="soccer" size={13} color={theme.colors.primary} />
                  <Text>{stat.goals}</Text>
                </View>
                <View style={styles(theme).statItem}>
                  <Icon name="shoe-cleat" size={13} color={theme.colors.secondary} />
                  <Text>{stat.assists}</Text>
                </View>
                <View style={styles(theme).statItem}>
                  <Icon name="close-circle-outline" size={13} color={theme.colors.error} />
                  <Text>{stat.ownGoals}</Text>
                </View>
              </View>
            </View>
          ))
        )}

        {canManage && quickActions.length > 0 && (
          <>
            <Divider style={styles(theme).divider} />
            <Text variant="titleMedium" style={styles(theme).sectionTitle}>Modificaciones</Text>
            <View style={styles(theme).actionsWrap}>
              {quickActions.map(action => (
                <Button
                  key={action.id}
                  mode="outlined"
                  icon={action.icon}
                  onPress={action.onPress}
                  disabled={action.disabled}
                  style={styles(theme).actionButton}
                >
                  {action.label}
                </Button>
              ))}
            </View>
          </>
        )}

        {canManage && (
          <>
            <Divider style={styles(theme).divider} />
            <Text variant="titleMedium" style={styles(theme).sectionTitle}>Reemplazar jugador</Text>
            {replacementCandidates.length === 0 ? (
              <Text style={styles(theme).muted}>No hay jugadores disponibles para reemplazo.</Text>
            ) : (
              replacementCandidates.map(candidate => (
                <TouchableOpacity
                  key={candidate.groupMemberId}
                  style={styles(theme).candidateRow}
                  activeOpacity={0.75}
                  onPress={() => onReplace(candidate.groupMemberId)}
                >
                  {candidate.photoUrl ? (
                    <Avatar.Image size={36} source={{ uri: candidate.photoUrl }} />
                  ) : (
                    <Avatar.Text size={36} label={getInitials(candidate.displayName)} />
                  )}
                  <Text style={styles(theme).candidateName}>{candidate.displayName}</Text>
                  <Icon name="swap-horizontal" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 8,
    },
    name: {
      fontWeight: '700',
      flex: 1,
    },
    divider: {
      marginVertical: 12,
    },
    sectionTitle: {
      fontWeight: '700',
      marginBottom: 8,
    },
    muted: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 8,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    statValues: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    actionsWrap: {
      gap: 8,
    },
    actionButton: {
      borderRadius: 10,
    },
    candidateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    candidateName: {
      flex: 1,
    },
  });
