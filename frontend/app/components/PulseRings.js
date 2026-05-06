'use client';

import { useEffect, useState } from 'react';
import { Circle } from '@react-google-maps/api';

const BRAND = '#dc2626';

/**
 * Two staggered pulsing circles emanating from `center`.
 * Each ring expands from 0 → maxRadiusM over durationMs and fades out.
 *
 * Must be rendered inside a <GoogleMap> (or a wrapper that forwards children
 * into one — e.g. our MapView).
 */
export default function PulseRings({
  center,
  maxRadiusM = 600,
  durationMs = 2000,
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let raf;
    let start;
    function loop(now) {
      if (start === undefined) start = now;
      setTick(now - start);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!center) return null;

  function ringProps(offsetMs) {
    const elapsed = ((tick + offsetMs) % durationMs) / durationMs; // 0..1
    return {
      radius: elapsed * maxRadiusM,
      fillOpacity: 0.18 * (1 - elapsed),
      strokeOpacity: 0.7 * (1 - elapsed),
    };
  }

  const a = ringProps(0);
  const b = ringProps(durationMs / 2); // half-cycle ahead

  return (
    <>
      <Circle
        center={center}
        radius={a.radius}
        options={{
          fillColor: BRAND,
          fillOpacity: a.fillOpacity,
          strokeColor: BRAND,
          strokeOpacity: a.strokeOpacity,
          strokeWeight: 2,
          clickable: false,
          zIndex: 1,
        }}
      />
      <Circle
        center={center}
        radius={b.radius}
        options={{
          fillColor: BRAND,
          fillOpacity: b.fillOpacity,
          strokeColor: BRAND,
          strokeOpacity: b.strokeOpacity,
          strokeWeight: 2,
          clickable: false,
          zIndex: 1,
        }}
      />
    </>
  );
}
