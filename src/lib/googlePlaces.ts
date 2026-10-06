// Optional Google Places (New) search: finds businesses and apartment complexes by
// name and returns Google's own pin position. Used only when a key is configured.

export interface PlaceHit {
  id: string;
  name: string;
  address: string;
}

export function googleKey(): string {
  try {
    const k = localStorage.getItem('googleMapsKey');
    if (k) return k;
  } catch {
    /* private mode */
  }
  return (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) ?? '';
}

export async function placesAutocomplete(q: string, lat: number, lon: number, key: string): Promise<PlaceHit[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({
      input: q,
      locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 50000 } },
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Places ${res.status}`);
  const data = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[];
  };
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ id: p.placeId, name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '', address: p.structuredFormat?.secondaryText?.text ?? '' }));
}

export async function placeLocation(id: string, key: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'location,displayName,formattedAddress' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const d = (await res.json()) as { location?: { latitude: number; longitude: number }; displayName?: { text: string }; formattedAddress?: string };
  if (!d.location) return null;
  return { lat: d.location.latitude, lon: d.location.longitude, name: d.displayName?.text ?? d.formattedAddress ?? '' };
}
