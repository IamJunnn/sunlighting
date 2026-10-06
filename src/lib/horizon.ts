// Terrain-aware sunlight analysis at a single point: computes the local horizon
// profile (how high the surrounding terrain rises in every direction) and uses it
// to decide, minute by minute, whether the sun actually reaches the property.

import { heightAtENU, type TerrainData } from './elevation';
import { localMidnight } from './time';
import { sunPosition } from './sun';

/** Eye/roof height above ground used for the horizon scan (metres). */
export const OBSERVER_HEIGHT = 2;

export interface HorizonProfile {
  /** Elevation angle of the terrain horizon, in radians, for each azimuth step. */
  angles: Float32Array;
  stepDeg: number;
}

/**
 * Scan outward from (east, north) in every direction and record the highest
 * terrain elevation angle. Rays march until they leave the grid.
 */
export function computeHorizon(t: TerrainData, east: number, north: number, stepDeg = 1): HorizonProfile {
  const n = Math.round(360 / stepDeg);
  const angles = new Float32Array(n);
  const h0 = heightAtENU(t, east, north) + OBSERVER_HEIGHT;
  const half = t.widthMeters / 2;
  const step = t.metersPerSample * 0.75;
  for (let i = 0; i < n; i++) {
    const b = ((i * stepDeg) * Math.PI) / 180; // bearing from north, clockwise
    const dx = Math.sin(b);
    const dy = Math.cos(b);
    let maxTan = -Infinity;
    for (let d = step; ; d += step) {
      const e = east + dx * d;
      const nn = north + dy * d;
      if (e < -half || e > half || nn < -half || nn > half) break;
      const h = heightAtENU(t, e, nn);
      const tan = (h - h0) / d;
      if (tan > maxTan) maxTan = tan;
    }
    angles[i] = maxTan === -Infinity ? 0 : Math.max(0, Math.atan(maxTan));
  }
  return { angles, stepDeg };
}

export function horizonAt(h: HorizonProfile, bearingRad: number): number {
  let deg = ((bearingRad * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  const i = Math.round(deg / h.stepDeg) % h.angles.length;
  return h.angles[i];
}

export type LightState = 'sun' | 'shade' | 'night';

export interface DayAnalysis {
  dateStr: string;
  /** Minute-of-day resolution samples: 'sun' = direct sunlight, 'shade' = sun up but behind terrain. */
  states: LightState[];
  stepMinutes: number;
  sunrise: Date | null;
  sunset: Date | null;
  effectiveSunrise: Date | null;
  effectiveSunset: Date | null;
  daylightMinutes: number;
  directMinutes: number;
  /** Minutes of daylight lost to terrain shadow. */
  lostMinutes: number;
}

export function analyzeDay(
  dateStr: string,
  tz: string,
  lat: number,
  lon: number,
  horizon: HorizonProfile,
  stepMinutes = 2,
): DayAnalysis {
  const midnight = localMidnight(dateStr, tz).getTime();
  const steps = Math.ceil(1440 / stepMinutes);
  const states: LightState[] = new Array(steps);
  let sunrise: Date | null = null;
  let sunset: Date | null = null;
  let effSunrise: Date | null = null;
  let effSunset: Date | null = null;
  let daylight = 0;
  let direct = 0;
  for (let i = 0; i < steps; i++) {
    const d = new Date(midnight + i * stepMinutes * 60000);
    const p = sunPosition(d, lat, lon);
    let s: LightState = 'night';
    if (p.altitude > 0) {
      daylight += stepMinutes;
      if (!sunrise) sunrise = d;
      sunset = d;
      if (p.altitude > horizonAt(horizon, p.bearing)) {
        s = 'sun';
        direct += stepMinutes;
        if (!effSunrise) effSunrise = d;
        effSunset = d;
      } else {
        s = 'shade';
      }
    }
    states[i] = s;
  }
  return {
    dateStr,
    states,
    stepMinutes,
    sunrise,
    sunset,
    effectiveSunrise: effSunrise,
    effectiveSunset: effSunset,
    daylightMinutes: daylight,
    directMinutes: direct,
    lostMinutes: daylight - direct,
  };
}

/** Light state at an exact instant. */
export function stateAt(date: Date, lat: number, lon: number, horizon: HorizonProfile): LightState {
  const p = sunPosition(date, lat, lon);
  if (p.altitude <= 0) return 'night';
  return p.altitude > horizonAt(horizon, p.bearing) ? 'sun' : 'shade';
}
