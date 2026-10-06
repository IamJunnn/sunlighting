// Sun geometry helpers built on SunCalc, expressed in the scene's local frame:
// x = east, y = up, z = south (so north is -z).

import * as SunCalc from 'suncalc';

export interface SunPos {
  /** Altitude above the horizon, radians. */
  altitude: number;
  /** Compass bearing measured clockwise from north, radians. */
  bearing: number;
}

export function sunPosition(date: Date, lat: number, lon: number): SunPos {
  // SunCalc 2.x reports degrees: altitude above the horizon, azimuth clockwise from north.
  const p = SunCalc.getPosition(date, lat, lon);
  return { altitude: (p.altitude * Math.PI) / 180, bearing: (p.azimuth * Math.PI) / 180 };
}

/** Unit vector pointing from the ground towards the sun, in scene coordinates. */
export function sunVector(s: SunPos): [number, number, number] {
  const c = Math.cos(s.altitude);
  return [c * Math.sin(s.bearing), Math.sin(s.altitude), -c * Math.cos(s.bearing)];
}

export function solarNoon(date: Date, lat: number, lon: number): Date {
  return SunCalc.getTimes(date, lat, lon).solarNoon;
}

export function degrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

export const SEASON_PRESETS = [
  { key: 'mar', label: 'Spring equinox', month: 2, day: 20 },
  { key: 'jun', label: 'Summer solstice', month: 5, day: 21 },
  { key: 'sep', label: 'Autumn equinox', month: 8, day: 22 },
  { key: 'dec', label: 'Winter solstice', month: 11, day: 21 },
] as const;
