'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../lib/auth';
import { API_URL, apiFetch } from '../lib/api';
import { getSocket } from '../lib/socket';
import {
  haversineMeters,
  minDistanceToPolygonM,
} from '../lib/geometry';

const PULSE_MAX_M = 10000;
const PULSE_DURATION_MS = 4500;
const POLL_MS = 4000;
const STORAGE_KEY = 'spaers_active_emergency_v1';

function loadFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveToStorage(data) {
  if (typeof window === 'undefined') return;
  try {
    if (data) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

const EmergencyCtx = createContext(null);

// Holds the active SOS state at the dashboard layout level so navigating
// between tabs (Emergency ↔ Family ↔ Profile …) preserves the live map,
// matched institutions, distances, and status.
export function EmergencyProvider({ children }) {
  const { user } = useAuth();

  // Persistent across tab navigation (lives on the layout)
  const [selected, setSelected] = useState('Medical');
  const [submitting, setSubmitting] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [location, setLocation] = useState(null);
  const [emergencyId, setEmergencyId] = useState(null);
  const [emergencyStatus, setEmergencyStatus] = useState('active');
  const [dispatchInfo, setDispatchInfo] = useState(null); // { startedAt, arrivedAt, dispatcher }
  const [matched, setMatched] = useState([]);
  const [distances, setDistances] = useState({});
  const [dispatcherPosition, setDispatcherPosition] = useState(null);
  const timersRef = useRef([]);

  // Rehydrate from localStorage on first mount (avoids SSR hydration
  // mismatch by deferring to useEffect rather than the useState initializer)
  useEffect(() => {
    const restored = loadFromStorage();
    if (!restored) return;
    if (restored.selected) setSelected(restored.selected);
    if (restored.triggered) {
      setTriggered(true);
      setLocation(restored.location || null);
      setEmergencyId(restored.emergencyId || null);
      setEmergencyStatus(restored.emergencyStatus || 'active');
      setDispatchInfo(restored.dispatchInfo || null);
      setMatched(restored.matched || []);
      setDistances(restored.distances || {});
    }
  }, []);

  // Persist whenever something meaningful changes
  useEffect(() => {
    if (triggered) {
      saveToStorage({
        selected,
        triggered,
        location,
        emergencyId,
        emergencyStatus,
        dispatchInfo,
        matched,
        distances,
      });
    } else {
      // Persist just the selected type when not triggered, so the chip
      // stays selected after a refresh
      saveToStorage({ selected, triggered: false });
    }
  }, [
    selected,
    triggered,
    location,
    emergencyId,
    emergencyStatus,
    dispatchInfo,
    matched,
    distances,
  ]);

  const reset = useCallback(() => {
    setTriggered(false);
    setLocation(null);
    setEmergencyId(null);
    setEmergencyStatus('active');
    setDispatchInfo(null);
    setMatched([]);
    setDistances({});
    setDispatcherPosition(null);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // ─── Subscribe to live dispatcher position via socket.io ───
  useEffect(() => {
    if (!emergencyId) return;
    const socket = getSocket();
    if (!socket) return;

    function doSubscribe() {
      socket.emit(
        'subscribe:emergency',
        { emergencyId, scope: 'citizen' },
        () => {}
      );
    }

    function onPos(p) {
      setDispatcherPosition(p);
    }
    function onResolved(p) {
      if (p?.emergencyId === emergencyId) setDispatcherPosition(null);
    }

    if (socket.connected) doSubscribe();
    socket.on('connect', doSubscribe);
    socket.on('dispatcher:position', onPos);
    socket.on('emergency:resolved', onResolved);

    // Hydrate last-known position so the pin appears immediately
    apiFetch(`/public/position/${emergencyId}`)
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (d?.position) setDispatcherPosition(d.position);
      })
      .catch(() => {});

    return () => {
      socket.off('connect', doSubscribe);
      socket.off('dispatcher:position', onPos);
      socket.off('emergency:resolved', onResolved);
      socket.emit('unsubscribe:emergency', { emergencyId });
    };
  }, [emergencyId]);

  // Start an SOS — geolocate, then create the emergency on the backend.
  const triggerSOS = useCallback(() => {
    setSubmitting(true);
    function finish(loc) {
      setLocation(loc);
      setTriggered(true);
      setSubmitting(false);
      if (!loc) return;
      apiFetch('/emergencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selected,
          lat: loc.lat,
          lng: loc.lng,
        }),
      })
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          if (data?.emergency?.id) setEmergencyId(data.emergency.id);
        })
        .catch(() => {});
    }
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => finish(null),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      finish(null);
    }
  }, [selected, user?.id]);

  // Match institutions whose coverage includes the victim
  useEffect(() => {
    if (!triggered || !location) return;
    if (matched.length > 0) return; // already populated (e.g. tab switch)
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/institutions`);
        if (!res.ok) return;
        const { institutions = [] } = await res.json();
        const candidates = institutions
          .map((inst) => {
            // Eligibility: how close the polygon edge is (0 if victim is
            // inside the polygon — used for reveal-timing along the pulse).
            const polygonM = minDistanceToPolygonM(
              location,
              inst.coveragePolygon || []
            );
            // Display: real straight-line distance to the institution's
            // building center, so the UI never shows "0 m" when the
            // victim is inside the coverage polygon.
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
    };
  }, [triggered, location, matched.length]);

  // Poll the backend for this emergency's status; auto-reset on resolved
  useEffect(() => {
    if (!emergencyId) return;
    let cancelled = false;
    let resetTimer;
    async function poll() {
      try {
        const res = await apiFetch(`/emergencies/${emergencyId}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.emergency) {
          setEmergencyStatus(data.emergency.status);
          setDispatchInfo(data.emergency.dispatches?.[0] || null);
          if (data.emergency.status === 'resolved') {
            // Brief delay so the user sees the final state
            resetTimer = setTimeout(() => {
              if (!cancelled) reset();
            }, 1500);
          }
        }
      } catch {}
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [emergencyId, user?.id, reset]);

  // Driving distance per matched institution (Routes API)
  useEffect(() => {
    if (!location || matched.length === 0) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    async function fetchDriving(dest) {
      try {
        const res = await fetch(
          'https://routes.googleapis.com/directions/v2:computeRoutes',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
            },
            body: JSON.stringify({
              origin: {
                location: {
                  latLng: { latitude: location.lat, longitude: location.lng },
                },
              },
              destination: {
                location: {
                  latLng: { latitude: dest.lat, longitude: dest.lng },
                },
              },
              travelMode: 'DRIVE',
              routingPreference: 'TRAFFIC_AWARE',
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return null;
        const route = data?.routes?.[0];
        if (!route) return null;
        return { m: route.distanceMeters };
      } catch {
        return null;
      }
    }

    matched.forEach((inst) => {
      if (inst.id in distances) return;
      setDistances((cur) => ({ ...cur, [inst.id]: null }));
      fetchDriving({ lat: inst.centerLat, lng: inst.centerLng }).then(
        (driving) => {
          setDistances((cur) => ({ ...cur, [inst.id]: { driving } }));
        }
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, location]);

  const dispatchStarted = !!dispatchInfo?.startedAt;

  return (
    <EmergencyCtx.Provider
      value={{
        // selection
        selected,
        setSelected,
        // status
        triggered,
        submitting,
        location,
        emergencyId,
        emergencyStatus,
        dispatchInfo,
        dispatchStarted,
        // results
        matched,
        distances,
        dispatcherPosition,
        // actions
        triggerSOS,
        reset,
      }}
    >
      {children}
    </EmergencyCtx.Provider>
  );
}

export function useEmergency() {
  const ctx = useContext(EmergencyCtx);
  if (!ctx) throw new Error('useEmergency must be used inside EmergencyProvider');
  return ctx;
}
