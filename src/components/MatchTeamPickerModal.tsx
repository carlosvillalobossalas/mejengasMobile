import React from 'react';
import {
  Modal,
  View,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { Text, Button, Divider, useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { Team } from '../repositories/teams/teamsRepository';

type Props = {
  visible: boolean;
  /** Only teams the user is allowed to pick (already filtered by the caller). */
  teams: Team[];
  onSelect: (teamId: string) => void;
  onClose: () => void;
};

export default function MatchTeamPickerModal({
  visible,
  teams,
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
            Seleccionar equipo
          </Text>

          <FlatList
            data={teams}
            keyExtractor={t => t.id}
            ItemSeparatorComponent={Divider}
            ListEmptyComponent={
              <Text variant="bodyMedium" style={styles.emptyText}>
                No hay equipos disponibles
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.teamRow}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
              >
                {item.photoUrl ? (
                  <Image
                    source={{ uri: item.photoUrl }}
                    style={[styles.teamPhoto, { borderColor: item.color }]}
                  />
                ) : (
                  <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                )}
                <Text variant="bodyLarge" style={styles.teamName}>
                  {item.name}
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
    maxHeight: '60%',
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  teamPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  teamName: {
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
