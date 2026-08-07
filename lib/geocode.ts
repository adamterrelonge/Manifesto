// UK postcode -> coordinates lookup via postcodes.io — free, no API key,
// matches this being a UK-only events site. Swap for a paid geocoder if
// international support is ever needed (see docs/PROJECT_PLAN.md Phase 5).

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

interface PostcodesIoResponse {
  status: number;
  result: {
    postcode: string;
    latitude: number;
    longitude: number;
    admin_district: string | null;
  } | null;
}

export async function lookupPostcode(postcode: string): Promise<GeocodeResult | null> {
  const trimmed = postcode.trim();
  if (!trimmed) return null;

  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(trimmed)}`);
  if (!res.ok) return null;

  const body = (await res.json()) as PostcodesIoResponse;
  if (body.status !== 200 || !body.result) return null;

  const { latitude, longitude, admin_district, postcode: normalised } = body.result;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;

  return {
    lat: latitude,
    lng: longitude,
    label: admin_district ? `${normalised} · ${admin_district}` : normalised,
  };
}
