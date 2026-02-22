import React from 'react';
import { Modal, View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button, Divider, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { GroupMemberV2 } from '../repositories/groupMembersV2/groupMembersV2Repository';

type Props = {
  visible: boolean;
  members: GroupMemberV2[];
  onSelect: (member: GroupMemberV2) => void;
  onClose: () => void;
};

/**
 * Bottom-sheet modal for picking a group member to add to a team.
 * Only shows members not yet assigned to the team.
 */
export default function TeamPlayerPickerModal({
  visible,
  members,
  onSelect,
  onClose,
}: Props) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
          <View style={styles.header}>
            <Text variant="titleMedium" style={styles.title}>
              Seleccionar jugador
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={24} color={theme.colors.onSurface} />
            </TouchableOpacity>
          </View>

          <Divider />

          {members.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="account-off" size={48} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyMedium" style={styles.emptyText}>
                Todos los jugadores del grupo ya están en el equipo
              </Text>
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={item => item.id}
              ItemSeparatorComponent={() => <Divider />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.memberRow}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <Icon name="account" size={22} color={theme.colors.primary} />
                  <Text variant="bodyLarge" style={styles.memberName}>
                    {item.displayName}
                  </Text>
                  <Icon name="plus" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
              )}
            />
          )}

          <Button mode="outlined" onPress={onClose} style={styles.cancelButton}>
            Cancelar
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  memberName: {
    flex: 1,
  },
  cancelButton: {
    marginHorizontal: 16,
    marginTop: 8,
  },
});
