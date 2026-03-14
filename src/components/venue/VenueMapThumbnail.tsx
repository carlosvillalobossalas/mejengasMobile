import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import type { MatchVenue } from '../../types/venue';

type Props = {
  venue: MatchVenue;
  height?: number;
  borderRadius?: number;
  /** When provided, the thumbnail becomes tappable and fires this callback. */
  onPress?: () => void;
};

const DELTA = 0.009;

export default function VenueMapThumbnail({ venue, height = 130, borderRadius = 10, onPress }: Props) {
  const region: Region = {
    latitude: venue.latitude,
    longitude: venue.longitude,
    latitudeDelta: DELTA,
    longitudeDelta: DELTA,
  };

  const mapContent = (
    <View style={[styles.container, { height, borderRadius }]} pointerEvents={onPress ? 'box-none' : 'none'}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        region={region}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        // liteMode renders a static bitmap on Android (no interactions)
        liteMode
        mapPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <Marker
          coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
          tracksViewChanges={false}
        />
      </MapView>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ borderRadius }}>
        {mapContent}
      </TouchableOpacity>
    );
  }

  return mapContent;
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#E5E5E5',
  },
});
