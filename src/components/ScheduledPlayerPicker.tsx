import React from 'react';
import {
  Modal,
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Text, Avatar, Divider, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';

type Props = {
  visible: boolean;
  members: GroupMemberV2[];
  /** IDs already assigned to the OTHER team — shown as blocked */
  blockedIds: Set<string>;
  /** Currently selected member in this slot */
  currentId: string | null;
  teamLabel: string;
  onSelect: (memberId: string | null) => void;
  onDismiss: () => void;
};

export default function ScheduledPlayerPicker({
  visible,
  members,
  blockedIds,
  currentId,
  teamLabel,
  onSelect,
  onDismiss,
}: Props) {
  const theme = useTheme();

  const renderMember = ({ item }: { item: GroupMemberV2 }) => {
    const isBlocked = blockedIds.has(item.id);
    const isSelected = item.id === currentId;

    return (
      <TouchableOpacity
        style={[
          styles.memberRow,
          isSelected && { backgroundColor: theme.colors.primaryContainer },
        ]}
        onPress={() => !isBlocked && onSelect(item.id)}
        disabled={isBlocked}
        activeOpacity={isBlocked ? 1 : 0.7}
      >
        {item.photoUrl ? (
          <Avatar.Image size={40} source={{ uri: item.photoUrl }} />
        ) : (
          <Avatar.Text
            size={40}
            label={item.displayName.substring(0, 2).toUpperCase()}
          />
        )}
        <View style={styles.memberInfo}>
          <Text
            variant="bodyMedium"
            style={[styles.memberName, isBlocked && styles.blockedText]}
          >
            {item.displayName}
          </Text>
          {isBlocked && (
            <Text variant="labelSmall" style={styles.blockedLabel}>
              Ya asignado al otro equipo
            </Text>
          )}
        </View>
        {isSelected && (
          <Icon name="check-circle" size={20} color={theme.colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View
          style={[styles.container, { backgroundColor: theme.colors.background }]}
        >
          <View style={styles.header}>
            <Text variant="titleMedium" style={styles.title}>
              Seleccionar jugador — {teamLabel}
            </Text>
            <TouchableOpacity
              onPress={onDismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={24} color={theme.colors.onSurface} />
            </TouchableOpacity>
          </View>

          <Divider />

          {/* "Sin asignar" option to clear the slot */}
          <TouchableOpacity style={styles.clearOption} onPress={() => onSelect(null)}>
            <Icon name="account-remove-outline" size={24} color={theme.colors.onSurfaceVariant} />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Sin asignar
            </Text>
          </TouchableOpacity>

          <Divider />

          <FlatList
            data={members}
            keyExtractor={item => item.id}
            renderItem={renderMember}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  clearOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontWeight: '500',
  },
  blockedText: {
    opacity: 0.4,
  },
  blockedLabel: {
    color: '#999',
    marginTop: 2,
  },
});
