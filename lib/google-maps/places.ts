import { getConfig } from '@/lib/config';

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places';

const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.businessStatus',
  'places.googleMapsUri',
  'nextPageToken',
].join(',');

const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'types',
  'businessStatus',
  'googleMapsUri',
  'regularOpeningHours',
  'editorialSummary',
].join(',');

export interface PlaceLead {
  google_place_id: string;
  name: string;
  address: string;
  city: string;
  province: string;
  phone: string;
  website: string;
  google_rating: number | null;
  google_review_count: number | null;
  categories: string;
  google_maps_url: string;
  business_status: string;
}

interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface PlaceApiResult {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  businessStatus?: string;
  googleMapsUri?: string;
  regularOpeningHours?: unknown;
  editorialSummary?: { text: string };
}

function parseAddressComponent(
  components: AddressComponent[] | undefined,
  type: string
): string {
  if (!components) return '';
  const match = components.find((c) => c.types.includes(type));
  return match?.longText || '';
}

function mapPlaceToLead(place: PlaceApiResult): PlaceLead {
  const city =
    parseAddressComponent(place.addressComponents, 'locality') ||
    parseAddressComponent(place.addressComponents, 'sublocality');
  const province = parseAddressComponent(
    place.addressComponents,
    'administrative_area_level_1'
  );

  return {
    google_place_id: place.id,
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    city,
    province,
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
    website: place.websiteUri || '',
    google_rating: place.rating ?? null,
    google_review_count: place.userRatingCount ?? null,
    categories: JSON.stringify(place.types || []),
    google_maps_url: place.googleMapsUri || '',
    business_status: place.businessStatus || '',
  };
}

export interface SearchPlacesOptions {
  query: string;
  location: { latitude: number; longitude: number };
  radiusKm: number;
  maxResults?: number;
}

/**
 * Search for places using Google Maps Places API (New) Text Search.
 * Handles pagination automatically up to maxResults.
 */
export async function searchPlaces(
  options: SearchPlacesOptions
): Promise<PlaceLead[]> {
  const { query, location, radiusKm, maxResults = 60 } = options;
  const config = getConfig();

  if (!config.googleMapsApiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is not configured');
  }

  const results: PlaceLead[] = [];
  let pageToken: string | undefined;

  do {
    const requestBody: Record<string, unknown> = {
      textQuery: query,
      locationBias: {
        circle: {
          center: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          radius: radiusKm * 1000,
        },
      },
      maxResultCount: Math.min(20, maxResults - results.length),
    };

    if (pageToken) {
      requestBody.pageToken = pageToken;
    }

    const response = await fetch(`${PLACES_API_BASE}:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.googleMapsApiKey,
        'X-Goog-FieldMask': SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Places API searchText failed (${response.status}): ${errorBody}`
      );
    }

    const data = await response.json();
    const places: PlaceApiResult[] = data.places || [];

    for (const place of places) {
      if (results.length >= maxResults) break;
      results.push(mapPlaceToLead(place));
    }

    pageToken = data.nextPageToken;
  } while (pageToken && results.length < maxResults);

  return results;
}

/**
 * Get full details for a specific place by its Place ID.
 */
export async function getPlaceDetails(
  placeId: string
): Promise<PlaceLead & { editorial_summary: string }> {
  const config = getConfig();

  if (!config.googleMapsApiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is not configured');
  }

  const response = await fetch(`${PLACES_API_BASE}/${placeId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': config.googleMapsApiKey,
      'X-Goog-FieldMask': DETAILS_FIELD_MASK,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Places API details failed (${response.status}): ${errorBody}`
    );
  }

  const place: PlaceApiResult = await response.json();
  const lead = mapPlaceToLead(place);

  return {
    ...lead,
    editorial_summary: place.editorialSummary?.text || '',
  };
}
