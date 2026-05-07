'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker } from '@react-google-maps/api';
import MapView from './MapView';
import PulseRings from './PulseRings';
import { pinIcon, SEMANTIC_COLOR } from '../lib/mapPins';
import { API_URL, apiFetch } from '../lib/api';
import { getSocket } from '../lib/socket';
import { haversineMeters, minDistanceToPolygonM } from '../lib/geometry';
import { useToast } from './Toast';

const PULSE_MAX_M = 10000;
const PULSE_DURATION_MS = 4500;
const POLL_MS = 4000;
const DEFAULT_ZOOM = 15;

// Full-screen overlay for an active anonymous SOS. Mirrors the dashboard
// emergency view (matched institutions list, dispatcher pin, status pill,
// cancel button) but uses the unauthenticated /api/emergencies/anonymous/*
// endpoints and a localStorage-stored victim token instead of cookies.
//
// Props:
//   active: { emergencyId, victimToken, type, victimLat, victimLng, createdAt }
//   onClear(): clears localStorage + reverts the parent to the normal home
export default function AnonymousEmergencyOverlay({ active, onClear }) {
  const toast = useToast();
  const mapRef = useRef(null);
  const timersRef = useRef([]);

  const [emergency, setEmergency] = useState(null);
  const [matched, setMatched] = useState([]);
  const [dispatcherPosition, setDispatcherPosition] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const location = { lat: active.victimLat, lng: active.victimLng };

  // ─── Poll status (initial fetch + recurring) ───
  useEffect(() => {
    let cancelled = false;
    let cleared = false;
    async function poll() {
      try {
        const res = await apiFetch(
          `/emergencies/anonymous/${active.victimToken}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          // Token invalid/expired/consumed → drop the localStorage entry
          // so the user lands on a normal home page next time.
          if (!cleared) {
            cleared = true;
            toast('Your SOS session is no longer active', { variant: 'error' });
            onClear();
          }
          return;
        }
        if (!data?.emergency) return;
        setEmergency(data.emergency);
        // Terminal states → clear and pop a final toast
        if (
          ['resolved', 'cancelled', 'expired'].includes(data.emergency.status)
        ) {
          if (!cleared) {
            cleared = true;
            const msg =
              data.emergency.status === 'resolved'
                ? 'Help has arrived. Stay safe.'
                : data.emergency.status === 'cancelled'
                  ? 'SOS cancelled.'
                  : 'SOS expired without resolution.';
            toast(msg);
            // Brief delay so the user sees the final state on the map
            setTimeout(() => {
              if (!cancelled) onClear();
            }, 1800);
          }
        }
      } catch {}
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active.victimToken, onClear, toast]);

  // ─── Match institutions client-side (same logic as citizen flow) ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/institutions`);
        if (!res.ok) return;
        const { institutions = [] } = await res.json();
        const candidates = institutions
          .map((inst) => {
            const polygonM = minDistanceToPolygonM(
              location,
              inst.coveragePolygon || []
            );
            const reachM = haversineMeters(location, {
              lat: inst.centerLat,
              lng: inst.centerLng,
            });
            return { ...inst, polygonM, reachM };
          })
          .filter((i) => i.polygonM <= PULSE_MAX_M)
          .sort((a, b) => a.reachM - b.reachM);
        if (cancelled) return;
        candidates.forEach((inst) => {
          const delay = (inst.polygonM / PULSE_MAX_M) * PULSE_DURATION_MS;
          const t = setTimeout(() => {
            setMatched((cur) =>
              cur.find((m) => m.id === inst.id) ? cur : [...cur, inst]
            );
          }, Math.max(0, delay));
          timersRef.current.push(t);
        });
      } catch {}
    })();
    return () => {
      cancelled = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.emergencyId]);

  // ─── Subscribe to live dispatcher position via socket.io ───
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function doSubscribe() {
      socket.emit(
        'subscribe:emergency',
        {
          emergencyId: active.emergencyId,
          scope: 'anon',
          victimToken: active.victimToken,
        },
        () => {}
      );
    }
    function onPos(p) {
      if (p?.emergencyId === active.emergencyId) {
        setDispatcherPosition(p);
      }
    }
    function onResolved(p) {
      if (p?.emergencyId === active.emergencyId) setDispatcherPosition(null);
    }

    if (socket.connected) doSubscribe();
    socket.on('connect', doSubscribe);
    socket.on('dispatcher:position', onPos);
    socket.on('emergency:resolved', onResolved);

    return () => {
      socket.off('connect', doSubscribe);
      socket.off('dispatcher:position', onPos);
      socket.off('emergency:resolved', onResolved);
      socket.emit('unsubscribe:emergency', { emergencyId: active.emergencyId });
    };
  }, [active.emergencyId, active.victimToken]);

  const handleRecenter = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.panTo(location);
    mapRef.current.setZoom(DEFAULT_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.lat, location.lng]);

  const handleCancel = useCallback(async () => {
    if (cancelling) return;
    if (
      !confirm(
        'Cancel this SOS? Any responders en route will be told to stand down.'
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      const res = await apiFetch(
        `/emergencies/anonymous/${active.victimToken}/cancel`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || 'Could not cancel', { variant: 'error' });
        setCancelling(false);
        return;
      }
      toast('SOS cancelled');
      onClear();
    } catch (err) {
      console.error('Cancel SOS error:', err);
      toast('Network error', { variant: 'error' });
      setCancelling(false);
    }
  }, [active.victimToken, cancelling, onClear, toast]);

  const dispatch = emergency?.dispatches?.[0] || null;
  const dispatchStarted = !!dispatch?.startedAt;
  const status = emergency?.status || 'active';

  const statusLabel = (() => {
    if (status === 'resolved') return 'Help has arrived';
    if (status === 'cancelled') return 'Cancelled';
    if (status === 'expired') return 'Expired';
    if (dispatchStarted) {
      return `On the way · ${dispatch?.dispatcher?.name || ''}`.trim();
    }
    if (dispatch) {
      return `Dispatcher notified · ${dispatch?.dispatcher?.name || ''}`.trim();
    }
    return `Emergency · ${active.type}`;
  })();

  return (
    <div className="fixed inset-0 z-40 bg-white">
      <div className="relative h-full w-full">
        <MapView
          center={location}
          zoom={DEFAULT_ZOOM}
          mapTypeId="satellite"
          onMapLoad={(m) => {
            mapRef.current = m;
          }}
        >
          <PulseRings
            center={location}
            maxRadiusM={PULSE_MAX_M}
            durationMs={PULSE_DURATION_MS}
          />
          {matched.map((inst) => (
            <Marker
              key={inst.id}
              position={{ lat: inst.centerLat, lng: inst.centerLng }}
              icon={pinIcon(SEMANTIC_COLOR.responder, window.google?.maps)}
              title={`${inst.name} · ${inst.type}`}
            />
          ))}
          {dispatcherPosition && (
            <Marker
              position={{
                lat: dispatcherPosition.lat,
                lng: dispatcherPosition.lng,
              }}
              icon={pinIcon(SEMANTIC_COLOR.self, window.google?.maps)}
              title="Dispatcher en route"
              zIndex={50}
            />
          )}
        </MapView>

        {/* Top overlay */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="pointer-events-auto flex flex-col gap-2">
            <div className="rounded-md bg-brand px-4 py-2 text-sm font-bold uppercase tracking-wider text-white shadow-lg">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
              {statusLabel}
            </div>
            <div className="rounded-md bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow">
              Reported as <span className="font-bold">Anonymous</span>
            </div>
          </div>

          <div className="pointer-events-auto flex w-[200px] flex-col items-end gap-2 sm:w-[260px]">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRecenter}
                aria-label="Recenter map"
                title="Recenter"
                className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-slate-700 shadow-lg transition hover:bg-slate-100"
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
                onClick={handleCancel}
                disabled={cancelling || status !== 'active' && status !== 'dispatched'}
                title={
                  dispatchStarted
                    ? 'A dispatcher is on the way — they will be told to stand down'
                    : 'Cancel SOS'
                }
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-lg transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>

            {/* Available institutions list */}
            <div className="w-full rounded-md bg-white shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Notified institutions
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {matched.length === 0
                    ? 'Searching coverage areas…'
                    : `${matched.length} can respond`}
                </p>
              </div>
              <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
                {matched.map((inst) => (
                  <li key={inst.id} className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {inst.name}
                    </p>
                    <p className="text-[11px] text-slate-500">{inst.type}</p>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="font-semibold uppercase tracking-wider text-slate-400">
                        Distance
                      </span>
                      <span className="font-mono text-slate-700">
                        {Math.round(inst.reachM).toLocaleString()} m
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
