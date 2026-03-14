import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { getGroupMembersV2ByGroupId } from '../repositories/groupMembersV2/groupMembersV2Repository';
import { getMatchById } from '../repositories/matches/matchesRepository';
import { getMatchByTeamsById } from '../repositories/matches/matchesByTeamsRepository';
import { getChallengeMatchById } from '../repositories/matches/matchesByChallengeRepository';
import {
  applyToPublicMatchListing,
  type PublicMatchApplication,
} from '../repositories/publicListings/publicMatchApplicationsRepository';
import type { MatchPosition } from '../types/matchPublication';
import type { MatchVenue } from '../types/venue';
import type { PublicMatchListing } from '../repositories/publicListings/publicMatchListingsRepository';
import VenueMapThumbnail from './venue/VenueMapThumbnail';
import { openVenueNavigation } from '../helpers/openVenueNavigation';

const LISTING_TYPE_LABEL: Record<PublicMatchListing['sourceMatchType'], string> = {
  matches: 'Partido interno',
  matchesByTeams: 'Partido por equipos',
  matchesByChallenge: 'Modo reto',
};

const POSITION_OPTIONS: MatchPosition[] = ['POR', 'DEF', 'MED', 'DEL'];
const POSITION_ORDER: Record<MatchPosition, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

type ListingLineupPlayer = {
  id: string;
  displayName: string;
  position: MatchPosition;
  isSub: boolean;
};

type ListingDetail = {
  team1Title: string;
  team1Lineup: ListingLineupPlayer[];
  team2Title: string | null;
  team2Lineup: ListingLineupPlayer[];
};

type Props = {
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  selectedListing: PublicMatchListing | null;
  authUserId: string | null;
  applicationStatus?: PublicMatchApplication['status'];
  getListingGroupName: (listing: PublicMatchListing) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backdropComponent: (props: any) => React.ReactElement;
  onFeedback?: (message: string) => void;
  onApplySuccess?: () => void;
};

