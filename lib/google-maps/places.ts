import { getConfig } from "@/lib/config";

const PLACES_API_BASE = "https://places.googleapis.com/v1/places";
const GEOCODE_FIELD_MASK = [
  "places.formattedAddress",
  "places.location",
].join(",");

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.businessStatus",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "types",
  "primaryType",
  "businessStatus",
  "googleMapsUri",
  "regularOpeningHours",
  "editorialSummary",
].join(",");

export interface SearchLocation {
  latitude: number;
  longitude: number;
}

export interface GeocodedLocation {
  formattedAddress: string;
  location: SearchLocation;
}

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
  primary_type: string;
  editorial_summary: string;
  opening_hours: string;
  latitude: number | null;
  longitude: number | null;
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlaceLocation {
  latitude: number;
  longitude: number;
}

interface PlaceApiResult {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: PlaceLocation;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
  businessStatus?: string;
  googleMapsUri?: string;
  regularOpeningHours?: unknown;
  editorialSummary?: { text: string };
}

function parseAddressComponent(
  components: AddressComponent[] | undefined,
  type: string
): string {
  if (!components) return "";
  const match = components.find((component) =>
    Array.isArray(component.types) ? component.types.includes(type) : false
  );
  return match?.longText || "";
}

function mapPlaceToLead(place: PlaceApiResult): PlaceLead {
  const city =
    parseAddressComponent(place.addressComponents, "locality") ||
    parseAddressComponent(place.addressComponents, "sublocality");
  const province = parseAddressComponent(
    place.addressComponents,
    "administrative_area_level_1"
  );

  return {
    google_place_id: place.id,
    name: place.displayName?.text || "",
    address: place.formattedAddress || "",
    city,
    province,
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || "",
    website: place.websiteUri || "",
    google_rating: place.rating ?? null,
    google_review_count: place.userRatingCount ?? null,
    categories: JSON.stringify(place.types || []),
    google_maps_url: place.googleMapsUri || "",
    business_status: place.businessStatus || "",
    primary_type: place.primaryType || "",
    editorial_summary: place.editorialSummary?.text || "",
    opening_hours: place.regularOpeningHours
      ? JSON.stringify(place.regularOpeningHours)
      : "",
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
  };
}

export interface SearchPlacesOptions {
  query: string;
  location: SearchLocation;
  radiusKm: number;
  maxResults?: number;
}

export async function geocodePlace(query: string): Promise<GeocodedLocation> {
  const config = getConfig();

  if (!config.googleMapsApiKey) {
    throw new Error("Google Maps API key is not configured in settings");
  }

  const response = await fetch(`${PLACES_API_BASE}:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.googleMapsApiKey,
      "X-Goog-FieldMask": GEOCODE_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Unable to resolve town "${query}" via Places API (${response.status}): ${errorBody}`
    );
  }

  const data = (await response.json()) as {
    places?: PlaceApiResult[];
  };
  const result = data.places?.[0];
  const lat = result?.location?.latitude;
  const lng = result?.location?.longitude;

  if (!result || typeof lat !== "number" || typeof lng !== "number") {
    throw new Error(`Unable to resolve town "${query}".`);
  }

  return {
    formattedAddress: result.formattedAddress || query,
    location: {
      latitude: lat,
      longitude: lng,
    },
  };
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
    throw new Error("Google Maps API key is not configured in settings");
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
          radius: Math.max(1, radiusKm) * 1000,
        },
      },
      pageSize: Math.max(1, Math.min(20, maxResults - results.length)),
    };

    if (pageToken) {
      requestBody.pageToken = pageToken;
    }

    const response = await fetch(`${PLACES_API_BASE}:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.googleMapsApiKey,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
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
export async function getPlaceDetails(placeId: string): Promise<PlaceLead> {
  const config = getConfig();

  if (!config.googleMapsApiKey) {
    throw new Error("Google Maps API key is not configured in settings");
  }

  const response = await fetch(`${PLACES_API_BASE}/${placeId}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": config.googleMapsApiKey,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Places API details failed (${response.status}): ${errorBody}`
    );
  }

  const place = (await response.json()) as PlaceApiResult;
  return mapPlaceToLead(place);
}
