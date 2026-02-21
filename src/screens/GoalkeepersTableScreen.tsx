import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
    ScrollView,
    StyleSheet,
    View,
    ActivityIndicator,
} from 'react-native';
import {
    Text,
    DataTable,
    useTheme,
    Avatar,
    Divider,
    Surface,
    Button,
    Portal,
    MD3Theme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';

import { useAppSelector } from '../app/hooks';
import {
    subscribeToGoalkeeperStats,
    type GoalkeeperStats,
} from '../endpoints/goalkeepers/goalkeepersStatsEndpoints';

type SortColumn = 'name' | 'goalsReceived' | 'cleanSheets' | 'matches' | 'mvp';
type SortDirection = 'ascending' | 'descending';

// Icon component for year button
const CalendarIcon = () => <Icon name="calendar-month" size={20} color="#FFFFFF" />;

export default function GoalkeepersTableScreen() {
    const theme = useTheme();
    const { selectedGroupId } = useAppSelector(state => state.groups);

    const [selectedYear, setSelectedYear] = useState<string>(
        new Date().getFullYear().toString(),
    );
    const [allYearStats, setAllYearStats] = useState<
        Record<string, GoalkeeperStats[]>
    >({ historico: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [sortBy, setSortBy] = useState<SortColumn>('mvp');
    const [sortDirection, setSortDirection] = useState<SortDirection>('descending');
    const bottomSheetRef = useRef<BottomSheet>(null);

    // Subscribe to real-time updates
    useEffect(() => {
        if (!selectedGroupId) {
            return;
        }

        setIsLoading(true);

        const unsubscribe = subscribeToGoalkeeperStats(selectedGroupId, stats => {
            setAllYearStats(stats);
            setIsLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, [selectedGroupId]);

    const handleSort = (column: SortColumn) => {
        if (sortBy === column) {
            setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
        } else {
            setSortBy(column);
            setSortDirection('descending');
        }
    };

    const handleOpenYearSelector = useCallback(() => {
        bottomSheetRef.current?.expand();
    }, []);

    const handleSelectYear = useCallback((year: string) => {
        setSelectedYear(year);
        bottomSheetRef.current?.close();
    }, []);

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
            />
        ),
        [],
    );

    const currentYearGoalkeepers = useMemo(
        () => allYearStats[selectedYear] || [],
        [allYearStats, selectedYear],
    );

    const sortedGoalkeepers = useMemo(() => {
        return [...currentYearGoalkeepers].sort((a, b) => {
            let aValue: number | string = 0;
            let bValue: number | string = 0;

            switch (sortBy) {
                case 'name':
                    aValue = a.name ?? '';
                    bValue = b.name ?? '';
                    break;
                case 'goalsReceived':
                    aValue = a.goalsReceived;
                    bValue = b.goalsReceived;
                    break;
                case 'cleanSheets':
                    aValue = a.cleanSheets;
                    bValue = b.cleanSheets;
                    break;
                case 'matches':
                    aValue = a.matches;
                    bValue = b.matches;
                    break;
                case 'mvp':
                    aValue = a.mvp;
                    bValue = b.mvp;
                    break;
            }

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortDirection === 'ascending'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            return sortDirection === 'ascending'
                ? (aValue as number) - (bValue as number)
                : (bValue as number) - (aValue as number);
        });
    }, [currentYearGoalkeepers, sortBy, sortDirection]);

    const yearOptions = useMemo(() => {
        const years = Object.keys(allYearStats)
            .filter(y => y !== 'historico')
            .sort((a, b) => Number(b) - Number(a));
        return [
            { value: 'historico', label: 'Histórico' },
            ...years.map(year => ({ value: year, label: year })),
        ];
    }, [allYearStats]);

    const getYearLabel = (year: string) => {
        const option = yearOptions.find(opt => opt.value === year);
        return option?.label || year;
    };

    if (!selectedGroupId) {
        return (
            <View style={styles(theme).centerContainer}>
                <Icon name="alert-circle" size={48} color={theme.colors.error} />
                <Text variant="titleMedium" style={styles(theme).errorText}>
                    No hay grupo seleccionado
                </Text>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles(theme).centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.secondary} />
                <Text variant="bodyLarge" style={styles(theme).loadingText}>
                    Cargando estadísticas...
                </Text>
            </View>
        );
    }

    return (
        <View style={styles(theme).container}>
            {/* Header */}
            <Surface style={styles(theme).header} elevation={2}>
                <View style={styles(theme).headerContent}>
                    <Text variant="bodySmall" style={styles(theme).goalkeeperCount}>
                        Total: {currentYearGoalkeepers.length} porteros
                    </Text>
                    <Button
                        mode="contained"
                        onPress={handleOpenYearSelector}
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

            {/* Table */}
            <ScrollView style={styles(theme).tableContainer}>
                <DataTable>
                    {/* Table Header */}
                    <DataTable.Header style={styles(theme).tableHeader}>
                        <DataTable.Title
                            style={styles(theme).rankColumn}
                            textStyle={styles(theme).headerText}
                        >
                            #
                        </DataTable.Title>
                        <DataTable.Title
                            sortDirection={sortBy === 'name' ? sortDirection : undefined}
                            onPress={() => handleSort('name')}
                            style={styles(theme).nameColumn}
                            textStyle={styles(theme).headerText}
                        >
                            Portero
                        </DataTable.Title>
                        <DataTable.Title
                            numeric
                            sortDirection={sortBy === 'mvp' ? sortDirection : undefined}
                            onPress={() => handleSort('mvp')}
                            style={styles(theme).statColumn}
                            textStyle={styles(theme).headerText}
                        >
                            <Icon name="star" size={16} color="#FFFFFF" />
                        </DataTable.Title>
                        <DataTable.Title
                            numeric
                            sortDirection={sortBy === 'cleanSheets' ? sortDirection : undefined}
                            onPress={() => handleSort('cleanSheets')}
                            style={styles(theme).statColumn}
                            textStyle={styles(theme).headerText}
                        >
                            <Icon name="shield-check" size={16} color="#FFFFFF" />
                        </DataTable.Title>
                        <DataTable.Title
                            numeric
                            sortDirection={sortBy === 'goalsReceived' ? sortDirection : undefined}
                            onPress={() => handleSort('goalsReceived')}
                            style={styles(theme).statColumn}
                            textStyle={styles(theme).headerText}
                        >
                            <Icon name="soccer" size={16} color="#FFFFFF" />
                        </DataTable.Title>
                        <DataTable.Title
                            numeric
                            sortDirection={sortBy === 'matches' ? sortDirection : undefined}
                            onPress={() => handleSort('matches')}
                            style={styles(theme).statColumn}
                            textStyle={styles(theme).headerText}
                        >
                            <Icon name="stadium" size={16} color="#FFFFFF" />
                        </DataTable.Title>
                    </DataTable.Header>

                    {/* Table Rows */}
                    {sortedGoalkeepers.map((goalkeeper, index) => {
                        const displayName = goalkeeper.name ?? 'Desconocido';
                        const initial = displayName[0]?.toUpperCase() ?? '?';

                        return (
                            <DataTable.Row
                                key={goalkeeper.id}
                                style={[
                                    styles(theme).tableRow,
                                    index % 2 === 0 ? styles(theme).evenRow : styles(theme).oddRow,
                                ]}
                            >
                                <DataTable.Cell style={styles(theme).rankColumn}>
                                    <Text
                                        variant="bodyMedium"
                                        style={[
                                            styles(theme).rankText,
                                            index < 3 && styles(theme).topThreeRank,
                                        ]}
                                    >
                                        {index + 1}
                                    </Text>
                                </DataTable.Cell>

                                <DataTable.Cell style={styles(theme).nameColumn}>
                                    <View style={styles(theme).goalkeeperInfo}>
                                        {goalkeeper.photoURL ? (
                                            <Avatar.Image
                                                size={32}
                                                source={{ uri: goalkeeper.photoURL }}
                                            />
                                        ) : (
                                            <Avatar.Text
                                                size={32}
                                                label={initial}
                                                style={{ backgroundColor: theme.colors.secondary }}

                                            />
                                        )}
                                        <Text
                                            variant="bodyMedium"
                                            style={styles(theme).goalkeeperName}
                                            numberOfLines={1}
                                        >
                                            {displayName}
                                        </Text>
                                    </View>
                                </DataTable.Cell>
                                <DataTable.Cell numeric style={styles(theme).statColumn}>
                                    <Text variant="bodyMedium" style={styles(theme).cleanSheetsText}>
                                        {goalkeeper.mvp}
                                    </Text>
                                </DataTable.Cell>
                                <DataTable.Cell numeric style={styles(theme).statColumn}>
                                    <Text variant="bodyMedium" style={styles(theme).cleanSheetsText}>
                                        {goalkeeper.cleanSheets}
                                    </Text>
                                </DataTable.Cell>
                                <DataTable.Cell numeric style={styles(theme).statColumn}>
                                    <Text variant="bodyMedium" style={styles(theme).goalsReceivedText}>
                                        {goalkeeper.goalsReceived}
                                    </Text>
                                </DataTable.Cell>


                                <DataTable.Cell numeric style={styles(theme).statColumn}>
                                    <Text variant="bodyMedium" style={styles(theme).cleanSheetsText} >{goalkeeper.matches}</Text>
                                </DataTable.Cell>
                            </DataTable.Row>
                        );
                    })}

                    {sortedGoalkeepers.length === 0 && (
                        <View style={styles(theme).emptyState}>
                            <Icon
                                name="hand-back-right-off"
                                size={64}
                                color={theme.colors.onSurfaceDisabled}
                            />
                            <Text
                                variant="titleMedium"
                                style={[
                                    styles(theme).emptyText,
                                    { color: theme.colors.onSurfaceDisabled },
                                ]}
                            >
                                No hay porteros en esta temporada
                            </Text>
                        </View>
                    )}
                </DataTable>
            </ScrollView>

            {/* Year Selection Bottom Sheet */}
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
                            keyExtractor={(item: { value: string; label: string }) => item.value}
                            renderItem={({ item }: { item: { value: string; label: string } }) => (
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

const styles = (theme: MD3Theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        gap: 16,
    },
    errorText: {
        marginTop: 16,
        textAlign: 'center',
    },
    loadingText: {
        marginTop: 16,
    },
    header: {
        backgroundColor: theme.colors.secondary,
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    headerContent: {
        gap: 12,
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
    goalkeeperCount: {
        color: '#FFFFFF',
        textAlign: 'center',
        opacity: 0.9,
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
    tableContainer: {
        flex: 1,
    },
    tableHeader: {
        backgroundColor: theme.colors.secondary,
    },
    headerText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 12,
    },
    tableRow: {
        minHeight: 56,
    },
    evenRow: {
        backgroundColor: '#FAFAFA',
    },
    oddRow: {
        backgroundColor: '#FFFFFF',
    },
    rankColumn: {
        flex: 0.5,
        justifyContent: 'center',
    },
    nameColumn: {
        flex: 2,
    },
    statColumn: {
        flex: 0.8,
        justifyContent: 'center',
    },
    rankText: {
        fontWeight: 'bold',
    },
    topThreeRank: {
        color: theme.colors.secondary,
    },
    goalkeeperInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    goalkeeperName: {
        flex: 1,
    },
    goalsReceivedText: {
        fontWeight: 'bold',
    },
    cleanSheetsText: {
        fontWeight: 'bold',
    },
    emptyState: {
        padding: 48,
        alignItems: 'center',
        gap: 16,
    },
    emptyText: {
        textAlign: 'center',
    },
});
