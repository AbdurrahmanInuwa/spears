// Great-circle distance between two {lat, lng} points, in meters (Haversine).
export function haversineMeters(p1, p2) {
  if (!p1 || !p2) return Infinity;
  const R = 6371000; // mean earth radius (m)
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Ray-casting point-in-polygon. Polygon is Array<{lat, lng}>.
export function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Minimum distance (meters) from a point to a polygon.
// 0 if the point lies inside the polygon; otherwise the closest-vertex distance.
// (Edge-projection would be more precise but vertex distance is plenty for
// a 36-sided coverage polygon.)
export function minDistanceToPolygonM(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length === 0) return Infinity;
  if (pointInPolygon(point, polygon)) return 0;
  let min = Infinity;
  for (const v of polygon) {
    const d = haversineMeters(point, v);
    if (d < min) min = d;
  }
  return min;
}

// Generate a regular polygon approximation of a circle (great-circle math).
// Returns an array of { lat, lng } vertices.
export function generateCirclePolygon(center, radiusMeters, sides = 36) {
  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
    return [];
  }
  const earthRadius = 6378137; // meters (WGS-84)
  const points = [];
  const lat1 = (center.lat * Math.PI) / 180;
  const lng1 = (center.lng * Math.PI) / 180;
  const dByR = radiusMeters / earthRadius;

  for (let i = 0; i < sides; i++) {
    const bearing = (i * (360 / sides) * Math.PI) / 180;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dByR) +
        Math.cos(lat1) * Math.sin(dByR) * Math.cos(bearing)
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(dByR) * Math.cos(lat1),
        Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2)
      );
    points.push({
      lat: (lat2 * 180) / Math.PI,
      lng: (lng2 * 180) / Math.PI,
    });
  }
  return points;
}
