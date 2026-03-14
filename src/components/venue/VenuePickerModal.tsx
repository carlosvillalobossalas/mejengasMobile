import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    StyleSheet,
    TextInput,
    ScrollView,
    TouchableOpacity,
    TouchableWithoutFeedback,
    ActivityIndicator,
    Switch,
    KeyboardAvoidingView,
    Platform,
    Modal,
    Dimensions,
} from 'react-native';
import { Text, Button, Divider, useTheme } from 'react-native-paper';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
import MapView, { type Region } from 'react-native-maps';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import type { MatchVenue } from '../../types/venue';
import {
    searchPlaces,
    getPlaceDetails,
    reverseGeocode,
    type PlacePrediction,
} from '../../services/places/placesService';
import {
    addFavoriteVenue,
} from '../../repositories/venues/favoriteVenuesRepository';
import { GOOGLE_MAPS_API_KEY } from '../../config/mapsConfig';

const DEFAULT_LAT = 9.9281;
const DEFAULT_LNG = -84.0907;

type Props = {
    visible: boolean;
    onDismiss: () => void;
    onConfirm: (venue: MatchVenue) => void;
    authUserId: string | null;
    initialVenue?: MatchVenue | null;
};

export function VenuePickerModal({
    visible,
    onDismiss,
    onConfirm,
    authUserId,
    initialVenue,
}: Props) {
    const theme = useTheme();
    const mapRef = useRef<MapView>(null);

    // ─── Map region ───────────────────────────────────────────────────────────
    const [region, setRegion] = useState<Region>({
        latitude: DEFAULT_LAT,
        longitude: DEFAULT_LNG,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    });
    // Track center separately to avoid stale closure issues in onRegionChangeComplete
    const centerRef = useRef({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });

    // ─── Search ───────────────────────────────────────────────────────────────
    const [query, setQuery] = useState('');
    const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showPredictions, setShowPredictions] = useState(false);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── Venue fields ─────────────────────────────────────────────────────────
    const [venueName, setVenueName] = useState('');
    const [venueAddress, setVenueAddress] = useState('');
    const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
    const [saveAsFavorite, setSaveAsFavorite] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // ─── Reset on open ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!visible) return;
        if (initialVenue) {
            const r: Region = {
                latitude: initialVenue.latitude,
                longitude: initialVenue.longitude,
                latitudeDelta: 0.003,
                longitudeDelta: 0.003,
            };
            setRegion(r);
            centerRef.current = { lat: initialVenue.latitude, lng: initialVenue.longitude };
            setVenueName(initialVenue.name);
            setVenueAddress(initialVenue.address);
        } else {
            setRegion({ latitude: DEFAULT_LAT, longitude: DEFAULT_LNG, latitudeDelta: 0.01, longitudeDelta: 0.01 });
            centerRef.current = { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
            setVenueName('');
            setVenueAddress('');
        }
        setQuery('');
        setPredictions([]);
        setShowPredictions(false);
        setSaveAsFavorite(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // ─── Debounced autocomplete ───────────────────────────────────────────────
    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        if (query.trim().length < 2) {
            setPredictions([]);
            setShowPredictions(false);
            return;
        }
        debounceTimer.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await searchPlaces(query, GOOGLE_MAPS_API_KEY);
                setPredictions(results);
                setShowPredictions(results.length > 0);
            } finally {
                setIsSearching(false);
            }
        }, 400);
        return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
    }, [query]);

    // ─── Select a prediction → animate map ───────────────────────────────────
    const handleSelectPrediction = async (prediction: PlacePrediction) => {
        setQuery(prediction.mainText);
        setShowPredictions(false);
        setPredictions([]);
        const details = await getPlaceDetails(prediction.placeId, GOOGLE_MAPS_API_KEY);
        if (!details) return;
        const newRegion: Region = {
            latitude: details.latitude,
            longitude: details.longitude,
            latitudeDelta: 0.003,
            longitudeDelta: 0.003,
        };
        centerRef.current = { lat: details.latitude, lng: details.longitude };
        setRegion(newRegion);
        setVenueName(details.name);
        setVenueAddress(details.formattedAddress);
        mapRef.current?.animateToRegion(newRegion, 500);
    };

    // ─── Map panned → reverse geocode center ─────────────────────────────────
    const handleRegionChangeComplete = useCallback(async (r: Region) => {
        centerRef.current = { lat: r.latitude, lng: r.longitude };
        setIsReverseGeocoding(true);
        try {
            const address = await reverseGeocode(r.latitude, r.longitude, GOOGLE_MAPS_API_KEY);
            setVenueAddress(address);
            // Auto-fill name with first segment only if name is still empty
            setVenueName(prev => prev || address.split(',')[0]?.trim() || '');
        } finally {
            setIsReverseGeocoding(false);
        }
    }, []);

    // ─── Confirm ──────────────────────────────────────────────────────────────
    const handleConfirm = async () => {
        if (!venueName.trim()) return;
        const venue: MatchVenue = {
            name: venueName.trim(),
            address: venueAddress.trim(),
            latitude: centerRef.current.lat,
            longitude: centerRef.current.lng,
            notes: null,
        };
        if (saveAsFavorite && authUserId) {
            setIsSaving(true);
            try { await addFavoriteVenue(authUserId, venue); } finally { setIsSaving(false); }
        }
        onConfirm(venue);
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onDismiss}
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <TouchableWithoutFeedback onPress={onDismiss}>
                    <View style={styles.backdrop} />
                </TouchableWithoutFeedback>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.kavContainer}
                >
                    <View style={[styles.sheet, { backgroundColor: '#FFFFFF' }]}>
                        {/* Handle */}
                        <View style={styles.handle} />

                        {/* Header */}
                        <View style={styles.header}>
                            <Text variant="titleMedium" style={styles.headerTitle}>
                                Seleccionar lugar
                            </Text>
                            <TouchableOpacity
                                onPress={onDismiss}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Icon name="close" size={22} color={theme.colors.onSurface} />
                            </TouchableOpacity>
                        </View>

                        <Divider />

                        {/* ── Map container — search bar overlaid at top ── */}
                        <View style={styles.mapContainer}>
                            <MapView
                                ref={mapRef}
                                style={StyleSheet.absoluteFill}
                                initialRegion={region}
                                onRegionChangeComplete={r => void handleRegionChangeComplete(r)}
                            />

                            {/* Fixed center pin */}
                            <View style={styles.pinContainer} pointerEvents="none">
                                <Icon name="map-marker" size={40} color={theme.colors.primary} />
                                {/* Small shadow dot under pin */}
                                <View style={styles.pinShadow} />
                            </View>

                            {/* Search bar floated over the map */}
                            <View style={styles.searchOverlay}>
                                <View style={[styles.searchBar, { backgroundColor: '#FFFFFF', borderColor: theme.colors.outline }]}>
                                    <Icon name="magnify" size={18} color={theme.colors.onSurfaceVariant} />
                                    <TextInput
                                        style={[styles.searchInput, { color: theme.colors.onSurface }]}
                                        placeholder="Buscar lugar..."
                                        placeholderTextColor={theme.colors.onSurfaceVariant}
                                        value={query}
                                        onChangeText={setQuery}
                                        returnKeyType="search"
                                        onFocus={() => { if (predictions.length > 0) setShowPredictions(true); }}
                                    />
                                    {isSearching
                                        ? <ActivityIndicator size="small" color={theme.colors.primary} />
                                        : query.length > 0 && (
                                            <TouchableOpacity onPress={() => { setQuery(''); setShowPredictions(false); }}>
                                                <Icon name="close-circle" size={16} color={theme.colors.onSurfaceVariant} />
                                            </TouchableOpacity>
                                        )
                                    }
                                </View>

                                {/* Predictions dropdown — absolutely positioned below search bar */}
                                {showPredictions && predictions.length > 0 && (
                                    <View style={[styles.predictionsCard, { backgroundColor: '#FFFFFF', borderColor: theme.colors.outlineVariant }]}>
                                        {predictions.map((item, index) => (
                                            <TouchableOpacity
                                                key={item.placeId}
                                                style={[
                                                    styles.predictionItem,
                                                    index < predictions.length - 1 && styles.predictionBorder,
                                                ]}
                                                onPress={() => void handleSelectPrediction(item)}
                                            >
                                                <Icon name="map-marker-outline" size={16} color={theme.colors.primary} style={styles.predictionIcon} />
                                                <View style={{ flex: 1 }}>
                                                    <Text variant="bodySmall" numberOfLines={1} style={{ fontWeight: '600' }}>
                                                        {item.mainText}
                                                    </Text>
                                                    <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                                                        {item.secondaryText}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>

                            {/* Reverse geocode loading indicator overlaid on map */}
                            {isReverseGeocoding && (
                                <View style={styles.geocodingBadge}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                </View>
                            )}
                        </View>

                        {/* ── Bottom fields ── */}
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={styles.fieldsContent}
                            style={styles.fieldsScroll}
                        >
                            {/* Address read-only display */}
                            <View style={[styles.addressRow, { borderColor: theme.colors.outlineVariant }]}>
                                <Icon name="map-marker-outline" size={16} color={theme.colors.primary} style={{ marginTop: 1 }} />
                                <Text
                                    variant="bodySmall"
                                    numberOfLines={2}
                                    style={[styles.addressText, { color: theme.colors.onSurfaceVariant }]}
                                >
                                    {venueAddress || 'Mueve el mapa para seleccionar un punto'}
                                </Text>
                            </View>

                            {/* Venue name */}
                            <Text
                                variant="labelSmall"
                                style={[styles.fieldLabel, { color: theme.colors.onSurfaceVariant }]}
                            >
                                Nombre del lugar
                            </Text>
                            <TextInput
                                style={[
                                    styles.fieldInput,
                                    { borderColor: theme.colors.outline, color: theme.colors.onSurface },
                                ]}
                                value={venueName}
                                onChangeText={setVenueName}
                                placeholder="Ej: Cancha La Pitaya"
                                placeholderTextColor={theme.colors.onSurfaceVariant}
                            />

                            {/* Save as favorite */}
                            {authUserId && (
                                <View style={styles.favoriteToggleRow}>
                                    <Text variant="bodySmall" style={{ flex: 1 }}>
                                        Guardar como favorita
                                    </Text>
                                    <Switch
                                        value={saveAsFavorite}
                                        onValueChange={setSaveAsFavorite}
                                        trackColor={{ false: '#D1D5DB', true: theme.colors.primary }}
                                        thumbColor="#FFFFFF"
                                        ios_backgroundColor="#D1D5DB"
                                    />
                                </View>
                            )}
                        </ScrollView>

                        <Button
                            mode="contained"
                            onPress={() => void handleConfirm()}
                            disabled={!venueName.trim() || isSaving}
                            loading={isSaving}
                            style={styles.confirmButton}
                            contentStyle={styles.confirmButtonContent}
                        >
                            Confirmar lugar
                        </Button>

                        <View style={{ height: Platform.OS === 'ios' ? 24 : 16 }} />
                    </View>
                </KeyboardAvoidingView>
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
    kavContainer: {
        justifyContent: 'flex-end',
    },
    sheet: {
        maxHeight: SCREEN_HEIGHT * 0.90,
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
        marginBottom: 6,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 8,
    },
    headerTitle: {
        flex: 1,
        fontWeight: '600',
    },
    // ─── Map ─────────────────────────────────────────────────────────────────
    mapContainer: {
        height: SCREEN_HEIGHT * 0.38,
        position: 'relative',
    },
    pinContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        // Pin icon is 40px. Visual tip is at the bottom of the icon.
        // Shift up by half the icon height so the tip points to the exact center.
        marginBottom: 40,
    },
    pinShadow: {
        width: 8,
        height: 4,
        borderRadius: 4,
        backgroundColor: 'rgba(0,0,0,0.25)',
        marginTop: -6,
    },
    searchOverlay: {
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        zIndex: 10,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: Platform.OS === 'ios' ? 9 : 7,
        gap: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        padding: 0,
    },
    predictionsCard: {
        marginTop: 4,
        borderRadius: 10,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
    predictionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 8,
    },
    predictionBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E7EB',
    },
    predictionIcon: {
        marginTop: 1,
    },
    geocodingBadge: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // ─── Bottom fields ────────────────────────────────────────────────────────
    fieldsScroll: {
        maxHeight: SCREEN_HEIGHT * 0.22,
    },
    fieldsContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 8,
        marginBottom: 12,
        backgroundColor: '#F9FAFB',
    },
    addressText: {
        flex: 1,
        lineHeight: 18,
    },
    fieldLabel: {
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        fontSize: 10,
    },
    fieldInput: {
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 14,
    },
    favoriteToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        marginBottom: 4,
    },
    confirmButton: {
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 8,
    },
    confirmButtonContent: {
        paddingVertical: 4,
    },
});