const formatMatchDate = (dateIso: string) =>
  new Date(dateIso).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function PublicMatchListingBottomSheet({
  bottomSheetRef,
  selectedListing,
  authUserId,
  applicationStatus,
  getListingGroupName,
  backdropComponent,
  onFeedback,
  onApplySuccess,
}: Props) {
  const theme = useTheme();

  const [listingDetail, setListingDetail] = useState<ListingDetail | null>(null);
  const [isLoadingListingDetail, setIsLoadingListingDetail] = useState(false);
  const [listingDetailError, setListingDetailError] = useState<string | null>(null);
  const [isApplyFormVisible, setIsApplyFormVisible] = useState(false);
  const [applyNote, setApplyNote] = useState('');
  const [applyPositions, setApplyPositions] = useState<MatchPosition[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [optimisticStatusByListingId, setOptimisticStatusByListingId] = useState<
    Record<string, PublicMatchApplication['status']>
  >({});
  // Venue loaded from the match document (fallback for listings without venue field)
  const [venueFromLoad, setVenueFromLoad] = useState<MatchVenue | null>(null);

  // Derived: listing.venue is the primary source; match-loaded venue is the fallback
  const displayVenue: MatchVenue | null = selectedListing?.venue ?? venueFromLoad;

  const handleOpenNavigation = () => {
    if (!displayVenue) return;
    openVenueNavigation(displayVenue);
  };

  useEffect(() => {
    setIsApplyFormVisible(false);
    setApplyNote('');
    setApplyPositions([]);
    setVenueFromLoad(null);
  }, [selectedListing?.id]);

  useEffect(() => {
    if (!selectedListing) {
      setListingDetail(null);
      setListingDetailError(null);
      return;
    }

    let isMounted = true;

    const buildLineup = (
      players: Array<{ groupMemberId: string | null; position: MatchPosition; isSub?: boolean }>,
      namesByMemberId: Map<string, string>,
    ): ListingLineupPlayer[] =>
      players
        .filter(player => Boolean(player.groupMemberId))
        .map((player, index) => {
          const memberId = player.groupMemberId ?? '';
          return {
            id: `${memberId}_${index}`,
            displayName: namesByMemberId.get(memberId) ?? 'Jugador',
            position: player.position,
            isSub: Boolean(player.isSub ?? false),
          };
        })
        .sort((left, right) => {
          if (left.isSub !== right.isSub) return left.isSub ? 1 : -1;
          return POSITION_ORDER[left.position] - POSITION_ORDER[right.position];
        });

    const loadListingDetail = async () => {
      setIsLoadingListingDetail(true);
      setListingDetailError(null);
      try {
        const members = await getGroupMembersV2ByGroupId(selectedListing.groupId);
        const namesByMemberId = new Map(members.map(member => [member.id, member.displayName]));

        if (selectedListing.sourceMatchType === 'matches') {
          const match = await getMatchById(selectedListing.sourceMatchId);
          if (!match) throw new Error('No se encontró el partido publicado.');

          if (!isMounted) return;
          setVenueFromLoad(match.venue ?? null);
          setListingDetail({
            team1Title: 'Equipo 1',
            team1Lineup: buildLineup(match.players1, namesByMemberId),
            team2Title: 'Equipo 2',
            team2Lineup: buildLineup(match.players2, namesByMemberId),
          });
          return;
        }

        if (selectedListing.sourceMatchType === 'matchesByTeams') {
          const match = await getMatchByTeamsById(selectedListing.sourceMatchId);
          if (!match) throw new Error('No se encontró el partido publicado.');

          if (!isMounted) return;
          setVenueFromLoad(match.venue ?? null);
          setListingDetail({
            team1Title: 'Equipo 1',
            team1Lineup: buildLineup(match.players1, namesByMemberId),
            team2Title: 'Equipo 2',
            team2Lineup: buildLineup(match.players2, namesByMemberId),
          });
          return;
        }

        const challengeMatch = await getChallengeMatchById(selectedListing.sourceMatchId);
        if (!challengeMatch) throw new Error('No se encontró el partido publicado.');

        if (!isMounted) return;
        setVenueFromLoad(challengeMatch.venue ?? null);
        setListingDetail({
          team1Title: 'Equipo del grupo',
          team1Lineup: buildLineup(challengeMatch.players, namesByMemberId),
          team2Title: null,
          team2Lineup: [],
        });
      } catch (error) {
        if (!isMounted) return;
        setListingDetail(null);
        setListingDetailError(error instanceof Error ? error.message : 'No se pudo cargar el detalle.');
      } finally {
        if (isMounted) {
          setIsLoadingListingDetail(false);
        }
      }
    };

    void loadListingDetail();

    return () => {
      isMounted = false;
    };
  }, [selectedListing]);

  const toggleApplyPosition = (position: MatchPosition) => {
    setApplyPositions(current =>
      current.includes(position)
        ? current.filter(currentPosition => currentPosition !== position)
        : [...current, position],
    );
  };

  const handleApplyToListing = async () => {
    if (!selectedListing) return;
    setIsApplying(true);
    try {
      await applyToPublicMatchListing({
        listingId: selectedListing.id,
        note: applyNote.trim() ? applyNote.trim() : null,
        preferredPositions: applyPositions,
      });
      setIsApplyFormVisible(false);
      setApplyNote('');
      setApplyPositions([]);
      setOptimisticStatusByListingId(current => ({
        ...current,
        [selectedListing.id]: 'pending',
      }));
      onFeedback?.('Postulación enviada correctamente');
      onApplySuccess?.();
    } catch (error) {
      onFeedback?.(error instanceof Error ? error.message : 'No se pudo enviar la postulación');
    } finally {
      setIsApplying(false);
    }
  };

  const effectiveStatus = selectedListing
    ? (applicationStatus ?? optimisticStatusByListingId[selectedListing.id])
    : undefined;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['80%']}
      enablePanDownToClose
      backdropComponent={backdropComponent}
    >
      <BottomSheetScrollView contentContainerStyle={styles.listingSheetContent}>
        {!selectedListing ? null : (
          <>
            <Text variant="titleMedium" style={styles.listingSheetTitle}>
              {LISTING_TYPE_LABEL[selectedListing.sourceMatchType]}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatMatchDate(selectedListing.matchDate)} · {getListingGroupName(selectedListing)}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Cupos disponibles: {Math.max(0, selectedListing.neededPlayers - selectedListing.acceptedPlayers)}
            </Text>

            {/* Venue map — tappable to open navigation */}
            {displayVenue ? (
              <>
                <VenueMapThumbnail
                  venue={displayVenue}
                  height={160}
                  borderRadius={10}
                  onPress={handleOpenNavigation}
                />
                <TouchableOpacity style={styles.venueRow} activeOpacity={0.7} onPress={handleOpenNavigation}>
                  <Icon name="map-marker" size={18} color={theme.colors.secondary} />
                  <View style={styles.venueInfo}>
                    <Text variant="bodyMedium" style={[styles.venueName, { color: theme.colors.secondary }]}>
                      {displayVenue.name}
                    </Text>
                    {displayVenue.address ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {displayVenue.address}
                      </Text>
                    ) : null}
                    {displayVenue.notes ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic' }}>
                        {displayVenue.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Icon name="navigation-variant-outline" size={18} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
              </>
            ) : null}

            {isLoadingListingDetail ? (
              <View style={styles.listingLoadingWrap}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Cargando alineación...
                </Text>
              </View>
            ) : listingDetailError ? (
              <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                {listingDetailError}
              </Text>
            ) : listingDetail ? (
              <>
                <Card style={styles.listingCard}>
                  <Card.Content style={styles.listingCardContent}>
                    <Text variant="titleSmall">{listingDetail.team1Title}</Text>
                    {listingDetail.team1Lineup.length === 0 ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Sin jugadores registrados.
                      </Text>
                    ) : (
                      listingDetail.team1Lineup.map(player => (
                        <View key={player.id} style={styles.lineupRow}>
                          <Text variant="bodySmall" style={styles.positionBadge}>{player.position}</Text>
                          <Text variant="bodyMedium" style={styles.lineupName}>{player.displayName}</Text>
                          {player.isSub ? <Text variant="labelSmall">SUP</Text> : null}
                        </View>
                      ))
                    )}
                  </Card.Content>
                </Card>

                {listingDetail.team2Title ? (
                  <Card style={styles.listingCard}>
                    <Card.Content style={styles.listingCardContent}>
                      <Text variant="titleSmall">{listingDetail.team2Title}</Text>
                      {listingDetail.team2Lineup.length === 0 ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Sin jugadores registrados.
                        </Text>
                      ) : (
                        listingDetail.team2Lineup.map(player => (
                          <View key={player.id} style={styles.lineupRow}>
                            <Text variant="bodySmall" style={styles.positionBadge}>{player.position}</Text>
                            <Text variant="bodyMedium" style={styles.lineupName}>{player.displayName}</Text>
                            {player.isSub ? <Text variant="labelSmall">SUP</Text> : null}
                          </View>
                        ))
                      )}
                    </Card.Content>
                  </Card>
                ) : null}
              </>
            ) : null}

            {selectedListing.status === 'open' && authUserId && !effectiveStatus ? (
              !isApplyFormVisible ? (
                <Button
                  mode="contained"
                  buttonColor={theme.colors.secondary}
                  textColor={theme.colors.onSecondary}
                  onPress={() => setIsApplyFormVisible(true)}
                  style={styles.applyCta}
                >
                  Postularme
                </Button>
              ) : (
                <View style={styles.applyFormWrap}>
                  <TextInput
                    mode="outlined"
                    label="Mensaje (opcional)"
                    value={applyNote}
                    onChangeText={setApplyNote}
                    multiline
                    dense
                  />
                  <View style={styles.applyPositionsWrap}>
                    {POSITION_OPTIONS.map(position => {
                      const selected = applyPositions.includes(position);
                      return (
                        <TouchableOpacity
                          key={`${selectedListing.id}_apply_pos_${position}`}
                          style={[
                            styles.applyPositionChip,
                            {
                              backgroundColor: selected ? theme.colors.secondary : theme.colors.surface,
                            },
                          ]}
                          onPress={() => toggleApplyPosition(position)}
                        >
                          <Text style={{ color: selected ? theme.colors.onSecondary : theme.colors.onSurfaceVariant }}>
                            {position}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.applyActionsRow}>
                    <Button mode="text" onPress={() => setIsApplyFormVisible(false)} disabled={isApplying}>
                      Cancelar
                    </Button>
                    <Button
                      mode="contained"
                      buttonColor={theme.colors.secondary}
                      textColor={theme.colors.onSecondary}
                      onPress={() => {
                        void handleApplyToListing();
                      }}
                      loading={isApplying}
                      disabled={isApplying}
                    >
                      Enviar
                    </Button>
                  </View>
                </View>
              )
            ) : effectiveStatus ? (
              <Text
                variant="bodySmall"
                style={{
                  color:
                    effectiveStatus === 'accepted'
                      ? theme.colors.primary
                      : effectiveStatus === 'pending'
                        ? theme.colors.secondary
                        : theme.colors.error,
                }}
              >
                {effectiveStatus === 'accepted'
                  ? 'Tu postulación ya fue aceptada.'
                  : effectiveStatus === 'pending'
                    ? 'Tu postulación está pendiente.'
                    : 'Tu postulación fue rechazada.'}
              </Text>
            ) : (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Esta publicación no está disponible para postularse.
              </Text>
            )}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  listingSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  listingSheetTitle: {
    fontWeight: '700',
  },
  listingLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  listingCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  listingCardContent: {
    gap: 8,
  },
  lineupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionBadge: {
    minWidth: 34,
    fontWeight: '700',
  },
  lineupName: {
    flex: 1,
  },
  applyCta: {
    borderRadius: 10,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  venueInfo: {
    flex: 1,
    gap: 1,
  },
  venueName: {
    fontWeight: '700',
  },
  applyFormWrap: {
    gap: 8,
  },
  applyPositionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  applyPositionChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  applyActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
  },
});
