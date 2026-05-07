'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useJsApiLoader } from '@react-google-maps/api';
import MapView from './components/MapView';
import InfoCard from './components/InfoCard';
import SOSButton from './components/SOSButton';
import NearbyHelpModal from './components/NearbyHelpModal';
import { googleMapsLoaderOptions } from './lib/googleMaps';
import { API_URL } from './lib/api';

const PLACE_NAME_CACHE_KEY = 'spaers_place_name_cache_v1';

function formatDistance(m) {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export default function HomePage() {
  const [showNearby, setShowNearby] = useState(false);
  const [location, setLocation] = useState(null);
  const [accuracyM, setAccuracyM] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [placeName, setPlaceName] = useState(null);
  const [activeNearby, setActiveNearby] = useState(null); // { count, emergencies }
  const [nearbySummary, setNearbySummary] = useState(null);

  const { isLoaded } = useJsApiLoader(googleMapsLoaderOptions);
  const placeFetchedRef = useRef(false);

  // 1. Geolocate — only when the user clicks "Enable location" (we don't
  // ask for permission on page load).
  const [requesting, setRequesting] = useState(false);
  function requestLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocation not supported by this browser');
      return;
    }
    setRequesting(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracyM(Math.round(pos.coords.accuracy));
        setGeoError(null);
        setRequesting(false);
      },
      (err) => {
        console.warn('geolocation denied:', err);
        setGeoError(
          err?.code === 1
            ? 'Location permission denied. Enable it in your browser settings.'
            : 'Could not get your location'
        );
        setRequesting(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // 2. Reverse-geocode + AI place name (with localStorage cache)
  useEffect(() => {
    if (!location || !isLoaded || placeFetchedRef.current) return;
    if (!window.google?.maps?.Geocoder) return;
    placeFetchedRef.current = true;

    // Cheap cache key — quantize coords to ~110m so small movements still hit
    const cacheKey = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
    try {
      const cached = JSON.parse(
        window.localStorage.getItem(PLACE_NAME_CACHE_KEY) || '{}'
      );
      if (cached[cacheKey]) {
        setPlaceName(cached[cacheKey]);
        return;
      }
    } catch {}

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location }, async (results, status) => {
      if (status !== 'OK' || !results?.[0]?.formatted_address) return;
      const address = results[0].formatted_address;
      try {
        const res = await fetch(`${API_URL}/ai/place-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.name) {
          setPlaceName(data.name);
          try {
            const cached = JSON.parse(
              window.localStorage.getItem(PLACE_NAME_CACHE_KEY) || '{}'
            );
            cached[cacheKey] = data.name;
            window.localStorage.setItem(
              PLACE_NAME_CACHE_KEY,
              JSON.stringify(cached)
            );
          } catch {}
        }
      } catch (err) {
        console.warn('AI place-name failed:', err);
      }
    });
  }, [location, isLoaded]);

  // 3. Active emergencies near you
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(
          `${API_URL}/emergencies/active-nearby?lat=${location.lat}&lng=${location.lng}&radiusKm=5`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setActiveNearby(data);
      } catch {}
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [location]);

  // 4. Nearby help summary
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/institutions/nearby-summary?lat=${location.lat}&lng=${location.lng}&radiusKm=15`
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setNearbySummary(data);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [location]);

  return (
    <div className="h-full">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 md:justify-center md:py-4">
        <div className="grid grid-cols-12 gap-4">
          {/* Top-left: Status & Location */}
          <div className="col-span-12 flex h-full md:max-h-[540px] flex-col justify-between gap-4 self-center md:col-span-3">
            <InfoCard title="Your Current Status & Location Info">
              <p className="font-medium text-slate-700">
                {placeName
                  ? `You are in ${placeName}`
                  : location
                    ? 'Locating you…'
                    : geoError
                      ? 'Location unavailable'
                      : 'Enable location to see your area'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {geoError
                  ? geoError
                  : accuracyM != null
                    ? `Location accurate to ${accuracyM} m`
                    : '—'}
              </p>
            </InfoCard>

            <div className="relative">
              <InfoCard title="Nearby Help Summary">
                {!location ? (
                  <p className="text-slate-500">
                    Enable location to see nearby help.
                  </p>
                ) : !nearbySummary ? (
                  <p className="text-slate-500">Checking your area…</p>
                ) : (
                  <ul className="space-y-1">
                    <li>
                      {nearbySummary.total} responder
                      {nearbySummary.total === 1 ? '' : 's'} within 15&nbsp;km
                    </li>
                    {nearbySummary.nearestHospital ? (
                      <li>
                        Nearest hospital:{' '}
                        {formatDistance(nearbySummary.nearestHospital.distanceM)}
                      </li>
                    ) : (
                      <li className="text-slate-500">No hospital in range</li>
                    )}
                  </ul>
                )}
                <button
                  onClick={() => setShowNearby((s) => !s)}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                  aria-label="Show all nearby services"
                >
                  ··· View all
                </button>
              </InfoCard>
              <NearbyHelpModal
                open={showNearby}
                onClose={() => setShowNearby(false)}
                summary={nearbySummary}
              />
            </div>
          </div>

          {/* Center: map (or "enable location" prompt before permission) */}
          <div className="order-first col-span-12 flex items-center justify-center md:order-none md:col-span-6">
            <div className="h-[300px] w-full max-w-[680px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-md sm:h-[400px] md:h-[540px]">
              {location ? (
                <MapView center={location} zoom={15} />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-slate-300"
                    aria-hidden="true"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <p className="text-sm font-semibold text-slate-700">
                    Please enable location
                  </p>
                  <p className="max-w-xs text-xs text-slate-500">
                    SPAERS uses your location to show nearby help and find
                    responders quickly when you trigger an SOS.
                  </p>
                  <button
                    type="button"
                    onClick={requestLocation}
                    disabled={requesting}
                    className="mt-1 rounded-md bg-brand px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {requesting ? 'Requesting…' : 'Enable location'}
                  </button>
                  {geoError && (
                    <p className="mt-1 max-w-xs rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200">
                      {geoError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Safety + Quick Action */}
          <div className="col-span-12 flex h-full md:max-h-[540px] flex-col justify-between gap-4 self-center md:col-span-3">
            <InfoCard title="Safety Status">
              {!location ? (
                <p className="text-slate-500">
                  Enable location to check your area.
                </p>
              ) : !activeNearby ? (
                <p className="text-slate-500">Checking your area…</p>
              ) : activeNearby.count === 0 ? (
                <>
                  <p className="text-slate-700">
                    No current emergency in your area.
                  </p>
                  <p className="mt-1 font-semibold text-emerald-600">
                    You are safe.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-brand">
                    {activeNearby.count} active{' '}
                    {activeNearby.count === 1 ? 'emergency' : 'emergencies'}{' '}
                    nearby.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Closest:{' '}
                    {formatDistance(activeNearby.emergencies[0].distanceM)}{' '}
                    away
                  </p>
                </>
              )}
            </InfoCard>

            <InfoCard title="Quick Action">
              <p className="mb-3 text-xs text-slate-500">
                Tap SOS to alert responders.
              </p>
              <SOSButton />
            </InfoCard>
          </div>
        </div>

        {/* Bottom-center CTA */}
        <div className="mt-[10px] flex justify-center">
          <Link
            href="/signin"
            className="rounded-md border border-brand bg-white px-10 py-2.5 text-base font-semibold text-brand transition hover:bg-brand hover:text-white"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
