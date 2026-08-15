// Plain haversine distance — no PostGIS extension is enabled on this
// project's Supabase instance (checked: no `create extension postgis` in
// any migration), and this is the first place in the codebase that needs a
// distance calculation at all (the map view plots every located event with
// no radius filtering). Good enough for the notification-matching use case,
// which only ever compares a handful of users' home points against a page
// of candidate events, not a spatial index over the whole table.
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
