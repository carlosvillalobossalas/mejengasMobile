import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Text, Divider, useTheme } from 'react-native-paper';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const TEAM_COLOR_OPTIONS = [
  '#000000',
  '#FFFFFF',
  '#1E3A8A',
  '#2563EB',
  '#0F766E',
  '#059669',
  '#166534',
  '#F59E0B',
  '#EA580C',
  '#B91C1C',
  '#7C3AED',
  '#4B5563',
];

type Props = {
  visible: boolean;
  title: string;
  selectedColor: string;
  onSelect: (color: string) => void;
  onDismiss: () => void;
};

export default function ColorPickerSheet({
  visible,
  title,
  selectedColor,
  onSelect,
  onDismiss,
}: Props) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Tap backdrop to dismiss */}
        <TouchableWithoutFeedback onPress={onDismiss}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { backgroundColor: '#FFFFFF' }]}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text variant="titleMedium" style={styles.headerTitle}>
              {title}
            </Text>
          </View>

          <Divider />

          {/* Color grid */}
          <View style={styles.colorGrid}>
            {TEAM_COLOR_OPTIONS.map(color => (
              <TouchableOpacity
                key={color}
                activeOpacity={0.75}
                onPress={() => {
                  onSelect(color);
                  onDismiss();
                }}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  selectedColor === color && [
                    styles.selectedColorOption,
                    { borderColor: theme.colors.primary },
                  ],
                  color === '#FFFFFF' && styles.whiteColorBorder,
                ]}
              />
            ))}
          </View>

          {/* Safe area bottom padding */}
          <View style={{ height: 24 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.45,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontWeight: '600',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  selectedColorOption: {
    borderWidth: 3,
  },
  whiteColorBorder: {
    borderWidth: 1,
    borderColor: '#CFCFCF',
  },
});
