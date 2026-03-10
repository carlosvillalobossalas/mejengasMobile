import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Portal,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';

import { useAppSelector } from '../app/hooks';
import type { AppDrawerParamList } from '../navigation/types';
import {
  subscribeOpenPublicListings,
  type PublicMatchListing,
} from '../repositories/publicListings/publicMatchListingsRepository';
import {
  subscribeApplicationsByApplicant,
  type PublicMatchApplication,
} from '../repositories/publicListings/publicMatchApplicationsRepository';
import { getGroupsByIds } from '../repositories/groups/groupsRepository';
import PublicMatchListingBottomSheet from '../components/PublicMatchListingBottomSheet';

const MATCH_TYPE_LABEL: Record<PublicMatchListing['sourceMatchType'], string> = {
  matches: 'Partido interno',
  matchesByTeams: 'Partido por equipos',
  matchesByChallenge: 'Modo reto',
};

export default function HomeExploreScreen() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<AppDrawerParamList>>();
  const firebaseUser = useAppSelector(state => state.auth.firebaseUser);
  const selectedGroupId = useAppSelector(state => state.groups.selectedGroupId);
  const authUserId = firebaseUser?.uid ?? null;

  const [isLoading, setIsLoading] = useState(true);
  const [listings, setListings] = useState<PublicMatchListing[]>([]);
  const [listingGroupNames, setListingGroupNames] = useState<Record<string, string>>({});
  const [myApplications, setMyApplications] = useState<PublicMatchApplication[]>([]);
  const [myApplicationsError, setMyApplicationsError] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<PublicMatchListing | null>(null);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const listingSheetRef = useRef<BottomSheet | null>(null);

  const myStatusByListingId = useMemo(() => {
    const index = new Map<string, PublicMatchApplication['status']>();
    myApplications.forEach(application => {
      if (!index.has(application.listingId) || application.status === 'pending') {
        index.set(application.listingId, application.status);
      }
    });
    return index;
  }, [myApplications]);

  const listingsInActiveGroup = useMemo(
    () => listings.filter(listing => selectedGroupId && listing.groupId === selectedGroupId),
    [listings, selectedGroupId],
  );

  const listingsOutsideActiveGroup = useMemo(
    () => listings.filter(listing => !selectedGroupId || listing.groupId !== selectedGroupId),
    [listings, selectedGroupId],
  );

  useEffect(() => {
    const unsubscribe = subscribeOpenPublicListings(
      rows => {
        setListings(rows);
        setListingsError(null);
        setIsLoading(false);
      },
      error => {
        setListingsError(error.message || 'No se pudieron cargar las publicaciones abiertas.');
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const userId = firebaseUser?.uid;
    if (!userId) {
      setMyApplications([]);
      setMyApplicationsError(null);
      return;
    }

    const unsubscribe = subscribeApplicationsByApplicant(
      userId,
      rows => {
        setMyApplications(rows);
        setMyApplicationsError(null);
      },
      error => {
        setMyApplications([]);
        setMyApplicationsError(error.message || 'No se pudieron cargar tus postulaciones.');
      },
    );

    return unsubscribe;
  }, [firebaseUser?.uid]);

  useEffect(() => {
    const loadGroupNames = async () => {
      const missingGroupIds = Array.from(
        new Set(
          listings
            .filter(listing => !listing.groupName)
            .map(listing => listing.groupId)
            .filter(Boolean),
        ),
      );

      if (missingGroupIds.length === 0) {
        const hydrated = listings.reduce<Record<string, string>>((acc, listing) => {
          if (listing.groupName) {
            acc[listing.groupId] = listing.groupName;
          }
          return acc;
        }, {});
        setListingGroupNames(hydrated);
        return;
      }

      try {
        const groupsMap = await getGroupsByIds(missingGroupIds);
        const hydrated = listings.reduce<Record<string, string>>((acc, listing) => {
          if (listing.groupName) {
            acc[listing.groupId] = listing.groupName;
            return acc;
          }

          const group = groupsMap.get(listing.groupId);
          if (group?.name) {
            acc[listing.groupId] = group.name;
          }
          return acc;
        }, {});
        setListingGroupNames(hydrated);
      } catch {
        const hydrated = listings.reduce<Record<string, string>>((acc, listing) => {
          if (listing.groupName) {
            acc[listing.groupId] = listing.groupName;
          }
          return acc;
        }, {});
        setListingGroupNames(hydrated);
      }
    };

    void loadGroupNames();
  }, [listings]);

  const renderBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  const formatDate = (value: string): string => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible';
    return parsed.toLocaleString('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getListingGroupName = (listing: PublicMatchListing): string =>
    listing.groupName ?? listingGroupNames[listing.groupId] ?? 'Grupo';

  const handleOpenListing = (listing: PublicMatchListing) => {
    setSelectedListing(listing);
    setTimeout(() => listingSheetRef.current?.expand(), 100);
  };

  const selectedListingStatus = selectedListing
    ? myStatusByListingId.get(selectedListing.id)
    : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="titleLarge" style={styles.title}>Explorar</Text>
      <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Encontrá partidos publicados por grupos y envía tu postulación.
      </Text>

      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}>
            <Icon name="clipboard-account-outline" size={20} color={theme.colors.primary} />
            <Text variant="titleMedium">Mis postulaciones</Text>
          </View>

          {myApplications.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {myApplicationsError ?? 'Aún no has enviado postulaciones.'}
            </Text>
          ) : (
            myApplications.slice(0, 8).map(application => (
              <View key={`my-application-${application.id}`} style={styles.applicationRow}>
                <Text variant="bodyMedium" style={styles.applicationTitle}>
                  {application.sourceMatchType === 'matchesByChallenge'
                    ? 'Modo reto'
                    : application.sourceMatchType === 'matchesByTeams'
                      ? 'Partido por equipos'
                      : 'Partido interno'}
                </Text>
                <Text
                  variant="labelSmall"
                  style={{
                    color:
                      application.status === 'accepted'
                        ? theme.colors.primary
                        : application.status === 'pending'
                          ? theme.colors.secondary
                          : theme.colors.error,
                  }}
                >
                  {application.status === 'accepted'
                    ? 'Aceptada'
                    : application.status === 'pending'
                      ? 'Pendiente'
                      : 'Rechazada'}
                </Text>
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Cargando publicaciones...
          </Text>
        </View>
      ) : listings.length === 0 ? (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.row}>
              <Icon name="soccer-field" size={22} color={theme.colors.primary} />
              <Text variant="titleMedium">No hay partidos abiertos</Text>
            </View>
            <Text style={[styles.helper, { color: theme.colors.onSurfaceVariant }]}>
              {listingsError ?? 'Vuelve más tarde o revisa otros grupos.'}
            </Text>
            <Button
              mode="contained"
              buttonColor={theme.colors.secondary}
              textColor={theme.colors.onSecondary}
              onPress={() => navigation.navigate('Groups')}
            >
              Ir a Grupos
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <>
          {selectedGroupId && (
            <>
              <Text variant="titleMedium" style={styles.sectionTitle}>Del grupo activo</Text>
              {listingsInActiveGroup.length === 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  No hay publicaciones abiertas del grupo activo.
                </Text>
              ) : (
                listingsInActiveGroup.map(listing => {
                  const myStatus = myStatusByListingId.get(listing.id);
                  return (
                    <TouchableOpacity key={`active-${listing.id}`} onPress={() => handleOpenListing(listing)} activeOpacity={0.9}>
                      <Card style={styles.card}>
                        <Card.Content style={styles.cardContent}>
                          <View style={styles.rowBetween}>
                            <View style={styles.row}>
                              <Icon name="soccer" size={20} color={theme.colors.primary} />
                              <Text variant="titleMedium">{MATCH_TYPE_LABEL[listing.sourceMatchType]}</Text>
                            </View>
                            <Text style={[styles.badge, { color: theme.colors.primary }]}>+{Math.max(0, listing.neededPlayers - listing.acceptedPlayers)}</Text>
                          </View>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {getListingGroupName(listing)}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {formatDate(listing.matchDate)} · {listing.city || 'Zona por confirmar'}
                          </Text>
                          {myStatus ? (
                            <Text variant="labelMedium" style={{ color: myStatus === 'accepted' ? theme.colors.primary : myStatus === 'pending' ? theme.colors.secondary : theme.colors.error }}>
                              {myStatus === 'accepted' ? 'Postulación aceptada' : myStatus === 'pending' ? 'Postulación pendiente' : 'Postulación rechazada'}
                            </Text>
                          ) : null}
                        </Card.Content>
                      </Card>
                    </TouchableOpacity>
                  );
                })
              )}

              <Text variant="titleMedium" style={styles.sectionTitle}>Fuera del grupo activo</Text>
            </>
          )}

          {listingsOutsideActiveGroup.map(listing => {
            const myStatus = myStatusByListingId.get(listing.id);
            return (
              <TouchableOpacity key={`outside-${listing.id}`} onPress={() => handleOpenListing(listing)} activeOpacity={0.9}>
                <Card style={styles.card}>
                  <Card.Content style={styles.cardContent}>
                    <View style={styles.rowBetween}>
                      <View style={styles.row}>
                        <Icon name="soccer" size={20} color={theme.colors.primary} />
                        <Text variant="titleMedium">{MATCH_TYPE_LABEL[listing.sourceMatchType]}</Text>
                      </View>
                      <Text style={[styles.badge, { color: theme.colors.primary }]}>+{Math.max(0, listing.neededPlayers - listing.acceptedPlayers)}</Text>
                    </View>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {getListingGroupName(listing)}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {formatDate(listing.matchDate)} · {listing.city || 'Zona por confirmar'}
                    </Text>
                    {myStatus ? (
                      <Text variant="labelMedium" style={{ color: myStatus === 'accepted' ? theme.colors.primary : myStatus === 'pending' ? theme.colors.secondary : theme.colors.error }}>
                        {myStatus === 'accepted' ? 'Postulación aceptada' : myStatus === 'pending' ? 'Postulación pendiente' : 'Postulación rechazada'}
                      </Text>
                    ) : null}
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      <Portal>
        <PublicMatchListingBottomSheet
          bottomSheetRef={listingSheetRef}
          selectedListing={selectedListing}
          authUserId={authUserId}
          applicationStatus={selectedListingStatus}
          getListingGroupName={getListingGroupName}
          backdropComponent={renderBackdrop}
          onFeedback={message => {
            setSnackbarMessage(message);
            setSnackbarVisible(true);
          }}
        />
      </Portal>

      <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={2500}>
        {snackbarMessage}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontWeight: '700' },
  subtitle: { marginBottom: 4 },
  card: { borderRadius: 14, backgroundColor: '#FFFFFF' },
  cardContent: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  helper: { marginBottom: 12 },
  sectionTitle: { fontWeight: '700', marginTop: 6 },
  badge: { fontWeight: '700' },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  applicationRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  applicationTitle: { fontWeight: '600' },
});
