'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  GoogleMap,
  Marker,
  Polygon,
  Circle,
  useJsApiLoader,
} from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../../lib/googleMaps';
import { API_URL } from '../../lib/api';

const containerStyle = { width: '100%', height: '100%' };

export default function PublicEmergencyPage() {
  const { token } = useParams();
  const router = useRouter();
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDispatcher, setSelectedDispatcher] = useState(null);
  const [dispatching, setDispatching] = useState(false);
  const [done, setDone] = useState(false);
  const [tick, setTick] = useState(0);

  // Pulse animation
  useEffect(() => {
    let raf, start;
    function loop(now) {
      if (start === undefined) start = now;
      setTick(now - start);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/public/e/${token}`);
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

  async function handleDispatch() {
    if (!selectedDispatcher) return;
    setDispatching(true);
    try {
      const res = await fetch(`${API_URL}/public/e/${token}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatcherId: selectedDispatcher }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not dispatch');
        return;
      }
      setDone(true);
    } finally {
      setDispatching(false);
    }
  }

  if (error) {
    return <CenteredCard>This link is no longer valid: {error}</CenteredCard>;
  }
  if (!data) {
    return <CenteredCard>Loading…</CenteredCard>;
  }
  if (done) {
    return (
      <CenteredCard tone="success">
        Dispatcher notified. Thank you.
      </CenteredCard>
    );
  }

  const { emergency, institution, dispatchers } = data;
  const victim = { lat: emergency.victimLat, lng: emergency.victimLng };
  const polygon = institution?.coveragePolygon || [];

  // Pulse around coverage center
  const DURATION = 2500;
  const MAX_R = 600;
  const t = (tick % DURATION) / DURATION;
  const ringRadius = t * MAX_R;
  const ringOpacity = 0.5 * (1 - t);

  return (
    <div className="flex h-dvh w-full flex-col md:flex-row">
      {/* Map (top on mobile / left on desktop) */}
      <div className="relative h-[55vh] flex-shrink-0 md:h-auto md:flex-1">
        {!isLoaded ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-900 text-sm text-slate-300">
            {loadError ? 'Failed to load map.' : 'Loading map…'}
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={victim}
            zoom={15}
            onLoad={(map) => {
              if (polygon.length > 0 && window.google?.maps) {
                const bounds = new window.google.maps.LatLngBounds();
                polygon.forEach((p) => bounds.extend(p));
                bounds.extend(victim);
                map.fitBounds(bounds, 60);
              }
            }}
            options={{
              mapTypeId: 'satellite',
              disableDefaultUI: true,
              zoomControl: true,
              clickableIcons: false,
            }}
          >
            {polygon.length > 0 && (
              <Polygon
                paths={polygon}
                options={{
                  fillColor: '#dc2626',
                  fillOpacity: 0.12,
                  strokeColor: '#dc2626',
                  strokeOpacity: 0.85,
                  strokeWeight: 2,
                  clickable: false,
                }}
              />
            )}
            {institution && (
              <Circle
                center={{
                  lat: institution.centerLat,
                  lng: institution.centerLng,
                }}
                radius={ringRadius}
                options={{
                  fillColor: '#dc2626',
                  fillOpacity: ringOpacity * 0.4,
                  strokeColor: '#dc2626',
                  strokeOpacity: ringOpacity,
                  strokeWeight: 2,
                  clickable: false,
                }}
              />
            )}
            <Marker
              position={victim}
              title="Victim"
              icon={{
                path: window.google?.maps?.SymbolPath?.CIRCLE,
                scale: 10,
                fillColor: '#dc2626',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 3,
              }}
            />
          </GoogleMap>
        )}

        <div className="pointer-events-none absolute left-4 top-4">
          <div className="pointer-events-auto rounded-md bg-brand px-4 py-2 text-sm font-bold uppercase tracking-wider text-white shadow-lg">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
            Emergency · {emergency.type}
          </div>
        </div>
      </div>

      {/* Sidebar (right) */}
      <aside className="flex min-h-0 flex-1 flex-col border-t border-slate-200 bg-white md:w-80 md:flex-initial md:border-l md:border-t-0">
        <div className="border-b border-slate-200 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
            {institution?.name || 'Institution'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Pick a dispatcher to send.
          </p>
        </div>

        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {dispatchers.length === 0 && (
            <li className="px-4 py-4 text-sm text-slate-500">
              No dispatchers configured.
            </li>
          )}
          {dispatchers.map((d) => {
            const isActive = selectedDispatcher === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDispatcher(d.id)}
                  className={`w-full px-4 py-3 text-left transition ${
                    isActive ? 'bg-red-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-bold text-slate-900">{d.name}</p>
                    {isActive && (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
                    {d.dispatcherId} · {d.mode}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={handleDispatch}
            disabled={!selectedDispatcher || dispatching}
            className="w-full rounded-md bg-brand px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {dispatching ? 'Dispatching…' : 'Dispatch'}
          </button>
        </div>
      </aside>
    </div>
  );
}

function CenteredCard({ children, tone = 'neutral' }) {
  const cls =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-slate-200 bg-white text-slate-700';
  return (
    <div className="flex h-dvh items-center justify-center bg-slate-900 p-6">
      <div className={`max-w-md rounded-xl border ${cls} px-6 py-5 text-center text-sm shadow-lg`}>
        {children}
      </div>
    </div>
  );
}
