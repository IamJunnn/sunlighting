import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store';
import { formatLatLon } from '../lib/geo';
import { googleKey, placeLocation, placesAutocomplete } from '../lib/googlePlaces';
import { styleFor, type BasemapId } from '../lib/mapStyles';

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}


export function LocationPicker() {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const setLocation = useStore((s) => s.setLocation);

  useEffect(() => {
    if (!mapRef.current || map.current) return;
    const m = new maplibregl.Map({
      container: mapRef.current,
      style: styleFor('satellite'),
      center: [0, 25],
      zoom: 1.6,
    });
    m.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    // Start near the visitor without asking for permission: a coarse IP lookup, no account needed.
    fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) })
      .then((r) => r.json())
      .then((d: { latitude?: number; longitude?: number }) => {
        if (d.latitude && d.longitude && m.getZoom() < 3) m.jumpTo({ center: [d.longitude, d.latitude], zoom: 10 });
      })
      .catch(() => {});
    m.on('click', (e: maplibregl.MapMouseEvent) => {
      place(e.lngLat.lat, e.lngLat.lng, formatLatLon(e.lngLat.lat, e.lngLat.lng), false);
      nameFor(e.lngLat.lat, e.lngLat.lng).then((n) => n && setPicked((p) => (p && p.lat === e.lngLat.lat ? { ...p, name: n } : p)));
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function place(lat: number, lon: number, name: string, fly: boolean) {
    const m = map.current;
    if (!m) return;
    if (!marker.current) {
      marker.current = new maplibregl.Marker({ color: '#38bdf8', draggable: true }).setLngLat([lon, lat]).addTo(m);
      marker.current.on('dragend', () => {
        const ll = marker.current!.getLngLat();
        setPicked({ lat: ll.lat, lon: ll.lng, name: formatLatLon(ll.lat, ll.lng) });
        nameFor(ll.lat, ll.lng).then((n) => n && setPicked((p) => (p && p.lat === ll.lat ? { ...p, name: n } : p)));
      });
    } else {
      marker.current.setLngLat([lon, lat]);
    }
    setPicked({ lat, lon, name });
    if (fly) m.flyTo({ center: [lon, lat], zoom: Math.max(m.getZoom(), 17), duration: 1200 });
  }

  const debounce = useRef<number | undefined>(undefined);
  const reqSeq = useRef(0);

  async function geocode(q: string): Promise<SearchResult[]> {
    const m = map.current;
    const c = m ? m.getCenter() : { lat: 0, lng: 0 };
    const out: SearchResult[] = [];
    // Google Places knows businesses and apartment complexes by name; use it whenever a key is set.
    if (gKey) {
      try {
        const hits = await placesAutocomplete(q, c.lat, c.lng, gKey);
        if (hits.length) {
          placeIds.current = {};
          return hits.map((h) => {
            const display = [h.name, h.address].filter(Boolean).join(', ');
            placeIds.current[display] = h.id;
            return { display_name: display, lat: '', lon: '' };
          });
        }
      } catch {
        /* fall back to the free geocoders */
      }
    }
    // Keep only results that actually contain the words typed (the geocoders fuzzy-match freely).
    const stop = new Set(['apt', 'apts', 'apartment', 'apartments', 'the', 'of', 'at', 'in', 'ut', 'utah', 'usa', 'north', 'south', 'east', 'west']);
    const strict = (rs: SearchResult[], text: string) => {
      const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !stop.has(w));
      return rs.filter((r) => {
        const n = r.display_name.toLowerCase();
        return words.every((w) => n.includes(w));
      });
    };
    // A query starting with a house number is an address: Nominatim matches those exactly,
    // but only when grid-style abbreviations are spelled out ("200 S 100 E" -> "200 South 100 East").
    if (/^\d/.test(q)) {
      const full = q
        .replace(/\b([NSEW])\b\.?/gi, (m) => ({ n: 'North', s: 'South', e: 'East', w: 'West' })[m[0].toLowerCase() as 'n' | 's' | 'e' | 'w'])
        .replace(/\s+/g, ' ');
      const variants = Array.from(new Set([full, q]));
      const lookups = variants.map(async (variant) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(variant)}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
        const rs = strict((await res.json()) as SearchResult[], full);
        if (!rs.length) throw new Error('no match');
        return rs;
      });
      try {
        return await Promise.any(lookups);
      } catch {
        return []; // an address the map database does not know; the name geocoder would only return junk
      }
    }
    // Photon (OpenStreetMap data) understands business and complex names and can be biased to the map.
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${c.lat}&lon=${c.lng}&limit=6&lang=en`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const data = (await res.json()) as { features: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }[] };
      for (const f of data.features) {
        const pr = f.properties;
        const name = [pr.name, [pr.housenumber, pr.street].filter(Boolean).join(' '), pr.city || pr.county, pr.state].filter(Boolean).join(', ');
        if (name) out.push({ display_name: name, lat: String(f.geometry.coordinates[1]), lon: String(f.geometry.coordinates[0]) });
      }
    } catch {
      /* fall through to Nominatim */
    }
    if (out.length === 0) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
        out.push(...((await res.json()) as SearchResult[]));
      } catch {
        /* no results */
      }
    }
    return strict(out, q);
  }

  function onQueryChange(v: string) {
    setQuery(v);
    setResults([]); // never show answers to a previous query
    setSearched(false);
    window.clearTimeout(debounce.current);
    if (v.trim().length < 3) {
      setResults([]);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      const seq = ++reqSeq.current;
      setSearching(true);
      let rs: SearchResult[] = [];
      try {
        rs = await geocode(v.trim());
      } catch {
        rs = [];
      }
      if (seq !== reqSeq.current) return; // a newer query is in flight; drop this stale answer
      setResults(rs);
      setSearching(false);
      setSearched(true);
    }, 700);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    window.clearTimeout(debounce.current);
    const seq = ++reqSeq.current;
    setSearching(true);
    const data = await geocode(query.trim());
    if (seq !== reqSeq.current) return;
    setResults(data);
    setSearching(false);
    setSearched(true);
    if (data.length === 1) choose(data[0]);
  }

  async function choose(r: SearchResult) {
    setResults([]);
    setSearched(false);
    const pid = placeIds.current[r.display_name];
    if (pid && gKey) {
      const loc = await placeLocation(pid, gKey);
      if (loc) {
        place(loc.lat, loc.lon, loc.name || r.display_name.split(',')[0], true);
        return;
      }
    }
    place(parseFloat(r.lat), parseFloat(r.lon), r.display_name.split(',').slice(0, 2).join(','), true);
  }

  /** Street address for a point, from Nominatim's reverse geocoder. */
  async function nameFor(lat: number, lon: number): Promise<string | null> {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lon}`, { headers: { Accept: 'application/json' } });
      const d = (await res.json()) as { address?: Record<string, string> };
      const a = d.address ?? {};
      const street = [a.house_number, a.road].filter(Boolean).join(' ');
      const town = a.city || a.town || a.village || a.suburb || a.county;
      return [street, town].filter(Boolean).join(', ') || null;
    } catch {
      return null;
    }
  }

  const [geoError, setGeoError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>('satellite');
  const [gKey, setGKey] = useState(googleKey());
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const placeIds = useRef<Record<string, string>>({});

  function switchBasemap(b: BasemapId) {
    setBasemap(b);
    map.current?.setStyle(styleFor(b));
  }
  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('This browser has no location service.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        place(pos.coords.latitude, pos.coords.longitude, 'My location', true);
        nameFor(pos.coords.latitude, pos.coords.longitude).then((n) => n && setPicked((p) => (p ? { ...p, name: n } : p)));
      },
      () => setGeoError('Location blocked. Allow it in the browser, or type the address.'),
      { timeout: 10000 },
    );
  }

  return (
    <div className="picker">
      <div ref={mapRef} className="picker-map" />
      <div className="picker-panel">
        <h1>
          <span className="logo">☀</span> SunLighting
        </h1>
        <form onSubmit={search} className="search">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Address or apartment name…"
            aria-label="Search location"
          />
          <button type="submit" disabled={searching}>
            {searching ? '…' : 'Search'}
          </button>
        </form>
        {searching && <div className="muted small"><span className="spinner" /> Searching…</div>}
        {searched && !searching && results.length === 0 && !picked && query.trim().length >= 3 && (
          <div className="notfound">
            <strong>Not in the free map data.</strong>
            {/^\d/.test(query.trim()) ? (
              <span className="muted small">Check the house number and street, or click the building on the map.</span>
            ) : gKey ? (
              <span className="muted small">Google Places found nothing either. Try the street address or click the building on the map.</span>
            ) : (
              <>
                <span className="muted small">
                  Business and apartment names need Google Places. Until a key is added, type the street address (number, street, city) or click the building on the map.
                </span>
                <button type="button" className="small" onClick={() => setShowKey(true)}>
                  Add a Google key (free)
                </button>
              </>
            )}
          </div>
        )}
        {results.length > 0 && (
          <ul className="results">
            {results.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => choose(r)}>
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" className="ghost" onClick={useMyLocation}>
            ◎ Use my location
          </button>
          <span className="muted small">or click anywhere on the map</span>
        </div>
        {geoError && <div className="warn small">{geoError}</div>}
        <div className="row">
          <div className="seg small-seg">
            {(['map', 'satellite', 'terrain'] as const).map((b) => (
              <button key={b} type="button" className={basemap === b ? 'active' : ''} onClick={() => switchBasemap(b)}>
                {b[0].toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>
          {!gKey && (
            <button type="button" className="ghost small" onClick={() => setShowKey(!showKey)}>
              Search by business name…
            </button>
          )}
        </div>
        {showKey && !gKey && (
          <div className="token-form">
            <div className="muted small">
              1. Go to{' '}
              <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noreferrer">
                Google Cloud → Maps Platform → Credentials
              </a>{' '}
              and create an API key. 2. Enable <strong>Places API (New)</strong> for the project. 3. Restrict the key to this site. Google includes
              about $200 of free use a month. The key stays in this browser only.
            </div>
            <input type="text" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value.trim())} placeholder="AIza…" aria-label="Google Maps API key" spellCheck={false} />
            <button
              type="button"
              className="primary"
              onClick={() => {
                try {
                  localStorage.setItem('googleMapsKey', keyDraft);
                } catch {
                  /* private mode */
                }
                setGKey(keyDraft);
                setShowKey(false);
              }}
            >
              Save key
            </button>
          </div>
        )}
        {picked && <div className="muted small">Pin on the wrong spot? Drag it onto your building.</div>}
        {picked && (
          <div className="picked">
            <div>
              <div className="picked-name">{picked.name}</div>
              <div className="muted small">{formatLatLon(picked.lat, picked.lon)}</div>
            </div>
            <button type="button" className="primary" onClick={() => setLocation(picked)}>
              Analyze sunlight
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
