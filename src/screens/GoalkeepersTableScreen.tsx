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
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';

import { useAppSelector } from '../app/hooks';
import {
    prepareGoalkeeperStatsFromMatches,
    type GoalkeeperStats,
} from '../endpoints/goalkeepers/goalkeepersStatsEndpoints';
import { getPlayerInitial, getPlayerDisplay } from '../helpers/players';

type SortColumn = 'name' | 'goalsConceded' | 'cleanSheets' | 'matches';
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
    const [sortBy, setSortBy] = useState<SortColumn>('cleanSheets');
    const [sortDirection, setSortDirection] = useState<SortDirection>('descending');
    const bottomSheetRef = useRef<BottomSheet>(null);

    // Load stats when component mounts or groupId changes
    useEffect(() => {
        const loadStats = async () => {
            if (!selectedGroupId) {
                return;
            }

            setIsLoading(true);
            try {
                const stats = await prepareGoalkeeperStatsFromMatches(selectedGroupId);
                setAllYearStats(stats);
            } catch (error) {
                console.error('Error loading goalkeeper stats:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadStats();
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
                    // Use helper to get display name for sorting
                    aValue = getPlayerDisplay({ name: a.name, originalName: a.originalName });
                    bValue = getPlayerDisplay({ name: b.name, originalName: b.originalName });
                    break;
                case 'goalsConceded':
                    aValue = a.goalsConceded;
                    bValue = b.goalsConceded;
                    break;
                case 'cleanSheets':
                    aValue = a.cleanSheets;
                    bValue = b.cleanSheets;
                    break;
                case 'matches':
                    aValue = a.matches;
                    bValue = b.matches;
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
            <View style={styles.centerContainer}>
                <Icon name="alert-circle" size={48} color={theme.colors.error} />
                <Text variant="titleMedium" style={styles.errorText}>
                    No hay grupo seleccionado
                </Text>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text variant="bodyLarge" style={styles.loadingText}>
                    Cargando estadísticas...
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <Surface style={styles.header} elevation={2}>
                <View style={styles.headerContent}>
                    <Text variant="bodySmall" style={styles.goalkeeperCount}>
                        Total: {currentYearGoalkeepers.length} porteros
                    </Text>
                    <Button
                        mode="contained"
                        onPress={handleOpenYearSelector}
                        icon={CalendarIcon}
                        style={styles.yearButton}
                        contentStyle={styles.yearButtonContent}
                        labelStyle={styles.yearButtonLabel}
                    >
                        {getYearLabel(selectedYear)}
                    </Button>
                </View>
            </Surface>

            <Divider />

            {/* Table */}
            <ScrollView style={styles.tableContainer}>
                <DataTable>
                    {/* Table Header */}
                    <DataTable.Header style={styles.tableHeader}>
                        <DataTable.Title
                            style={styles.rankColumn}
                            textStyle={styles.headerText}
                        >
                            #
                        </DataTable.Title>
                        <DataTable.Title
                            sortDirection={sortBy === 'name' ? sortDirection : undefined}
                            onPress={() => handleSort('name')}
                            style={styles.nameColumn}
                            textStyle={styles.headerText}
                        >
                            Portero
                        </DataTable.Title>
                        <DataTable.Title
                            numeric
                            sortDirection={sortBy === 'goalsConceded' ? sortDirection : undefined}
                            onPress={() => handleSort('goalsConceded')}
                            style={styles.statColumn}
                            textStyle={styles.headerText}
                        >
                            <Icon name="soccer" size={16} color="#FFFFFF" />
                        </DataTable.Title>
                        <DataTable.Title
                            numeric
                            sortDirection={sortBy === 'cleanSheets' ? sortDirection : undefined}
                            onPress={() => handleSort('cleanSheets')}
                            style={styles.statColumn}
                            textStyle={styles.headerText}
                        >
                            <Icon name="shield-check" size={16} color="#FFFFFF" />
                        </DataTable.Title>
                        <DataTable.Title
                            numeric
                            sortDirection={sortBy === 'matches' ? sortDirection : undefined}
                            onPress={() => handleSort('matches')}
                            style={styles.statColumn}
                            textStyle={styles.headerText}
                        >
                            <Icon name="stadium" size={16} color="#FFFFFF" />
                        </DataTable.Title>
                    </DataTable.Header>

                    {/* Table Rows */}
                    {sortedGoalkeepers.map((goalkeeper, index) => {
                        const displayName = getPlayerDisplay({
                            name: goalkeeper.name,
                            originalName: goalkeeper.originalName,
                        });
                        const initial = getPlayerInitial(displayName);

                        return (
                            <DataTable.Row
                                key={goalkeeper.id}
                                style={[
                                    styles.tableRow,
                                    index % 2 === 0 ? styles.evenRow : styles.oddRow,
                                ]}
                            >
                                <DataTable.Cell style={styles.rankColumn}>
                                    <Text
                                        variant="bodyMedium"
                                        style={[
                                            styles.rankText,
                                            index < 3 && styles.topThreeRank,
                                        ]}
                                    >
                                        {index + 1}
                                    </Text>
                                </DataTable.Cell>

                                <DataTable.Cell style={styles.nameColumn}>
                                    <View style={styles.goalkeeperInfo}>
                                        {goalkeeper.photoURL ? (
                                            <Avatar.Image
                                                size={32}
                                                source={{ uri: goalkeeper.photoURL }}
                                            />
                                        ) : (
                                            <Avatar.Text
                                                size={32}
                                                label={initial}
                                            />
                                        )}
                                        <Text
                                            variant="bodyMedium"
                                            style={styles.goalkeeperName}
                                            numberOfLines={1}
                                        >
                                            {displayName}
                                        </Text>
                                    </View>
                                </DataTable.Cell>

                                <DataTable.Cell numeric style={styles.statColumn}>
                                    <Text variant="bodyMedium" style={styles.goalsConcededText}>
                                        {goalkeeper.goalsConceded}
                                    </Text>
                                </DataTable.Cell>

                                <DataTable.Cell numeric style={styles.statColumn}>
                                    <Text variant="bodyMedium" style={styles.cleanSheetsText}>
                                        {goalkeeper.cleanSheets}
                                    </Text>
                                </DataTable.Cell>

                                <DataTable.Cell numeric style={styles.statColumn}>
                                    <Text variant="bodyMedium">{goalkeeper.matches}</Text>
                                </DataTable.Cell>
                            </DataTable.Row>
                        );
                    })}

                    {sortedGoalkeepers.length === 0 && (
                        <View style={styles.emptyState}>
                            <Icon
                                name="hand-back-right-off"
                                size={64}
                                color={theme.colors.onSurfaceDisabled}
                            />
                            <Text
                                variant="titleMedium"
                                style={[
                                    styles.emptyText,
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
                    <View style={styles.bottomSheetContent}>
                        <Text variant="titleMedium" style={styles.bottomSheetTitle}>
                            Seleccionar Temporada
                        </Text>
                        <BottomSheetFlatList
                            data={yearOptions}
                            keyExtractor={(item: { value: string; label: string }) => item.value}
                            renderItem={({ item }: { item: { value: string; label: string } }) => (
                                <Button
                                    mode={selectedYear === item.value ? 'contained' : 'text'}
                                    onPress={() => handleSelectYear(item.value)}
                                    style={styles.yearOptionButton}
                                    contentStyle={styles.yearOptionContent}
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

const styles = StyleSheet.create({
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
        backgroundColor: '#FF9800',
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
        backgroundColor: '#F57C00',
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
        color: '#FF9800',
    },
    goalkeeperInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    goalkeeperName: {
        flex: 1,
    },
    goalsConcededText: {
        color: '#F44336',
        fontWeight: 'bold',
    },
    cleanSheetsText: {
        color: '#4CAF50',
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
