/**
 * Thin wrappers around the Google Maps Platform REST APIs.
 * Used for place autocomplete, place details, and reverse geocoding.
 *
 * The API key is restricted to iOS apps. We must include the bundle identifier
 * header so Google accepts the request when key restrictions are active.
 */

import { Platform } from 'react-native';

const AUTOCOMPLETE_URL =
  'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';
const GEOCODE_URL =
  'https://maps.googleapis.com/maps/api/geocode/json';

// Must match the bundle ID registered in Google Cloud Console key restrictions.
const IOS_BUNDLE_ID = 'com.carlosvillalobos.mejengasMobile';
const ANDROID_PACKAGE = 'com.carlosvillalobos.mejengasMobile';

/**
 * Headers required for Google API keys restricted to mobile apps.
 * Without these, requests made via fetch() are rejected with REQUEST_DENIED.
 */
function getAuthHeaders(): Record<string, string> {
  if (Platform.OS === 'ios') {
    return { 'X-Ios-Bundle-Identifier': IOS_BUNDLE_ID };
  }
  if (Platform.OS === 'android') {
    return { 'X-Android-Package': ANDROID_PACKAGE };
  }
  return {};
}

export type PlacePrediction = {
  placeId: string;
  /** Full description e.g. "Estadio Nacional, San José, Costa Rica" */
  description: string;
  /** Primary text e.g. "Estadio Nacional" */
  mainText: string;
  /** Secondary text e.g. "San José, Costa Rica" */
  secondaryText: string;
};

export type PlaceDetails = {
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

/**
 * Autocomplete: returns up to 5 place predictions for a partial text input.
 */
export async function searchPlaces(
  query: string,
  apiKey: string,
): Promise<PlacePrediction[]> {
  if (!query.trim() || query.trim().length < 2) return [];

  const params = new URLSearchParams({
    input: query.trim(),
    key: apiKey,
    language: 'es',
    types: 'geocode',
    components: 'country:cr',
  });

  const url = `${AUTOCOMPLETE_URL}?${params.toString()}`;
  console.log('[Places] searchPlaces →', url.replace(apiKey, 'KEY_HIDDEN'));

  try {
    const res = await fetch(url, { headers: getAuthHeaders() });
    console.log('[Places] searchPlaces HTTP status:', res.status);

    const json = (await res.json()) as {
      status: string;
      error_message?: string;
      predictions?: Array<{
        place_id: string;
        description: string;
        structured_formatting?: {
          main_text?: string;
          secondary_text?: string;
        };
      }>;
    };

    console.log('[Places] searchPlaces API status:', json.status, json.error_message ?? '');

    if (json.status !== 'OK' || !Array.isArray(json.predictions)) return [];

    return json.predictions.slice(0, 5).map(p => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description,
      secondaryText: p.structured_formatting?.secondary_text ?? '',
    }));
  } catch (e) {
    console.error('[Places] searchPlaces error:', e);
    return [];
  }
}

/**
 * Place Details: returns name, formatted address, and coordinates for a place ID.
 */
export async function getPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails | null> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'name,formatted_address,geometry',
    key: apiKey,
    language: 'es',
  });

  const url = `${DETAILS_URL}?${params.toString()}`;
  console.log('[Places] getPlaceDetails →', placeId);

  try {
    const res = await fetch(url, { headers: getAuthHeaders() });
    console.log('[Places] getPlaceDetails HTTP status:', res.status);

    const json = (await res.json()) as {
      status: string;
      error_message?: string;
      result?: {
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      };
    };

    console.log('[Places] getPlaceDetails API status:', json.status, json.error_message ?? '');

    if (json.status !== 'OK' || !json.result) return null;

    const { name, formatted_address: formattedAddress, geometry } = json.result;
    const lat = geometry?.location?.lat;
    const lng = geometry?.location?.lng;

    if (!lat || !lng) return null;

    return {
      name: name ?? formattedAddress ?? '',
      formattedAddress: formattedAddress ?? name ?? '',
      latitude: lat,
      longitude: lng,
    };
  } catch (e) {
    console.error('[Places] getPlaceDetails error:', e);
    return null;
  }
}

/**
 * Reverse geocoding: returns a human-readable address for a lat/lng pair.
 * Used when the user pans the map to a custom location.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  apiKey: string,
): Promise<string> {
  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    key: apiKey,
    language: 'es',
  });

  const url = `${GEOCODE_URL}?${params.toString()}`;
  console.log('[Places] reverseGeocode →', latitude.toFixed(5), longitude.toFixed(5));

  try {
    const res = await fetch(url, { headers: getAuthHeaders() });
    console.log('[Places] reverseGeocode HTTP status:', res.status);

    const json = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{ formatted_address?: string }>;
    };

    console.log('[Places] reverseGeocode API status:', json.status, json.error_message ?? '');

    if (json.status !== 'OK' || !json.results?.length) {
      return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }

    return json.results[0].formatted_address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  } catch (e) {
    console.error('[Places] reverseGeocode error:', e);
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
}
