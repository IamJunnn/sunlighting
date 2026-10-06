import type { Layer, Location, ViewMode } from '../store';

export interface HashState {
  location: Location;
  dateStr?: string;
  minuteOfDay?: number;
  layer?: Layer;
  mode?: ViewMode;
}

/** Parse a deep link: #lat,lon,name&d=YYYY-MM-DD&t=HH:MM&layer=sunhours */
export function parseHash(): HashState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.slice(1);
  if (!raw) return null;
  const [locPart, ...rest] = raw.split('&');
  const h = decodeURIComponent(locPart);
  const m = h.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(.*))?$/);
  if (!m) return null;
  const lat = +m[1];
  const lon = +m[2];
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  const out: HashState = { location: { lat, lon, name: m[3] || `${lat.toFixed(4)}, ${lon.toFixed(4)}` } };
  for (const kv of rest) {
    const [k, v] = kv.split('=');
    if (k === 'd' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.dateStr = v;
    if (k === 't' && /^\d{1,2}:\d{2}$/.test(v)) {
      const [hh, mm] = v.split(':').map(Number);
      out.minuteOfDay = Math.min(1439, hh * 60 + mm);
    }
    if (k === 'layer' && (v === 'satellite' || v === 'sunhours')) out.layer = v;
    if (k === 'view' && (v === 'terrain' || v === 'buildings')) out.mode = v;
  }
  return out;
}

export function hashFor(loc: Location | null, dateStr: string, minuteOfDay: number, layer: Layer, mode: ViewMode = 'buildings'): string {
  if (!loc) return '';
  const m = Math.round(minuteOfDay);
  const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  let s = `#${loc.lat.toFixed(5)},${loc.lon.toFixed(5)},${encodeURIComponent(loc.name)}&d=${dateStr}&t=${t}`;
  if (layer !== 'satellite') s += `&layer=${layer}`;
  if (mode !== 'buildings') s += `&view=${mode}`;
  return s;
}
