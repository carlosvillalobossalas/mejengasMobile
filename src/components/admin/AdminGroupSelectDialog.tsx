import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';

import type { Group } from '../../repositories/groups/groupsRepository';

interface Props {
  visible: boolean;
  title: string;
  groups: Group[];
  onSelect: (groupId: string) => void;
  onDismiss: () => void;
}

export default function AdminGroupSelectDialog({ visible, title, groups, onSelect, onDismiss }: Props) {
  const theme = useTheme();

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={s.modal}>
        <Text variant="titleMedium" style={s.title}>{title}</Text>
        <Text variant="bodySmall" style={[s.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          Selecciona el grupo para continuar
        </Text>

        {groups.length === 0 ? (
          <Text variant="bodyMedium" style={[s.empty, { color: theme.colors.onSurfaceVariant }]}>
            No tienes grupos disponibles para esta acción.
          </Text>
        ) : (
          groups.map(group => (
            <TouchableOpacity
              key={group.id}
              style={[s.row, { borderColor: theme.colors.outlineVariant }]}
              onPress={() => onSelect(group.id)}
              activeOpacity={0.7}
            >
              <Icon name="account-group-outline" size={20} color={theme.colors.primary} />
              <View style={s.rowText}>
                <Text variant="titleSmall" style={s.groupName}>{group.name}</Text>
                {group.description ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                    {group.description}
                  </Text>
                ) : null}
              </View>
              <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          ))
        )}

        <View style={s.actions}>
          <Button mode="text" onPress={onDismiss}>Cancelar</Button>
        </View>
      </Modal>
    </Portal>
  );
}

const s = StyleSheet.create({
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  title: {
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
  empty: {
    marginBottom: 16,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
  groupName: {
    fontWeight: '600',
  },
  actions: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
});
