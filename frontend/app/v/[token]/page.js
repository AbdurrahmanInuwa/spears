'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  GoogleMap,
  Marker,
  DirectionsRenderer,
  useJsApiLoader,
} from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../../lib/googleMaps';
import { API_URL } from '../../lib/api';
import { pinIcon, SEMANTIC_COLOR, TYPE_COLOR } from '../../lib/mapPins';
import { haversineMeters } from '../../lib/geometry';

const containerStyle = { width: '100%', height: '100%' };
const NEAR_THRESHOLD_M = 5000; // visual cue if within 5 km

function formatDistance(m) {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export default function PublicVolunteerPage() {
  const { token } = useParams();
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [directions, setDirections] = useState(null);
  const mapRef = useRef(null);
  const watchIdRef = useRef(null);
  const fittedRef = useRef(false);

  // Hydrate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/public/v/${token}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error || 'Invalid link');
          return;
        }
        setData(body);
      } catch {
        if (!cancelled) setError('Network error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Watch volunteer position from page load (no Start needed)
  useEffect(() => {
    if (!data || !isLoaded) return;
    if (!navigator.geolocation) {
      setGeoError('Geolocation not available');
      return;
    }
    function handlePos(pos) {
      setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGeoError(null);
    }
    function handleErr(err) {
      console.warn('geolocation:', err);
      setGeoError(
        err?.code === 1
          ? 'Location permission denied. Enable it to see your distance.'
          : 'Could not get your location.'
      );
    }
    navigator.geolocation.getCurrentPosition(handlePos, handleErr, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
    const id = navigator.geolocation.watchPosition(handlePos, handleErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    });
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [data, isLoaded]);

  // Auto-fit once we have both points
  useEffect(() => {
    if (fittedRef.current || !data || !mapRef.current || !window.google?.maps)
      return;
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({
      lat: data.emergency.victimLat,
      lng: data.emergency.victimLng,
    });
    if (origin) bounds.extend(origin);
    mapRef.current.fitBounds(bounds, 80);
    fittedRef.current = true;
  }, [data, origin]);

  // After Accept, compute the route once + update on origin change (every ~30s)
  const lastRouteAtRef = useRef(0);
  useEffect(() => {
    if (!accepted || !data || !isLoaded || !origin || !window.google?.maps) return;
    const now = Date.now();
    if (now - lastRouteAtRef.current < 30_000 && directions) return;
    lastRouteAtRef.current = now;
    const ds = new window.google.maps.DirectionsService();
    ds.route(
      {
        origin,
        destination: {
          lat: data.emergency.victimLat,
          lng: data.emergency.victimLng,
        },
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: 'bestguess',
        },
      },
      (result, status) => {
        if (status === 'OK') setDirections(result);
      }
    );
  }, [accepted, origin, data, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAccept() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`${API_URL}/public/v/${token}/accept`, { method: 'POST' });
      setAccepted(true);
    } finally {
      setBusy(false);
    }
  }
  async function handleDecline() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`${API_URL}/public/v/${token}/decline`, { method: 'POST' });
      setDeclined(true);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <CenteredCard>This link is no longer valid: {error}</CenteredCard>;
  }
  if (!data) {
    return <CenteredCard>Loading…</CenteredCard>;
  }
  if (declined) {
    return (
      <CenteredCard tone="muted">
        Thanks for responding. We&apos;ve noted that you can&apos;t take this one.
      </CenteredCard>
    );
  }

  const victim = {
    lat: data.emergency.victimLat,
    lng: data.emergency.victimLng,
  };
  const victimColor =
    TYPE_COLOR[data.emergency.type] || SEMANTIC_COLOR.victim;
  const distanceM = origin ? haversineMeters(origin, victim) : null;
  const isNear = distanceM != null && distanceM <= NEAR_THRESHOLD_M;

  return (
    <div className="relative h-dvh w-full">
      {!isLoaded ? (
        <div className="flex h-full w-full items-center justify-center bg-slate-900 text-sm text-slate-300">
          {loadError ? 'Failed to load map.' : 'Loading map…'}
        </div>
      ) : (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={origin || victim}
          zoom={14}
          onLoad={(m) => {
            mapRef.current = m;
          }}
          options={{
            mapTypeId: 'roadmap',
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
          }}
        >
          {origin && (
            <Marker
              position={origin}
              title="You"
              icon={pinIcon(SEMANTIC_COLOR.self, window.google?.maps)}
              zIndex={2}
            />
          )}
          <Marker
            position={victim}
            title={`Victim · ${data.emergency.type}`}
            icon={pinIcon(victimColor, window.google?.maps)}
            zIndex={1}
          />
          {accepted && directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: '#dc2626',
                  strokeOpacity: 0.85,
                  strokeWeight: 5,
                },
              }}
            />
          )}
        </GoogleMap>
      )}

      {/* Top-left info badge */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
        <div className="pointer-events-auto inline-flex w-max rounded-md bg-brand px-4 py-2 text-sm font-bold uppercase tracking-wider text-white shadow-lg">
          {data.emergency.type}
        </div>
        {distanceM != null && (
          <div
            className={`pointer-events-auto inline-flex w-max items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-lg ${
              isNear
                ? 'bg-emerald-500 text-white'
                : 'bg-white text-slate-800'
            }`}
          >
            <span>{formatDistance(distanceM)} away</span>
          </div>
        )}
        {geoError && (
          <div className="pointer-events-auto max-w-xs rounded-md bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 shadow ring-1 ring-amber-200">
            {geoError}
          </div>
        )}
      </div>

      {/* Bottom action area */}
      {!accepted ? (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-stretch gap-3 p-6 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={handleDecline}
            disabled={busy}
            className="rounded-md bg-white px-8 py-3 text-base font-bold uppercase tracking-wider text-slate-700 shadow-2xl transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            className="rounded-md bg-brand px-12 py-3 text-base font-bold uppercase tracking-wider text-white shadow-2xl transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            Accept
          </button>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
          <div className="rounded-md bg-emerald-500 px-6 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-2xl">
            On the way · navigating
          </div>
        </div>
      )}
    </div>
  );
}

function CenteredCard({ children, tone = 'neutral' }) {
  const cls =
    tone === 'muted'
      ? 'border-slate-200 bg-slate-50 text-slate-700'
      : 'border-slate-200 bg-white text-slate-700';
  return (
    <div className="flex h-dvh items-center justify-center bg-slate-900 p-6">
      <div
        className={`max-w-md rounded-xl border ${cls} px-6 py-5 text-center text-sm shadow-lg`}
      >
        {children}
      </div>
    </div>
  );
}
