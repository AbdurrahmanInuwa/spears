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
import VictimCard from '../../components/VictimCard';

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '');
}

function formatDistanceShort(m) {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// If the dispatcher is within ~50m of the victim, nudge the dispatcher's
// pin a few meters NE on screen so both pins remain visible. Routing /
// distance use the real origin, not this offset.
function visualOriginOffset(origin, victim) {
  if (!origin) return null;
  const d = haversineMeters(origin, victim);
  if (d > 50) return origin;
  return { lat: origin.lat + 0.0003, lng: origin.lng + 0.0003 };
}

const containerStyle = { width: '100%', height: '100%' };
const REROUTE_MS = 30_000; // re-compute the route every 30s

export default function PublicDispatcherPage() {
  const { token } = useParams();
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [origin, setOrigin] = useState(null);
  const [directions, setDirections] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const lastRerouteRef = useRef(0);
  const watchIdRef = useRef(null);
  const mapRef = useRef(null);
  const didFitRef = useRef(false); // ensures we only auto-fit once per page load

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/public/d/${token}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error || 'Invalid link');
          return;
        }
        setData(body);
        if (body.dispatch?.startedAt) setStarted(true);
        if (body.dispatch?.arrivedAt) setArrived(true);
      } catch {
        if (!cancelled) setError('Network error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ─── Live tracking + periodic re-routing ───
  // Tracks the dispatcher as soon as the page loads (so they see their own
  // pin straight away). Routing only kicks in once Start is tapped.
  useEffect(() => {
    if (arrived || !data || !isLoaded) return;
    if (!navigator.geolocation || !window.google?.maps) {
      setGeoError('Geolocation not available in this browser.');
      return;
    }

    function maybeReroute(myPos, force = false) {
      const now = Date.now();
      if (!force && now - lastRerouteRef.current < REROUTE_MS) return;
      lastRerouteRef.current = now;
      const ds = new window.google.maps.DirectionsService();
      ds.route(
        {
          origin: myPos,
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
          else console.warn('Directions failed:', status);
        }
      );
    }

    function handlePos(pos) {
      const myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setOrigin(myPos);
      setGeoError(null);
      // Don't compute a route until the dispatcher commits with Start
      if (started) {
        maybeReroute(myPos);
        // Push live position to the citizen + institution subscribers.
        // Backend throttles to once / 2s — sending a touch more often is
        // fine, the second will be 204.
        pushPosition({
          lat: myPos.lat,
          lng: myPos.lng,
          headingDeg:
            typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)
              ? pos.coords.heading
              : null,
          speedKmh:
            typeof pos.coords.speed === 'number' && !Number.isNaN(pos.coords.speed)
              ? pos.coords.speed * 3.6
              : null,
        });
      }
    }

    let lastPushAt = 0;
    function pushPosition(body) {
      const now = Date.now();
      if (now - lastPushAt < 2000) return;
      lastPushAt = now;
      fetch(`${API_URL}/public/d/${token}/position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {});
    }
    function handleErr(err) {
      console.warn('geolocation error:', err);
      const msg =
        err?.code === 1
          ? 'Location permission denied. Please enable it to navigate.'
          : 'Could not get your location.';
      setGeoError(msg);
    }

    // Fast first fix (single shot) so the pin appears immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePos(pos),
      handleErr,
      { enableHighAccuracy: true, timeout: 10_000 }
    );
    // Continuous tracking
    const watchId = navigator.geolocation.watchPosition(handlePos, handleErr, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 15_000,
    });
    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [started, arrived, data, isLoaded]);

  // When Start is pressed AFTER we already have a position fix, kick off
  // the very first route immediately.
  useEffect(() => {
    if (!started || !origin || !data || !isLoaded || !window.google?.maps)
      return;
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
        else console.warn('Directions failed:', status);
      }
    );
    lastRerouteRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Fit the map so the relevant content is visible.
  // - If we have a computed route, use the route's true bounds (follows the
  //   actual polyline, not just the two endpoints)
  // - Otherwise fall back to victim + dispatcher pins
  // - Cap zoom at 16 if only one point is available, so we don't end up at
  //   street-overlay level
  function autoFit() {
    if (!mapRef.current || !window.google?.maps || !data) return;
    const map = mapRef.current;

    if (directions?.routes?.[0]?.bounds) {
      map.fitBounds(directions.routes[0].bounds, 80);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({
      lat: data.emergency.victimLat,
      lng: data.emergency.victimLng,
    });
    if (origin) bounds.extend(origin);
    map.fitBounds(bounds, 80);

    if (!origin) {
      window.google.maps.event.addListenerOnce(map, 'idle', () => {
        if (map.getZoom() > 16) map.setZoom(16);
      });
    }
  }

  // Auto-fit once when both data and origin first arrive
  useEffect(() => {
    if (didFitRef.current) return;
    if (!data || !mapRef.current || !window.google?.maps) return;
    autoFit();
    didFitRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, origin, isLoaded]);

  async function handleStart() {
    setStarted(true);
    lastRerouteRef.current = 0; // force first route compute
    autoFit(); // re-frame to show both pins now that we're committed
    try {
      await fetch(`${API_URL}/public/d/${token}/start`, { method: 'POST' });
    } catch {}
  }

  async function handleArrived() {
    setArrived(true);
    try {
      await fetch(`${API_URL}/public/d/${token}/arrived`, { method: 'POST' });
    } catch {}
  }

  if (error) {
    return <CenteredCard>This link is no longer valid: {error}</CenteredCard>;
  }
  if (!data) {
    return <CenteredCard>Loading…</CenteredCard>;
  }

  const victim = {
    lat: data.emergency.victimLat,
    lng: data.emergency.victimLng,
  };
  const victimColor = TYPE_COLOR[data.emergency.type] || SEMANTIC_COLOR.victim;

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
            // Try to fit immediately on load (origin may already be available)
            autoFit();
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
              position={visualOriginOffset(origin, victim)}
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
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true,
                // Let Google auto-fit the viewport to the polyline whenever
                // a fresh route arrives (smarter than fitting just the two
                // endpoints — it follows the actual road geometry).
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

      {/* Top-left: type badge + ETA/distance pill */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
        <div className="pointer-events-auto inline-flex w-max rounded-md bg-brand px-4 py-2 text-sm font-bold uppercase tracking-wider text-white shadow-lg">
          {data.emergency.type}
        </div>
        {directions?.routes?.[0]?.legs?.[0] && (
          <div className="pointer-events-auto inline-flex w-max items-center gap-3 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-lg">
            <span>
              {directions.routes[0].legs[0].distance?.text || '—'}
            </span>
            <span className="h-3 w-px bg-slate-200" />
            <span>
              {(directions.routes[0].legs[0].duration_in_traffic ||
                directions.routes[0].legs[0].duration)?.text || '—'}
            </span>
          </div>
        )}
      </div>

      {/* Top-right victim card — always visible */}
      <div className="pointer-events-auto absolute right-2 top-2 w-[calc(100%-1rem)] max-w-xs overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-200 sm:right-4 sm:top-4 sm:w-72">
        <VictimCard victim={data.emergency.citizen} />
      </div>

      {/* Geolocation error (if any) — small chip just below the type badge */}
      {geoError && (
        <div className="pointer-events-auto absolute left-4 top-16 max-w-xs rounded-md bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 shadow ring-1 ring-amber-200">
          {geoError}
        </div>
      )}

      {/* Recenter button — sits just above Google's +/- zoom controls */}
      <button
        type="button"
        onClick={autoFit}
        aria-label="Recenter map"
        title="Recenter"
        className="pointer-events-auto absolute bottom-[150px] right-3 flex h-10 w-10 items-center justify-center rounded-md bg-white text-slate-700 shadow-lg ring-1 ring-slate-200 transition hover:bg-slate-100"
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

      {/* Next-turn instruction (only after Start) */}
      {started && !arrived && directions?.routes?.[0]?.legs?.[0]?.steps?.[0] && (() => {
        const step = directions.routes[0].legs[0].steps[0];
        return (
          <div className="pointer-events-auto absolute inset-x-0 bottom-24 flex justify-center px-6">
            <div className="max-w-md rounded-lg bg-slate-900/85 px-4 py-3 text-center text-white shadow-2xl backdrop-blur">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
                In {step.distance?.text || '—'}
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-snug">
                {stripHtml(step.instructions)}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Bottom-center action — Start → (locked) Distance → I've arrived → Done */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
        {!started && (
          <button
            type="button"
            onClick={handleStart}
            className="rounded-md bg-brand px-12 py-4 text-lg font-bold uppercase tracking-wider text-white shadow-2xl transition hover:bg-brand-dark"
          >
            Start
          </button>
        )}
        {started && !arrived && (() => {
          const distM = origin ? haversineMeters(origin, victim) : null;
          const close = distM != null && distM <= 100;
          return (
            <button
              type="button"
              onClick={handleArrived}
              disabled={!close}
              className={`flex flex-col items-center rounded-md px-12 py-3 font-bold uppercase tracking-wider text-white shadow-2xl transition ${
                close
                  ? 'bg-emerald-500 hover:bg-emerald-600'
                  : 'cursor-not-allowed bg-slate-500/90'
              }`}
            >
              <span className="text-lg">I&apos;ve arrived</span>
              {!close && (
                <span className="mt-0.5 text-[10px] font-semibold normal-case tracking-wider opacity-80">
                  {distM != null
                    ? `${formatDistanceShort(distM)} away`
                    : 'Waiting for location…'}
                </span>
              )}
            </button>
          );
        })()}
        {arrived && (
          <div className="rounded-md bg-slate-900/80 px-6 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur">
            Marked as arrived. Thank you.
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredCard({ children }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-slate-900 p-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white px-6 py-5 text-center text-sm text-slate-700 shadow-lg">
        {children}
      </div>
    </div>
  );
}
