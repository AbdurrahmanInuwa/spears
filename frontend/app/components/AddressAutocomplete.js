'use client';

import { useEffect, useRef } from 'react';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../lib/googleMaps';

const baseInputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand';

/**
 * Address input wired to Google Places Autocomplete.
 *
 * Props:
 * - value: current text
 * - onChange(text): called as the user types
 * - onPlaceSelected({ formattedAddress, lat, lng, placeId }): called when a suggestion is picked
 * - required, placeholder, className: forwarded to the input
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  countryCode, // ISO 3166-1 alpha-2 (e.g. 'KE', 'US'); restricts suggestions
  required,
  placeholder = 'Start typing an address…',
  className = baseInputClass,
}) {
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);
  const acRef = useRef(null);

  function handleLoad(ac) {
    acRef.current = ac;
    applyCountryRestriction(ac, countryCode);
  }

  // If the country changes after mount, update the restriction live.
  function applyCountryRestriction(ac, code) {
    if (!ac) return;
    if (code) {
      ac.setComponentRestrictions({ country: code.toLowerCase() });
    } else {
      ac.setComponentRestrictions(null);
    }
  }

  // Re-apply restriction whenever countryCode changes
  useEffect(() => {
    applyCountryRestriction(acRef.current, countryCode);
  }, [countryCode]);

  function handlePlaceChanged() {
    const place = acRef.current?.getPlace();
    if (!place) return;
    const formattedAddress = place.formatted_address || place.name || '';
    const lat = place.geometry?.location?.lat();
    const lng = place.geometry?.location?.lng();
    onChange?.(formattedAddress);
    onPlaceSelected?.({
      formattedAddress,
      lat,
      lng,
      placeId: place.place_id,
    });
  }

  // Fallbacks: if the API key is missing or load fails, render a plain input
  // so the form still works.
  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || loadError || !isLoaded) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        required={required}
        placeholder={
          loadError ? 'Address (autocomplete unavailable)' : placeholder
        }
        className={className}
      />
    );
  }

  return (
    <Autocomplete
      onLoad={handleLoad}
      onPlaceChanged={handlePlaceChanged}
      options={{ fields: ['formatted_address', 'geometry', 'place_id', 'name'] }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={className}
        // Stop the browser's autofill from clobbering Google's suggestions
        autoComplete="off"
      />
    </Autocomplete>
  );
}
