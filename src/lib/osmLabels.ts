// Street names, house numbers and named buildings around a point, from the
// OpenStreetMap Overpass API, for labelling the 3D view.

export interface MapLabel {
  lat: number;
  lon: number;
  text: string;
  kind: 'street' | 'number' | 'place';
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (a.lat - b.lat) * 111320;
  const dx = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export async function fetchLabels(lat: number, lon: number, radius = 700): Promise<MapLabel[]> {
  const q = `[out:json][timeout:25];
(
  way(around:${radius},${lat},${lon})[highway][name];
  way(around:${radius * 0.7},${lat},${lon})["addr:housenumber"];
  node(around:${radius * 0.7},${lat},${lon})["addr:housenumber"];
  way(around:${radius},${lat},${lon})[building][name];
  node(around:${radius},${lat},${lon})[name][amenity];
  node(around:${radius},${lat},${lon})[name][shop];
);
out center geom;`;
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  let data: { elements: OverpassElement[] } | null = null;
  for (const url of mirrors) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      if (!res.ok) continue;
      data = (await res.json()) as { elements: OverpassElement[] };
      break;
    } catch {
      /* try the next mirror */
    }
  }
  if (!data) throw new Error('All Overpass mirrors failed');
  const out: MapLabel[] = [];
  const streetSeen: { name: string; lat: number; lon: number }[] = [];
  for (const el of data.elements) {
    const t = el.tags ?? {};
    if (el.type === 'way' && t.highway && t.name && el.geometry?.length) {
      // One label per ~250 m of street, de-duplicated by name.
      const g = el.geometry;
      const candidates = g.length > 6 ? [g[Math.floor(g.length / 4)], g[Math.floor(g.length / 2)], g[Math.floor((3 * g.length) / 4)]] : [g[Math.floor(g.length / 2)]];
      for (const c of candidates) {
        if (metres(c, { lat, lon }) > radius) continue;
        if (streetSeen.some((s) => s.name === t.name && metres(s, c) < 220)) continue;
        streetSeen.push({ name: t.name, lat: c.lat, lon: c.lon });
        out.push({ lat: c.lat, lon: c.lon, text: t.name, kind: 'street' });
      }
      continue;
    }
    const p = el.type === 'node' ? { lat: el.lat!, lon: el.lon! } : el.center;
    if (!p) continue;
    if (t.name && (t.building || t.amenity || t.shop)) {
      out.push({ lat: p.lat, lon: p.lon, text: t.name, kind: 'place' });
    } else if (t['addr:housenumber']) {
      const unit = t['addr:unit'] ? ` #${t['addr:unit']}` : '';
      out.push({ lat: p.lat, lon: p.lon, text: t['addr:housenumber'] + unit, kind: 'number' });
    }
  }
  return out;
}
