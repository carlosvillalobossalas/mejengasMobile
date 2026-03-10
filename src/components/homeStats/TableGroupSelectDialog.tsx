import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';

import type { Group } from '../../repositories/groups/groupsRepository';

type TableType = 'PlayersTable' | 'GoalkeepersTable' | 'TeamStandings';

const TABLE_LABEL: Record<TableType, string> = {
  PlayersTable: 'Tabla de Jugadores',
  GoalkeepersTable: 'Tabla de Porteros',
  TeamStandings: 'Tabla de Equipos',
};

interface Props {
  visible: boolean;
  tableType: TableType | null;
  groups: Group[];
  onSelect: (groupId: string) => void;
  onDismiss: () => void;
}

export default function TableGroupSelectDialog({
  visible,
  tableType,
  groups,
  onSelect,
  onDismiss,
}: Props) {
  const theme = useTheme();

  // Filter compatible groups per table type
  const compatibleGroups = tableType === 'TeamStandings'
    ? groups.filter(g => g.hasFixedTeams)
    : groups;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={s.modal}
      >
        <Text variant="titleMedium" style={s.title}>
          {tableType ? TABLE_LABEL[tableType] : ''}
        </Text>
        <Text variant="bodySmall" style={[s.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          Selecciona el grupo para ver la tabla
        </Text>

        {compatibleGroups.length === 0 ? (
          <Text variant="bodyMedium" style={[s.emptyText, { color: theme.colors.onSurfaceVariant }]}>
            No tienes grupos compatibles con esta tabla.
          </Text>
        ) : (
          compatibleGroups.map(group => (
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
  emptyText: {
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
