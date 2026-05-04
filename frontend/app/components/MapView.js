'use client';

import { useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../lib/googleMaps';

const containerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  // Default to Nairobi — replace with geolocation later
  lat: -1.286389,
  lng: 36.817223,
};

export default function MapView({
  center,
  zoom = 14,
  mapTypeId, // 'roadmap' | 'satellite' | 'hybrid' | 'terrain'
  marker = true,
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);

  const mapCenter = useMemo(() => center || defaultCenter, [center]);

  if (!apiKey) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
        Add <code className="mx-1 rounded bg-white px-1 py-0.5">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{' '}
        to .env.local to load the map.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-red-50 text-sm text-red-600">
        Failed to load Google Maps.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
        Loading map…
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={mapCenter}
      zoom={zoom}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        mapTypeId: mapTypeId || undefined,
      }}
    >
      {marker && <Marker position={mapCenter} />}
    </GoogleMap>
  );
}
