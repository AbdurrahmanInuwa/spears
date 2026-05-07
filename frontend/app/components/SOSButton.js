'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useToast } from './Toast';

const TYPES = ['Shooting', 'Medical', 'Assault', 'Fire', 'Flooding'];
const COUNTDOWN_S = 5;

// Anonymous SOS button for the public home page. Two-step UX:
//   1. Click SOS → type popover
//   2. Click type → countdown overlay → POST /api/emergencies/anonymous
//   3. On success: parent (HomePage) reads localStorage and renders the
//      <AnonymousEmergencyOverlay /> instead of the home content.
//
// Props:
//   location: { lat, lng } | null  — required to enable the button
//   onTriggered(payload): called after a successful POST. payload is the
//     server response, which the parent serializes into localStorage.
//   disabled: external disable (e.g. another active emergency exists)
export default function SOSButton({ location, onTriggered, disabled = false }) {
  const toast = useToast();
  const [open, setOpen] = useState(false); // type popover
  const [pendingType, setPendingType] = useState(null); // countdown target
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_S);
  const [submitting, setSubmitting] = useState(false);
  const popoverRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    function handle(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Countdown tick
  useEffect(() => {
    if (!pendingType) return;
    if (secondsLeft <= 0) {
      fire(pendingType);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingType, secondsLeft]);

  function startCountdown(type) {
    setOpen(false);
    setSecondsLeft(COUNTDOWN_S);
    setPendingType(type);
  }

  function abortCountdown() {
    setPendingType(null);
    setSecondsLeft(COUNTDOWN_S);
  }

  async function fire(type) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/emergencies/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, lat: location.lat, lng: location.lng }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Could not send SOS', { variant: 'error' });
        setPendingType(null);
        setSubmitting(false);
        return;
      }
      onTriggered({
        emergencyId: data.emergencyId,
        victimToken: data.victimToken,
        type: data.type,
        victimLat: data.victimLat,
        victimLng: data.victimLng,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      console.error('SOS error:', err);
      toast('Network error. Please try again.', { variant: 'error' });
      setPendingType(null);
      setSubmitting(false);
    }
  }

  // Disable when there's no location yet — the SOS is useless without
  // coordinates and we don't want to fire a 400 from the backend.
  const noLocation = !location;
  const buttonDisabled = disabled || noLocation;

  return (
    <>
      <div ref={popoverRef} className="relative">
        <button
          onClick={() => !buttonDisabled && setOpen((o) => !o)}
          disabled={buttonDisabled}
          title={
            disabled
              ? 'You already have an active SOS'
              : noLocation
                ? 'Enable location first'
                : undefined
          }
          className="w-full rounded-md bg-brand px-6 py-3 text-base font-bold tracking-wide text-white shadow-md transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          SOS
        </button>
        {noLocation && !disabled && (
          <p className="mt-1 text-center text-[11px] text-slate-500">
            Enable location to use SOS
          </p>
        )}

        {open && (
          <div className="absolute bottom-full left-1/2 z-30 mb-3 flex -translate-x-1/2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_-10px_rgba(220,38,38,0.35),0_8px_20px_-6px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
            {TYPES.map((label) => (
              <button
                key={label}
                onClick={() => startCountdown(label)}
                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-brand"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Countdown overlay — z-50 so it sits above the rest of the home
          page. Tap anywhere on the Cancel button to abort. */}
      {pendingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-6">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600">
              Sending SOS
            </p>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">
              {pendingType}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Reporting your location to nearby institutions.
            </p>

            <div className="my-6 flex h-32 w-32 items-center justify-center justify-self-center rounded-full bg-rose-50 mx-auto">
              <span className="text-5xl font-extrabold text-rose-600">
                {submitting ? '…' : secondsLeft}
              </span>
            </div>

            <button
              type="button"
              onClick={abortCountdown}
              disabled={submitting}
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Cancel'}
            </button>
            <p className="mt-2 text-[11px] text-slate-400">
              SOS will fire automatically in {secondsLeft} second
              {secondsLeft === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
