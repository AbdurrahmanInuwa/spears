// Shared Google Maps JS API loader options.
// All useJsApiLoader callers in the app MUST import from here, otherwise
// @react-google-maps/api warns about inconsistent loader options.

export const googleMapsLoaderOptions = {
  id: 'google-map-script',
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  libraries: ['places'],
};
