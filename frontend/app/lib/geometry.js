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
