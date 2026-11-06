// Distance and rough travel-time estimates for the police portal.

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Rough road estimate: straight-line distance × 1.3 for winding roads, at an average
 * 25 km/h for city traffic. Shown as an estimate — Google Maps gives the real route time.
 */
export function etaMinutes(km: number) {
  return Math.max(1, Math.round(((km * 1.3) / 25) * 60));
}

export const formatKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

/** OpenStreetMap embed (no API key) centred on the point with a marker. */
export function osmEmbed(lat: number, lng: number, spanKm = 0.6) {
  const d = spanKm / 111;
  const bbox = [lng - d, lat - d, lng + d, lat + d].map((n) => n.toFixed(5)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}
