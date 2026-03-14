import { ActionSheetIOS, Linking, Platform } from 'react-native';

import type { MatchVenue } from '../types/venue';

/**
 * Opens a navigation app (Google Maps / Waze / Apple Maps) pointing to the
 * given venue coordinates. On iOS an ActionSheet lets the user pick the app.
 * On Android it falls back directly to Google Maps.
 */
export function openVenueNavigation(venue: MatchVenue): void {
  const { latitude, longitude, name } = venue;
  const encodedName = encodeURIComponent(name);
  const googleUrl = `https://maps.google.com/?daddr=${latitude},${longitude}&dname=${encodedName}`;
  const wazeUrl = `waze://?ll=${latitude},${longitude}&navigate=yes`;
  const appleMapsUrl = `maps://app?daddr=${latitude},${longitude}`;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Google Maps', 'Waze', 'Apple Maps', 'Cancelar'],
        cancelButtonIndex: 3,
        title: 'Abrir con',
      },
      buttonIndex => {
        if (buttonIndex === 0) void Linking.openURL(googleUrl);
        if (buttonIndex === 1) void Linking.openURL(wazeUrl);
        if (buttonIndex === 2) void Linking.openURL(appleMapsUrl);
      },
    );
  } else {
    void Linking.openURL(googleUrl);
  }
}
