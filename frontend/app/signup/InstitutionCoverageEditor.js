'use client';

import { useRef, useState } from 'react';
import {
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../lib/googleMaps';

const containerStyle = { width: '100%', height: '100%' };

/**
 * Fullscreen editor for the coverage polygon.
 *
 * Props:
 * - center: { lat, lng }
 * - polygon: Array<{ lat, lng }>  (the initial path)
 * - onCancel(): close without saving
 * - onSave(newPath): persist the edited polygon
 */
export default function InstitutionCoverageEditor({
  center,
  polygon,
  onCancel,
  onSave,
}) {
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);
  const polygonRef = useRef(null);
  const [touched, setTouched] = useState(false);

  function handlePolygonLoad(p) {
    polygonRef.current = p;
  }

  function readPath() {
    const p = polygonRef.current;
    if (!p) return polygon;
    const path = p.getPath();
    const coords = [];
    for (let i = 0; i < path.getLength(); i++) {
      const ll = path.getAt(i);
      coords.push({ lat: ll.lat(), lng: ll.lng() });
    }
    return coords;
  }

  function handleSave() {
    onSave(readPath());
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900">
      {/* Map */}
      <div className="absolute inset-0">
        {!isLoaded && (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
            {loadError ? 'Failed to load map.' : 'Loading map…'}
          </div>
        )}
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={14}
            options={{
              mapTypeId: 'satellite',
              disableDefaultUI: true,
              zoomControl: true,
              clickableIcons: false,
            }}
          >
            <Marker position={center} />
            <Polygon
              onLoad={handlePolygonLoad}
              path={polygon}
              editable
              draggable
              onMouseUp={() => setTouched(true)}
              onDragEnd={() => setTouched(true)}
              options={{
                fillColor: '#dc2626',
                fillOpacity: 0.18,
                strokeColor: '#dc2626',
                strokeOpacity: 0.9,
                strokeWeight: 2,
                clickable: false,
              }}
            />
          </GoogleMap>
        )}
      </div>

      {/* Header bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-4">
        <div className="pointer-events-auto rounded-md bg-black/55 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
          Edit Coverage Area
          {touched && (
            <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold">
              Modified
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition hover:bg-slate-100"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={handleSave}
            aria-label="Confirm"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand-dark"
          >
            ✓
          </button>
        </div>
      </div>

      {/* Hint */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur">
        Drag vertices to reshape the coverage area
      </div>
    </div>
  );
}
