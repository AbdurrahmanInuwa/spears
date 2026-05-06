'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../lib/googleMaps';
import { generateCirclePolygon } from '../lib/geometry';
import { useToast } from '../components/Toast';

const containerStyle = { width: '100%', height: '100%' };
const RAW = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_URL = RAW.replace(/\/+$/, '').endsWith('/api')
  ? RAW.replace(/\/+$/, '')
  : `${RAW.replace(/\/+$/, '')}/api`;

/**
 * Fullscreen editor for the coverage polygon.
 *
 * Props:
 * - center: { lat, lng }            initial map center / marker position
 * - polygon: Array<{lat,lng}>       initial path
 * - institution: { name, type, country, address }   for AI sizing
 * - onCancel(): close without saving
 * - onSave({ center, polygon, radius_m, reason }): persist
 */
export default function InstitutionCoverageEditor({
  center: initialCenter,
  polygon: initialPolygon,
  institution,
  onCancel,
  onSave,
}) {
  const toast = useToast();
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  const [center, setCenter] = useState(initialCenter);
  const [polygon, setPolygon] = useState(initialPolygon);
  const [aiReason, setAiReason] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const polygonRef = useRef(null);
  const mapRef = useRef(null);

  function handlePolygonLoad(p) {
    polygonRef.current = p;
  }

  function handleRecenter() {
    if (!mapRef.current) return;
    mapRef.current.panTo(center);
    mapRef.current.setZoom(15);
  }


  // When the user drags vertices/edges, sync the path back to React state
  function syncPolygonFromRef() {
    const p = polygonRef.current;
    if (!p) return;
    const path = p.getPath();
    const coords = [];
    for (let i = 0; i < path.getLength(); i++) {
      const ll = path.getAt(i);
      coords.push({ lat: ll.lat(), lng: ll.lng() });
    }
    setPolygon(coords);
    setTouched(true);
  }

  function handleMarkerDragEnd(e) {
    const newCenter = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setCenter(newCenter);
    setTouched(true);
    // If we currently have a circle-shaped polygon (default), recenter it.
    // Heuristic: only re-center the polygon if AI hasn't been used and the
    // user hasn't manually edited vertices (cheap version: regenerate from
    // last known radius).
    // Conservative: leave the polygon alone — user can re-suggest with AI
    // or manually drag vertices.
  }

  async function handleSuggestAI() {
    if (!institution?.name || !institution?.type || !institution?.address) {
      toast('Add institution name, type, and address first', { variant: 'error' });
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch(`${API_URL}/ai/suggest-coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: institution.name,
          type: institution.type,
          country: institution.country,
          address: institution.address,
          lat: center.lat,
          lng: center.lng,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'AI request failed', { variant: 'error' });
        return;
      }
      const newPath = generateCirclePolygon(center, data.radius_m);
      setPolygon(newPath);
      setAiReason(data.reason);
      setTouched(true);
      toast(`Suggested ${(data.radius_m / 1000).toFixed(2)} km`);
    } catch (err) {
      console.error(err);
      toast('Network error contacting AI', { variant: 'error' });
    } finally {
      setAiLoading(false);
    }
  }

  function handleSave() {
    // Pull the latest path from the polygon ref in case the user just dragged
    syncPolygonFromRef();
    // Compute the latest values directly (state may not have flushed yet)
    const path = polygonRef.current
      ? readPathFromRef(polygonRef.current)
      : polygon;
    onSave({
      center,
      polygon: path,
      radius_m: null, // we don't track radius once polygon is freely edited
      reason: aiReason,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900">
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
            zoom={15}
            onLoad={(m) => {
              mapRef.current = m;
            }}
            options={{
              mapTypeId: 'satellite',
              disableDefaultUI: true,
              zoomControl: true,
              clickableIcons: false,
            }}
          >
            <Marker
              position={center}
              draggable
              onDragEnd={handleMarkerDragEnd}
            />
            <Polygon
              onLoad={handlePolygonLoad}
              path={polygon}
              editable
              draggable
              onMouseUp={syncPolygonFromRef}
              onDragEnd={syncPolygonFromRef}
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

      {/* Top bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-4">
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
            onClick={handleSuggestAI}
            disabled={aiLoading}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-slate-700 shadow-lg transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ height: 44 }}
          >
            <span>{aiLoading ? '…' : '✨'}</span>
            <span>{aiLoading ? 'Asking AI' : 'Suggest with AI'}</span>
          </button>
          <button
            type="button"
            onClick={handleRecenter}
            aria-label="Recenter map"
            title="Recenter"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition hover:bg-slate-100"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </button>
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

      {/* Bottom hint / AI reason */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 max-w-md -translate-x-1/2 rounded-md bg-black/55 px-3 py-2 text-center text-xs text-white backdrop-blur">
        {aiReason ? (
          <>
            <span className="mr-1 text-brand">✨</span>
            {aiReason}
          </>
        ) : (
          <>Drag the pin to the actual building, then reshape the polygon, or tap “Suggest with AI”.</>
        )}
      </div>
    </div>
  );
}

function readPathFromRef(p) {
  const path = p.getPath();
  const coords = [];
  for (let i = 0; i < path.getLength(); i++) {
    const ll = path.getAt(i);
    coords.push({ lat: ll.lat(), lng: ll.lng() });
  }
  return coords;
}
