import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Chip, TextInput, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { MatchTeamPlayer, MatchPosition } from '../hooks/useAddMatchTeams';

type PlayerUpdate = Partial<
  Pick<MatchTeamPlayer, 'position' | 'goals' | 'assists' | 'ownGoals'>
>;

type Props = {
  player: MatchTeamPlayer;
  onUpdate: (updates: PlayerUpdate) => void;
  /** When provided a swap icon is shown; tapping it triggers this callback. */
  onSwapRequest?: () => void;
  /** When true the position chips are hidden and the position is locked to POR. */
  positionLocked?: boolean;
  /** When false, POR is removed from the selectable positions (non-sub starters). Defaults to true. */
  allowGoalkeeper?: boolean;
  /** Called when any stat input is focused — use to scroll the row into view. */
  onStatFocus?: () => void;
};

const POSITIONS: MatchPosition[] = ['POR', 'DEF', 'MED', 'DEL'];
const POSITIONS_NO_GK: MatchPosition[] = ['DEF', 'MED', 'DEL'];

const STAT_FIELDS: {
  key: keyof Pick<MatchTeamPlayer, 'goals' | 'assists' | 'ownGoals'>;
  label: string;
}[] = [
  { key: 'goals', label: 'Goles' },
  { key: 'assists', label: 'Asist.' },
  { key: 'ownGoals', label: 'Autogoles' },
];

export default function MatchPlayerStatsRow({ player, onUpdate, onSwapRequest, positionLocked, allowGoalkeeper = true, onStatFocus }: Props) {
  const theme = useTheme();
  const availablePositions = allowGoalkeeper ? POSITIONS : POSITIONS_NO_GK;

  return (
    <View style={styles.container}>
      {/* Name + swap button + position chips */}
      <View style={styles.headerRow}>
        <Text variant="bodyMedium" style={styles.name} numberOfLines={1}>
          {player.displayName}
        </Text>
        {player.isSub && (
          <View style={styles.subBadge}>
            <Text style={styles.subBadgeText}>SUP</Text>
          </View>
        )}
        {onSwapRequest && (
          <TouchableOpacity
            onPress={onSwapRequest}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.swapBtn}
          >
            <Icon name="swap-horizontal" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        )}
        {positionLocked ? (
          <View style={styles.positionLockedBadge}>
            <Text style={styles.positionLockedText}>POR</Text>
          </View>
        ) : (
          <View style={styles.chips}>
            {availablePositions.map(pos => (
              <TouchableOpacity key={pos} onPress={() => onUpdate({ position: pos })}>
                <Chip
                  compact
                  selected={player.position === pos}
                  selectedColor="white"
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        player.position === pos
                          ? theme.colors.primary
                          : theme.colors.surfaceVariant,
                    },
                  ]}
                  textStyle={styles.chipText}
                >
                  {pos}
                </Chip>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Stat inputs */}
      <View style={styles.statsRow}>
        {STAT_FIELDS.map(({ key, label }) => (
          <View key={key} style={styles.statField}>
            <Text variant="labelSmall" style={styles.statLabel}>
              {label}
            </Text>
            <TextInput
              mode="outlined"
              dense
              keyboardType="numeric"
              value={String(player[key])}
              onChangeText={v => onUpdate({ [key]: parseInt(v, 10) || 0 })}
              onFocus={() => onStatFocus?.()}
              style={styles.statInput}
              contentStyle={styles.statInputContent}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  name: {
    flex: 1,
    fontWeight: '600',
  },
  swapBtn: {
    padding: 2,
  },
  subBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  subBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#388E3C',
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    gap: 2,
  },  positionLockedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#E8EAF6',
  },
  positionLockedText: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#3949AB',
  },  chip: {
    height: 26,
  },
  chipText: {
    fontSize: 10,
    marginVertical: 0,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statField: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    color: '#888',
    marginBottom: 2,
    textAlign: 'center',
  },
  statInput: {
    width: '100%',
    backgroundColor: '#FFF',
  },
  statInputContent: {
    textAlign: 'center',
    paddingHorizontal: 2,
  },
});
