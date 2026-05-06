// Custom SVG map pins. Inline data URI — no extra HTTP request, crisp at
// any zoom level.

export const TYPE_COLOR = {
  Shooting: '#7c3aed',  // violet
  Medical: '#dc2626',   // brand red
  Assault: '#f97316',   // orange
  Fire: '#ea580c',      // deep orange
  Flooding: '#0ea5e9',  // sky blue
};

// Generic semantic colors for non-emergency-type pins
export const SEMANTIC_COLOR = {
  responder: '#10b981', // emerald — institution / on standby / safe
  victim: '#dc2626',    // brand red
  self: '#3b82f6',      // blue — "you"
};

export function svgPin(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
    <path d="M16 1C7.7 1 1 7.7 1 16c0 11 15 24 15 24s15-13 15-24c0-8.3-6.7-15-15-15z" fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="5.5" fill="white"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Build a Google-Maps-ready icon descriptor. `googleMaps` should be the
// `window.google.maps` namespace (or null if not yet loaded).
// Falls back to a plain URL string if Size/Point aren't constructors yet
// (newer Maps loader sometimes lazy-loads these).
export function pinIcon(color, googleMaps) {
  const url = svgPin(color);
  if (
    !googleMaps ||
    typeof googleMaps.Size !== 'function' ||
    typeof googleMaps.Point !== 'function'
  ) {
    return url;
  }
  try {
    return {
      url,
      scaledSize: new googleMaps.Size(32, 42),
      anchor: new googleMaps.Point(16, 42), // tip lands on the lat/lng
    };
  } catch {
    return url;
  }
}

export function pinForType(type, googleMaps) {
  return pinIcon(TYPE_COLOR[type] || TYPE_COLOR.Medical, googleMaps);
}
