import { useEffect, useRef, useState } from 'react';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
import { useStore } from '../store';
import { fetchImagery, fetchTerrain } from '../lib/elevation';
import { analyzeDay, computeHorizon } from '../lib/horizon';
import { dateStrFor, instantFor, localMidnight } from '../lib/time';
import { fetchSunshineHistory } from '../lib/history';
import * as SunCalc from 'suncalc';
import { formatLatLon } from '../lib/geo';
import { Scene } from './Scene';
import { CesiumView } from './CesiumView';
import { ControlPanel } from './ControlPanel';
import { AnalysisPanel } from './AnalysisPanel';
import type { SunHoursRequest, SunHoursResponse } from '../workers/sunhours.worker';

export function Viewer() {
  const s = useStore();
  const loc = s.location!;
  const narrow = useNarrow();
  const showAnalysis = !narrow;
  const showControls = true;

  // 1. Load terrain + imagery whenever the location or area changes.
  useEffect(() => {
    let cancelled = false;
    const { lat, lon } = loc;
    const zoom = s.areaZoom;
    s.setTerrain(null, null);
    s.setAnalysis(null, null, []);
    s.setSunHours(null);
    s.setLoading('Loading elevation data…');
    (async () => {
      try {
        const terrain = await fetchTerrain(lat, lon, zoom, (d, t) => !cancelled && s.setLoading(`Loading elevation ${d}/${t}…`));
        if (cancelled) return;
        s.setLoading('Loading satellite imagery…');
        let imagery: HTMLCanvasElement | null = null;
        try {
          imagery = await fetchImagery(lat, lon, zoom, (d, t) => !cancelled && s.setLoading(`Loading imagery ${d}/${t}…`));
        } catch {
          imagery = null;
        }
        if (cancelled) return;
        s.setTerrain(terrain, imagery);
        s.setLoading(null);
      } catch (e) {
        if (!cancelled) {
          s.setError(e instanceof Error ? e.message : 'Failed to load terrain');
          s.setLoading(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.lat, loc.lon, s.areaZoom]);

  // 2. Horizon + per-day / per-month analysis.
  const year = +s.dateStr.slice(0, 4);
  useEffect(() => {
    if (!s.terrain) return;
    const horizon = s.horizon ?? computeHorizon(s.terrain, 0, 0);
    const day = analyzeDay(s.dateStr, s.tz, loc.lat, loc.lon, horizon);
    const needMonthly = s.monthly.length !== 12 || +s.monthly[0].dateStr.slice(0, 4) !== year;
    const monthly = needMonthly
      ? Array.from({ length: 12 }, (_, m) => analyzeDay(dateStrFor(year, m, 15), s.tz, loc.lat, loc.lon, horizon, 4))
      : s.monthly;
    s.setAnalysis(horizon, day, monthly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.terrain, s.dateStr, s.tz, loc.lat, loc.lon]);

  // 3. Sun-hours heatmap in a worker (only when that layer is visible).
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  useEffect(() => {
    if (s.layer !== 'sunhours' || !s.terrain) return;
    if (s.sunHours && s.sunHours.dateStr === s.dateStr) return;
    if (!worker.current) {
      worker.current = new Worker(new URL('../workers/sunhours.worker.ts', import.meta.url), { type: 'module' });
    }
    const w = worker.current;
    const t = s.terrain;
    const factor = 2;
    const size = Math.floor(t.size / factor);
    const heights = new Float32Array(size * size);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) heights[r * size + c] = t.heights[r * factor * t.size + c * factor];
    const id = ++reqId.current;
    const dateStr = s.dateStr;
    const req: SunHoursRequest = {
      id,
      size,
      heights,
      metersPerSample: t.metersPerSample * factor,
      lat: loc.lat,
      lon: loc.lon,
      dayStart: localMidnight(dateStr, s.tz).getTime(),
      stepMinutes: 12,
    };
    s.setSunHoursBusy(true);
    const t0 = performance.now();
    const onMsg = (ev: MessageEvent<SunHoursResponse>) => {
      if (ev.data.id !== id) return;
      console.debug(`sun-hours grid ${ev.data.size}² computed in ${Math.round(performance.now() - t0)} ms`);
      s.setSunHours({ size: ev.data.size, hours: ev.data.hours, minHours: ev.data.minHours, maxHours: ev.data.maxHours, dateStr });
      s.setSunHoursBusy(false);
      w.removeEventListener('message', onMsg);
    };
    w.addEventListener('message', onMsg);
    w.postMessage(req, [heights.buffer]);
    return () => w.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.layer, s.terrain, s.dateStr, s.tz, loc.lat, loc.lon]);

  useEffect(() => () => worker.current?.terminate(), []);

  // 3b. Measured sunshine on this date in past years.
  useEffect(() => {
    let cancelled = false;
    s.setHistory(null);
    fetchSunshineHistory(loc.lat, loc.lon, s.dateStr)
      .then((h) => !cancelled && s.setHistory(h))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.lat, loc.lon, s.dateStr]);

  // 4. Playback: loops through daylight only (half an hour before sunrise to half an hour after sunset).
  useEffect(() => {
    if (!s.playing) return;
    const st0 = useStore.getState();
    const midnight = localMidnight(st0.dateStr, st0.tz).getTime();
    const t = SunCalc.getTimes(instantFor(st0.dateStr, 720, st0.tz), loc.lat, loc.lon);
    const toMin = (d: Date) => (d.getTime() - midnight) / 60000;
    const start = !t.sunrise || isNaN(t.sunrise.getTime()) ? 0 : Math.max(0, toMin(t.sunrise) - 30);
    const end = !t.sunset || isNaN(t.sunset.getTime()) ? 1439 : Math.min(1439, toMin(t.sunset) + 30);
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const st = useStore.getState();
      let m = st.minuteOfDay + st.playSpeed * dt;
      if (m > end || m < start) m = start;
      st.setMinute(m);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, loc.lat, loc.lon]);

  return (
    <div className="viewer">
      <div className="scene">{s.mode === 'buildings' ? <CesiumView /> : <Scene />}</div>
      <header className="topbar">
        <button type="button" className="ghost back" onClick={() => s.setLocation(null)} aria-label="Change location" style={s.mode === 'buildings' && s.sceneLoading ? { visibility: 'hidden' } : undefined}>
          ‹<span> Change location</span>
        </button>
        <div className="loc">
          <strong>{loc.name}</strong>
          <span className="muted small">
            {formatLatLon(loc.lat, loc.lon)}
            {s.terrain && ` · elev. ${Math.round(s.terrain.centerH)} m`}
          </span>
        </div>
      </header>
      {s.loading && s.mode === 'terrain' && (
        <div className="overlay">
          <div className="spinner big" />
          <div>{s.loading}</div>
        </div>
      )}
      {s.error && (
        <div className="overlay">
          <div className="warn">{s.error}</div>
          <button type="button" onClick={() => s.setLocation(null)}>
            Back
          </button>
        </div>
      )}
      {(s.terrain || s.mode === 'buildings') && showControls && !(s.mode === 'buildings' && s.sceneLoading) && <ControlPanel />}
      {s.terrain && s.mode === 'terrain' && showAnalysis && <AnalysisPanel />}
      {s.mode === 'terrain' && (
        <div className="attribution">
          Elevation: Mapzen/AWS Terrain Tiles · Imagery: Esri World Imagery · Geocoding: © OpenStreetMap contributors
        </div>
      )}
    </div>
  );
}
