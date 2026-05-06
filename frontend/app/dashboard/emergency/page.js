'use client';

import { useRef } from 'react';
import { Marker } from '@react-google-maps/api';
import MapView from '../../components/MapView';
import PulseRings from '../../components/PulseRings';
import { pinIcon, SEMANTIC_COLOR } from '../../lib/mapPins';
import { useEmergency } from '../EmergencyContext';

const EMERGENCY_TYPES = ['Shooting', 'Medical', 'Assault', 'Fire', 'Flooding'];
const PULSE_MAX_M = 10000;
const PULSE_DURATION_MS = 4500;
const DEFAULT_ZOOM = 15;

export default function EmergencyPage() {
  const {
    selected,
    setSelected,
    triggered,
    submitting,
    location,
    matched,
    distances,
    dispatchStarted,
    dispatchInfo,
    emergencyStatus,
    dispatcherPosition,
    triggerSOS,
    reset,
  } = useEmergency();
  const mapRef = useRef(null);

  function handleRecenter() {
    if (!mapRef.current || !location) return;
    mapRef.current.panTo(location);
    mapRef.current.setZoom(DEFAULT_ZOOM);
  }

  // ─────── Triggered: full-bleed map view ───────
  if (triggered) {
    const statusLabel = (() => {
      if (emergencyStatus === 'resolved') return 'Resolved';
      if (dispatchInfo?.startedAt) {
        return `On the way · ${dispatchInfo.dispatcher?.name || ''}`.trim();
      }
      if (dispatchInfo) {
        return `Dispatcher notified · ${dispatchInfo.dispatcher?.name || ''}`.trim();
      }
      return `Emergency · ${selected}`;
    })();

    return (
      <div className="relative h-full w-full">
        <MapView
          center={location}
          zoom={DEFAULT_ZOOM}
          mapTypeId="satellite"
          onMapLoad={(m) => {
            mapRef.current = m;
          }}
        >
          {location && (
            <PulseRings
              center={location}
              maxRadiusM={PULSE_MAX_M}
              durationMs={PULSE_DURATION_MS}
            />
          )}
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
        <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-4">
          <div className="pointer-events-auto rounded-md bg-brand px-4 py-2 text-sm font-bold uppercase tracking-wider text-white shadow-lg">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
            {statusLabel}
          </div>
          <div className="pointer-events-auto flex w-[200px] flex-col items-end gap-2 sm:w-[250px]">
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
                onClick={reset}
                disabled={dispatchStarted}
                title={
                  dispatchStarted
                    ? "A dispatcher is on the way — can't cancel"
                    : 'Cancel'
                }
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            {/* Available institutions list */}
            <div className="w-full rounded-md bg-white shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Available institutions
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {matched.length === 0
                    ? 'Searching coverage areas…'
                    : `${matched.length} can respond`}
                </p>
              </div>
              <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
                {matched.map((inst) => {
                  const d = distances[inst.id];
                  const directM = Math.round(inst.reachM);
                  const meters = d?.driving ? d.driving.m : directM;
                  const isApprox = !d?.driving;
                  const distanceText = `${meters.toLocaleString()} m${
                    isApprox ? ' (approx)' : ''
                  }`;
                  const insideCoverage = inst.polygonM === 0;
                  return (
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
                          {distanceText}
                        </span>
                      </div>
                      {insideCoverage && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          You are within {inst.name}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────── Default: SOS button + radial type chips ───────
  // On narrow screens we shrink both the radius and the SOS so the chips
  // fit inside the viewport without overflow.
  const isMobile =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const radius = isMobile ? 150 : 230;
  const startAngleDeg = -90;

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
      <div className="relative flex h-[360px] w-[360px] max-w-full items-center justify-center sm:h-[480px] sm:w-[480px]">
        {EMERGENCY_TYPES.map((type, idx) => {
          const angle =
            ((startAngleDeg + (idx * 360) / EMERGENCY_TYPES.length) * Math.PI) /
            180;
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);
          const isActive = selected === type;
          return (
            <button
              key={type}
              onClick={() => setSelected(type)}
              style={{
                transform: `translate(${x}px, ${y}px)`,
              }}
              className={`absolute flex min-w-[120px] items-center justify-center rounded-md border px-6 py-3 text-sm font-semibold shadow-sm transition ${
                isActive
                  ? 'border-brand bg-brand text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-brand hover:text-brand'
              }`}
            >
              {type}
            </button>
          );
        })}

        {/* Central SOS button */}
        <div className="relative flex h-40 w-40 sm:h-64 sm:w-64 items-center justify-center">
          <span
            aria-hidden="true"
            className="sos-ring pointer-events-none absolute inset-0 rounded-full bg-brand"
          />
          <span
            aria-hidden="true"
            className="sos-ring-delay pointer-events-none absolute inset-0 rounded-full bg-brand"
          />
          <button
            onClick={triggerSOS}
            disabled={submitting}
            className={`relative z-10 flex h-40 w-40 sm:h-64 sm:w-64 items-center justify-center rounded-full bg-brand text-4xl font-extrabold tracking-wider text-white shadow-2xl transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-80 ${
              submitting ? 'animate-pulse' : ''
            }`}
            style={{
              boxShadow:
                '0 25px 60px -10px rgba(220,38,38,0.5), 0 10px 25px -8px rgba(0,0,0,0.2)',
            }}
          >
            {submitting ? '…' : 'SOS'}
          </button>
        </div>
      </div>
    </div>
  );
}
