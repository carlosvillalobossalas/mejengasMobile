import React, { useState, useCallback, useRef } from 'react';
import { ScrollView, View, StyleSheet, ActivityIndicator } from 'react-native';
import {
  Text,
  Surface,
  Divider,
  Button,
  Portal,
  useTheme,
  MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';

import { useAppSelector } from '../app/hooks';
import { useMatchesByTeams } from '../hooks/useMatchesByTeams';
import MatchByTeamsCard from '../components/MatchByTeamsCard';

// Icon component outside render to avoid React warnings
const CalendarIcon = () => <Icon name="calendar-month" size={20} color="#FFFFFF" />;

export default function MatchesByTeamsScreen() {
  const theme = useTheme();
  const { selectedGroupId } = useAppSelector(state => state.groups);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  // One ref per card — used to measure position in scroll content after collapse
  const cardRefs = useRef<Map<string, View | null>>(new Map());

  const {
    matches,
    teamsMap,
    groupMembers,
    isLoading,
    error,
    selectedYear,
    setSelectedYear,
    yearOptions,
  } = useMatchesByTeams(selectedGroupId ?? undefined);

  const handleToggle = useCallback((matchId: string) => {
    setExpandedMatchId(prev => {
      const isCurrentlyExpanded = prev === matchId;
      if (isCurrentlyExpanded) {
        // Collapse first, then wait for layout to settle before scrolling
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const cardNode = cardRefs.current.get(matchId);
            if (cardNode && scrollViewRef.current) {
              // measureLayout gives the card's Y position in the scroll content
              cardNode.measureLayout(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                scrollViewRef.current as any,
                (_left, top) => {
                  scrollViewRef.current?.scrollTo({ y: top, animated: true });
                },
                () => {},
              );
            }
          });
        });
        return null;
      }
      return matchId;
    });
  }, []);

  const handleSelectYear = useCallback(
    (year: number | 'historico') => {
      setSelectedYear(year);
      bottomSheetRef.current?.close();
    },
    [setSelectedYear],
  );

  const getYearLabel = (year: number | 'historico') => {
    const option = yearOptions.find(o => o.value === year);
    return option?.label ?? year.toString();
  };

  const renderBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  if (!selectedGroupId) {
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          No hay grupo seleccionado
        </Text>
        <Text variant="bodyMedium" style={styles(theme).errorSubtext}>
          Por favor, seleccioná un grupo desde la pantalla de Grupos
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles(theme).centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles(theme).loadingText}>
          Cargando partidos...
        </Text>
      </View>
    );
  }

  if (error) {
    console.log(error)
    return (
      <View style={styles(theme).centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={styles(theme).errorText}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles(theme).container}>
      {/* Header */}
      <Surface style={styles(theme).header} elevation={2}>
        <View style={styles(theme).headerContent}>
          <Text variant="bodySmall" style={styles(theme).matchCount}>
            Total: {matches.length} partido{matches.length !== 1 ? 's' : ''}
          </Text>
          <Button
            mode="contained"
            onPress={() => bottomSheetRef.current?.expand()}
            icon={CalendarIcon}
            style={styles(theme).yearButton}
            contentStyle={styles(theme).yearButtonContent}
            labelStyle={styles(theme).yearButtonLabel}
          >
            {getYearLabel(selectedYear)}
          </Button>
        </View>
      </Surface>

      <Divider />

      {/* Matches list */}
      <ScrollView
        ref={scrollViewRef}
        style={styles(theme).scrollView}
        contentContainerStyle={styles(theme).contentContainer}
      >
        {matches.length === 0 ? (
          <View style={styles(theme).emptyState}>
            <Icon name="soccer" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={styles(theme).emptyText}>
              No hay partidos registrados
            </Text>
            <Text variant="bodyMedium" style={styles(theme).emptySubtext}>
              Los partidos aparecerán aquí cuando se registren
            </Text>
          </View>
        ) : (
          matches.map(match => (
            <View
              key={match.id}
              ref={el => { cardRefs.current.set(match.id, el); }}
            >
              <MatchByTeamsCard
                match={match}
                team1={teamsMap.get(match.team1Id)}
                team2={teamsMap.get(match.team2Id)}
                groupMembers={groupMembers}
                isExpanded={expandedMatchId === match.id}
                onToggle={() => handleToggle(match.id)}
              />
            </View>
          ))
        )}
      </ScrollView>

      {/* Year selection bottom sheet */}
      <Portal>
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={['50%']}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
        >
          <View style={styles(theme).bottomSheetContent}>
            <Text variant="titleMedium" style={styles(theme).bottomSheetTitle}>
              Seleccionar Temporada
            </Text>
            <BottomSheetFlatList
              data={yearOptions}
              keyExtractor={(item: { value: number | 'historico'; label: string }) =>
                item.value.toString()
              }
              renderItem={({
                item,
              }: {
                item: { value: number | 'historico'; label: string };
              }) => (
                <Button
                  mode={selectedYear === item.value ? 'contained' : 'text'}
                  onPress={() => handleSelectYear(item.value)}
                  style={styles(theme).yearOptionButton}
                  contentStyle={styles(theme).yearOptionContent}
                >
                  {item.label}
                </Button>
              )}
            />
          </View>
        </BottomSheet>
      </Portal>
    </View>
  );
}

const styles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F5F5F5',
    },
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    header: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    headerContent: {
      gap: 12,
    },
    matchCount: {
      color: '#FFFFFF',
      textAlign: 'center',
      opacity: 0.9,
    },
    yearButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      marginVertical: 8,
    },
    yearButtonContent: {
      paddingVertical: 4,
    },
    yearButtonLabel: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    bottomSheetContent: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    bottomSheetTitle: {
      textAlign: 'center',
      marginBottom: 16,
      fontWeight: 'bold',
    },
    yearOptionButton: {
      marginVertical: 4,
    },
    yearOptionContent: {
      paddingVertical: 8,
    },
    emptyState: {
      padding: 48,
      alignItems: 'center',
      gap: 16,
    },
    emptyText: {
      textAlign: 'center',
      color: '#666',
    },
    emptySubtext: {
      textAlign: 'center',
      color: '#999',
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 16,
    },
    loadingText: {
      color: '#666',
    },
    errorText: {
      textAlign: 'center',
      color: '#F44336',
    },
    errorSubtext: {
      textAlign: 'center',
      color: '#666',
    },
  });
