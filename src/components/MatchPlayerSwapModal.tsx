import React from 'react';
import {
  Modal,
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Text, Button, Divider, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

export type SwapCandidate = {
  groupMemberId: string;
  displayName: string;
};

type Props = {
  visible: boolean;
  /** Players available to swap in (excludes the rest of the current lineup). */
  candidates: SwapCandidate[];
  onSelect: (groupMemberId: string) => void;
  onClose: () => void;
};

export default function MatchPlayerSwapModal({
  visible,
  candidates,
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
        <View style={styles.sheet}>
          <Text variant="titleMedium" style={styles.title}>
            Cambiar jugador
          </Text>

          <FlatList
            data={candidates}
            keyExtractor={c => c.groupMemberId}
            ItemSeparatorComponent={Divider}
            ListEmptyComponent={
              <Text variant="bodyMedium" style={styles.emptyText}>
                No hay más jugadores disponibles
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  onSelect(item.groupMemberId);
                  onClose();
                }}
              >
                <Icon
                  name="account"
                  size={22}
                  color={theme.colors.primary}
                />
                <Text variant="bodyLarge" style={styles.name}>
                  {item.displayName}
                </Text>
                <Icon
                  name="chevron-right"
                  size={20}
                  color={theme.colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            )}
          />

          <Button mode="text" onPress={onClose} style={styles.cancelBtn}>
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '55%',
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  name: {
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    padding: 24,
  },
  cancelBtn: {
    marginTop: 8,
    marginHorizontal: 16,
  },
});
