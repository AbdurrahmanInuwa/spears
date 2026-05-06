'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  GoogleMap,
  Marker,
  Polygon,
  Circle,
  useJsApiLoader,
} from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../../lib/googleMaps';
import { useRouter } from 'next/navigation';
import { useInstitution } from '../InstitutionContext';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { apiFetch } from '../../lib/api';
import { pinForType, pinIcon, SEMANTIC_COLOR } from '../../lib/mapPins';
import VictimCard from '../../components/VictimCard';
import { getSocket } from '../../lib/socket';

const containerStyle = { width: '100%', height: '100%' };
// Now that we get live socket events for create/update/resolve, polling is
// just a safety net (network blip, page asleep, etc.) so 30s is plenty.
const POLL_MS = 30000;

// Self-contained pulse ring — runs its own RAF loop so the parent doesn't
// re-render 60×/sec.
function PulseRing({ center, color, durationMs = 2500, maxRadiusM = 600 }) {
  const [tick, setTick] = useState(0);
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
  const t = (tick % durationMs) / durationMs;
  return (
    <Circle
      center={center}
      radius={t * maxRadiusM}
      options={{
        fillColor: color,
        fillOpacity: 0.5 * (1 - t) * 0.4,
        strokeColor: color,
        strokeOpacity: 0.5 * (1 - t),
        strokeWeight: 2,
        clickable: false,
        zIndex: 2,
      }}
    />
  );
}

function statusOf(emergency) {
  const d = emergency.dispatches?.[0];
  if (!d) {
    return {
      label: 'Awaiting dispatch',
      dot: 'bg-slate-300',
      text: 'text-slate-500',
      dispatcher: null,
    };
  }
  if (d.startedAt) {
    return {
      label: 'On the way',
      dot: 'bg-emerald-500',
      text: 'text-emerald-700',
      dispatcher: d.dispatcher?.name || null,
    };
  }
  return {
    label: 'Dispatcher notified',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    dispatcher: d.dispatcher?.name || null,
  };
}

