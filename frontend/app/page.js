'use client';

import { useState } from 'react';
import Link from 'next/link';
import MapView from './components/MapView';
import InfoCard from './components/InfoCard';
import SOSButton from './components/SOSButton';
import NearbyHelpModal from './components/NearbyHelpModal';

export default function HomePage() {
  const [showNearby, setShowNearby] = useState(false);

  return (
    <div className="h-full">
      <div className="mx-auto flex h-full max-w-7xl flex-col justify-center gap-3 px-6 py-4">
        {/* Top region: cards + centered map */}
        <div className="grid grid-cols-12 gap-3">
          {/* Left column: 2 stacked cards (sized to content) */}
          <div className="col-span-12 flex h-full max-h-[460px] flex-col justify-between gap-3 self-center md:col-span-3">
            <InfoCard title="Your Current Status & Location Info">
              <p className="font-medium text-slate-700">You are here</p>
              <p className="mt-1 text-xs text-slate-500">
                Location accurate to 8 m
              </p>
            </InfoCard>

            <div className="relative">
              <InfoCard title="Nearby Help Summary">
                <ul className="space-y-1">
                  <li>12 volunteers within 15 km</li>
                  <li>Nearby hospital: 2.2 km</li>
                </ul>
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
              />
            </div>
          </div>

          {/* Center: smaller map, centered in its column */}
          <div className="col-span-12 flex items-center justify-center md:col-span-6">
            <div className="h-[460px] w-full max-w-[600px] overflow-hidden rounded-2xl border border-slate-200 shadow-md">
              <MapView />
            </div>
          </div>

          {/* Right column: 2 stacked cards (sized to content) */}
          <div className="col-span-12 flex h-full max-h-[460px] flex-col justify-between gap-3 self-center md:col-span-3">
            <InfoCard title="Safety Status">
              <p className="text-slate-700">
                No current emergency in your area.
              </p>
              <p className="mt-1 font-semibold text-emerald-600">
                You are safe.
              </p>
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
            className="rounded-md border border-brand bg-white px-8 py-2 text-sm font-semibold text-brand transition hover:bg-brand hover:text-white"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
