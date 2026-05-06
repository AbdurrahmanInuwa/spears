'use client';

import {
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../lib/googleMaps';

const containerStyle = { width: '100%', height: '100%' };

export default function InstitutionReview({
  form,
  onBack,
  onEdit,
  onConfirm,
  submitting,
}) {
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);
  const hasCoords =
    typeof form.addressLat === 'number' && typeof form.addressLng === 'number';
  const center = hasCoords
    ? {
        lat: form.centerLat ?? form.addressLat,
        lng: form.centerLng ?? form.addressLng,
      }
    : null;
  const polygon = form.coveragePolygon || [];

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-2xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-extrabold text-slate-900">
          Confirm Coverage Area
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          A 2&nbsp;km radius is drawn around your institution by default. Tap{' '}
          <span className="font-semibold text-brand">Edit</span> to reshape it.
        </p>

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="h-[360px] w-full">
            {!hasCoords ? (
              <div className="flex h-full w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
                No coordinates available for this address.
              </div>
            ) : !isLoaded ? (
              <div className="flex h-full w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
                {loadError ? 'Failed to load map.' : 'Loading map…'}
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={containerStyle}
                center={center}
                zoom={14}
                options={{
                  mapTypeId: 'satellite',
                  disableDefaultUI: true,
                  zoomControl: true,
                  clickableIcons: false,
                }}
              >
                <Marker position={center} />
                {polygon.length > 0 && (
                  <Polygon
                    paths={polygon}
                    options={{
                      fillColor: '#dc2626',
                      fillOpacity: 0.18,
                      strokeColor: '#dc2626',
                      strokeOpacity: 0.9,
                      strokeWeight: 2,
                      clickable: false,
                    }}
                  />
                )}
              </GoogleMap>
            )}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Pinned Address
            </p>
            <p className="mt-1 text-sm text-slate-800">{form.address || '—'}</p>
            {form.coverageReason && (
              <p className="mt-2 text-xs text-slate-600">
                <span className="mr-1 text-brand">✨</span>
                {form.coverageReason}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onEdit}
            disabled={submitting}
            className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