export default function InstitutionEmergencyPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { institution, loading } = useInstitution();
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  const [emergencies, setEmergencies] = useState([]);
  const [dispatcherPositions, setDispatcherPositions] = useState({}); // { [emergencyId]: { lat, lng, ts } }
  const [dispatchers, setDispatchers] = useState([]);
  const [activePanel, setActivePanel] = useState(null); // emergency object
  const [selectedDispatcher, setSelectedDispatcher] = useState(null);
  const [tokenForActive, setTokenForActive] = useState(null);
  const [opening, setOpening] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const mapRef = useRef(null);

  function handleRecenter() {
    if (!mapRef.current || !window.google?.maps) return;
    const polygon = institution?.coveragePolygon || [];
    if (polygon.length === 0) {
      mapRef.current.panTo({
        lat: institution.centerLat,
        lng: institution.centerLng,
      });
      mapRef.current.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    polygon.forEach((p) => bounds.extend(p));
    mapRef.current.fitBounds(bounds, 60);
  }

  // Load dispatchers once
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const res = await apiFetch('/dispatchers');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDispatchers(data.dispatchers || []);
    })();
  }, [user?.email]);

  async function openDispatchPanel(emergency) {
    if (opening) return;
    setOpening(true);
    setActivePanel(emergency);
    setSelectedDispatcher(null);
    setTokenForActive(null);
    try {
      const res = await apiFetch(
        `/emergencies/${emergency.id}/admin-token`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Could not open dispatch', { variant: 'error' });
        setActivePanel(null);
        return;
      }
      setTokenForActive(data.token);
    } finally {
      setOpening(false);
    }
  }

  function closeDispatchPanel() {
    setActivePanel(null);
    setSelectedDispatcher(null);
    setTokenForActive(null);
  }

  async function confirmDispatch() {
    if (!tokenForActive || !selectedDispatcher) return;
    setConfirming(true);
    try {
      const res = await fetch(`${API_URL}/public/e/${tokenForActive}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatcherId: selectedDispatcher }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Dispatch failed', { variant: 'error' });
        return;
      }
      closeDispatchPanel();
    } finally {
      setConfirming(false);
    }
  }

  // Poll active emergencies for this institution's coverage area (safety net)
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await apiFetch('/emergencies/active');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setEmergencies(data.emergencies || []);
      } catch {}
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.email]);

  // ─── Live institution feed via socket.io ───
  // New emergencies appear instantly. Status changes (dispatched, on the way)
  // and resolutions are reflected without a poll round-trip.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function doSubscribe() {
      socket.emit('subscribe:institution', null, () => {});
    }
    function onCreated(e) {
      if (!e?.id) return;
      setEmergencies((cur) =>
        cur.find((x) => x.id === e.id) ? cur : [e, ...cur]
      );
    }
    function onUpdated(e) {
      if (!e?.id) return;
      setEmergencies((cur) => {
        const idx = cur.findIndex((x) => x.id === e.id);
        if (idx === -1) return [e, ...cur]; // out-of-order arrival
        const next = cur.slice();
        next[idx] = e;
        return next;
      });
    }
    function onResolved({ emergencyId } = {}) {
      if (!emergencyId) return;
      setEmergencies((cur) => cur.filter((x) => x.id !== emergencyId));
    }

    if (socket.connected) doSubscribe();
    socket.on('connect', doSubscribe);
    socket.on('emergency:created', onCreated);
    socket.on('emergency:updated', onUpdated);
    socket.on('emergency:resolved', onResolved);

    return () => {
      socket.off('connect', doSubscribe);
      socket.off('emergency:created', onCreated);
      socket.off('emergency:updated', onUpdated);
      socket.off('emergency:resolved', onResolved);
      socket.emit('unsubscribe:institution', null, () => {});
    };
  }, []);

  // ─── Subscribe to live dispatcher positions per active emergency ───
  useEffect(() => {
    const socket = getSocket();
    if (!socket || emergencies.length === 0) return;
    const ids = emergencies.map((e) => e.id);

    function subscribeAll() {
      ids.forEach((id) =>
        socket.emit(
          'subscribe:emergency',
          { emergencyId: id, scope: 'institution' },
          () => {}
        )
      );
    }

    function onPos(payload) {
      // Find which emergency this belongs to by reverse-matching the most
      // recent room. Server's payload doesn't include emergencyId, so we
      // store it under all rooms — but since the institution can only have
      // one moving dispatcher per emergency, indexing by dispatcherId works
      // — except multiple emergencies could have the same dispatcher type.
      // Instead: hydrate via REST per-emergency on first paint, and react
      // to updates by querying which emergency room this came from. The
      // simplest reliable approach: include emergencyId in the payload.
      // (See backend — payload now includes ts; we'll attach by the room
      // nearest in time. For now, we listen to all and filter via the
      // explicit emergencyId server adds below.)
      if (payload?.emergencyId) {
        setDispatcherPositions((cur) => ({
          ...cur,
          [payload.emergencyId]: payload,
        }));
      }
    }
    function onResolved({ emergencyId }) {
      if (!emergencyId) return;
      setDispatcherPositions((cur) => {
        const next = { ...cur };
        delete next[emergencyId];
        return next;
      });
    }

    if (socket.connected) subscribeAll();
    socket.on('connect', subscribeAll);
    socket.on('dispatcher:position', onPos);
    socket.on('emergency:resolved', onResolved);

    // Hydrate last-known positions
    ids.forEach((id) => {
      apiFetch(`/public/position/${id}`)
        .then((r) => r.json().catch(() => ({})))
        .then((d) => {
          if (d?.position) {
            setDispatcherPositions((cur) => ({
              ...cur,
              [id]: { ...d.position, emergencyId: id },
            }));
          }
        })
        .catch(() => {});
    });

    return () => {
      socket.off('connect', subscribeAll);
      socket.off('dispatcher:position', onPos);
      socket.off('emergency:resolved', onResolved);
      ids.forEach((id) =>
        socket.emit('unsubscribe:emergency', { emergencyId: id })
      );
    };
  }, [emergencies]);

  const hasEmergency = emergencies.length > 0;
  const PULSE = hasEmergency
    ? { color: '#dc2626', label: `${emergencies.length} active emergency${emergencies.length === 1 ? '' : 'ies'}` }
    : { color: '#10b981', label: 'On standby' };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  if (!institution) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Could not load institution.
      </div>
    );
  }

  const center = { lat: institution.centerLat, lng: institution.centerLng };
  const polygon = institution.coveragePolygon || [];

  return (
    <div className="relative h-full w-full">
      {!isLoaded && (
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
          {loadError ? 'Failed to load map.' : 'Loading map…'}
        </div>
      )}
      {isLoaded && (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={14}
          onLoad={(map) => {
            mapRef.current = map;
            if (polygon.length > 0 && window.google?.maps) {
              const bounds = new window.google.maps.LatLngBounds();
              polygon.forEach((p) => bounds.extend(p));
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
                fillColor: PULSE.color,
                fillOpacity: 0.12,
                strokeColor: PULSE.color,
                strokeOpacity: 0.85,
                strokeWeight: 2,
                clickable: false,
              }}
            />
          )}
          <Marker position={center} />
          <PulseRing
            center={center}
            color={PULSE.color}
            durationMs={hasEmergency ? 1500 : 2500}
          />
          {emergencies.map((e) => (
            <Marker
              key={e.id}
              position={{ lat: e.victimLat, lng: e.victimLng }}
              icon={pinForType(e.type, window.google?.maps)}
              title={`${e.type} · ${new Date(e.createdAt).toLocaleTimeString()}`}
            />
          ))}
          {Object.entries(dispatcherPositions).map(([id, pos]) => (
            <Marker
              key={`disp-${id}`}
              position={{ lat: pos.lat, lng: pos.lng }}
              icon={pinIcon(SEMANTIC_COLOR.self, window.google?.maps)}
              title="Dispatcher en route"
              zIndex={50}
            />
          ))}
        </GoogleMap>
      )}

      {/* Recenter button — sits just above Google's +/- zoom controls */}
      <button
        type="button"
        onClick={handleRecenter}
        aria-label="Recenter map"
        title="Recenter to coverage area"
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

      {/* Status badge */}
      <div className="pointer-events-none absolute left-4 top-4">
        <div
          className={`pointer-events-auto rounded-md px-4 py-2 text-sm font-semibold text-white shadow-lg ${
            hasEmergency ? 'bg-brand' : 'bg-emerald-500'
          }`}
        >
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
          {PULSE.label}
        </div>
      </div>

      {/* Active emergencies list */}
      {hasEmergency && (
        <div className="pointer-events-auto absolute right-4 top-4 w-72 rounded-md bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
              Active emergencies
            </p>
          </div>
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {emergencies.map((e) => {
              const isActive = activePanel?.id === e.id;
              const status = statusOf(e);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => openDispatchPanel(e)}
                    className={`block w-full px-3 py-2.5 text-left transition ${
                      isActive ? 'bg-red-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">
                        {e.type}
                      </p>
                      {isActive && (
                        <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                          Open
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {new Date(e.createdAt).toLocaleTimeString()} ·{' '}
                      <span className="text-slate-400">
                        {e.victimLat.toFixed(4)}, {e.victimLng.toFixed(4)}
                      </span>
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${status.text}`}>
                        {status.label}
                      </span>
                      {status.dispatcher && (
                        <span className="ml-1 truncate text-[10px] text-slate-400">
                          · {status.dispatcher}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Floating dispatcher panel — sits to the LEFT of the emergencies list */}
      {activePanel && (
        <div className="pointer-events-auto absolute inset-x-4 top-[60%] z-20 max-h-[35vh] overflow-y-auto rounded-md bg-white shadow-2xl ring-1 ring-slate-200 md:inset-x-auto md:top-4 md:right-[19.5rem] md:max-h-[80vh] md:w-72">
          <div className="flex items-start justify-between border-b border-slate-100 px-3 py-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                Send dispatcher
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {activePanel.type} · {new Date(activePanel.createdAt).toLocaleTimeString()}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDispatchPanel}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          </div>

          {/* Victim info */}
          <VictimCard victim={activePanel.citizen} />

          <div className="border-t border-slate-100 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
              Pick a dispatcher
            </p>
          </div>

          {dispatchers.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                No dispatchers yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Add a dispatcher to continue.
              </p>
              <Link
                href="/institution/dispatchers"
                className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-brand-dark"
              >
                Go to dispatchers
              </Link>
            </div>
          ) : (
            <>
              <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto">
                {dispatchers.map((d) => {
                  const isActive = selectedDispatcher === d.id;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedDispatcher(d.id)}
                        className={`w-full px-3 py-2 text-left transition ${
                          isActive ? 'bg-red-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-bold text-slate-900">
                            {d.name}
                          </p>
                          {isActive && (
                            <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold uppercase text-white">
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
              <div className="border-t border-slate-100 p-3">
                <button
                  type="button"
                  onClick={confirmDispatch}
                  disabled={
                    !selectedDispatcher || !tokenForActive || confirming
                  }
                  className="w-full rounded-md bg-brand px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {confirming ? 'Dispatching…' : 'Dispatch'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

