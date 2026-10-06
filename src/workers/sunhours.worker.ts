// Computes, for every cell of a (downsampled) heightmap, how many hours of
// direct sunlight it receives on a given day, accounting for terrain shadows.
// Runs off the main thread.

import { sunPosition } from '../lib/sun';

export interface SunHoursRequest {
  id: number;
  size: number;
  heights: Float32Array;
  metersPerSample: number;
  lat: number;
  lon: number;
  /** UTC ms of local midnight for the day to analyse. */
  dayStart: number;
  stepMinutes: number;
}

export interface SunHoursResponse {
  id: number;
  size: number;
  hours: Float32Array;
  minHours: number;
  maxHours: number;
}

self.onmessage = (ev: MessageEvent<SunHoursRequest>) => {
  const { id, size, heights, metersPerSample, lat, lon, dayStart, stepMinutes } = ev.data;
  const minutes = new Float32Array(size * size);
  let maxH = -Infinity;
  for (let i = 0; i < heights.length; i++) if (heights[i] > maxH) maxH = heights[i];

  const steps = Math.ceil(1440 / stepMinutes);
  for (let s = 0; s < steps; s++) {
    const d = new Date(dayStart + s * stepMinutes * 60000);
    const p = sunPosition(d, lat, lon);
    if (p.altitude <= 0.002) continue;
    // Direction *towards* the sun on the grid: +x east (col+), +y north (row-).
    const dx = Math.sin(p.bearing);
    const dy = -Math.cos(p.bearing);
    const rise = Math.tan(p.altitude) * metersPerSample; // metres of height gained per cell step
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const h0 = heights[r * size + c] + 0.5;
        let x = c + 0.5;
        let y = r + 0.5;
        let h = h0;
        let lit = true;
        // March one cell at a time until we leave the grid or rise above the highest terrain.
        for (let k = 0; k < 4096; k++) {
          x += dx;
          y += dy;
          h += rise;
          if (h >= maxH) break;
          if (x < 0 || y < 0 || x >= size - 1 || y >= size - 1) break;
          const xi = x | 0;
          const yi = y | 0;
          const fx = x - xi;
          const fy = y - yi;
          const i0 = yi * size + xi;
          const th =
            (heights[i0] * (1 - fx) + heights[i0 + 1] * fx) * (1 - fy) +
            (heights[i0 + size] * (1 - fx) + heights[i0 + size + 1] * fx) * fy;
          if (th > h) {
            lit = false;
            break;
          }
        }
        if (lit) minutes[r * size + c] += stepMinutes;
      }
    }
  }
  let maxHours = 0;
  let minHours = Infinity;
  const hours = new Float32Array(size * size);
  for (let i = 0; i < hours.length; i++) {
    hours[i] = minutes[i] / 60;
    if (hours[i] > maxHours) maxHours = hours[i];
    if (hours[i] < minHours) minHours = hours[i];
  }
  const msg: SunHoursResponse = { id, size, hours, minHours, maxHours };
  (self as unknown as Worker).postMessage(msg, [hours.buffer]);
};
