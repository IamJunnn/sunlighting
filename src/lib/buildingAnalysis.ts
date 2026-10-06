// Direct-sun analysis for a single window against real 3D geometry (Google
// photorealistic tiles + terrain) by ray-casting from the window towards the
// sun for every few minutes of the day.

import * as Cesium from 'cesium';
import { horizonAt, type DayAnalysis, type HorizonProfile, type LightState } from './horizon';
import { localMidnight } from './time';
import { sunPosition } from './sun';
import * as SunCalc from 'suncalc';

/** Unit vector towards the sun in Earth-fixed coordinates, from a local ENU frame at `origin`. */
export function sunDirectionECEF(origin: Cesium.Cartesian3, date: Date, lat: number, lon: number): Cesium.Cartesian3 | null {
  const p = sunPosition(date, lat, lon);
  if (p.altitude <= 0) return null;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const local = new Cesium.Cartesian3(
    Math.cos(p.altitude) * Math.sin(p.bearing),
    Math.cos(p.altitude) * Math.cos(p.bearing),
    Math.sin(p.altitude),
  );
  const dir = Cesium.Matrix4.multiplyByPointAsVector(enu, local, new Cesium.Cartesian3());
  return Cesium.Cartesian3.normalize(dir, dir);
}

interface PickResult {
  position?: Cesium.Cartesian3;
}

/** True when something solid lies between `origin` and the sun within `maxDistance` metres. */
export function isShaded(scene: Cesium.Scene, origin: Cesium.Cartesian3, dir: Cesium.Cartesian3, exclude: unknown[], maxDistance = 6000): boolean {
  const ray = new Cesium.Ray(origin, dir);
  // pickFromRay is an experimental Scene API (present since Cesium 1.44) that is not in the type definitions.
  const pick = (scene as unknown as { pickFromRay: (r: Cesium.Ray, ex: unknown[], w?: number) => PickResult | undefined }).pickFromRay(ray, exclude, 0.2);
  if (!pick || !pick.position) return false;
  return Cesium.Cartesian3.distance(origin, pick.position) < maxDistance;
}

export function analyzeWindowDay(
  scene: Cesium.Scene,
  origin: Cesium.Cartesian3,
  lat: number,
  lon: number,
  dateStr: string,
  tz: string,
  exclude: unknown[],
  stepMinutes = 10,
  terrainHorizon: HorizonProfile | null = null,
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
    const dir = sunDirectionECEF(origin, d, lat, lon);
    let s: LightState = 'night';
    if (dir) {
      daylight += stepMinutes;
      if (!sunrise) sunrise = d;
      sunset = d;
      const p = sunPosition(d, lat, lon);
      const behindMountains = terrainHorizon ? p.altitude <= horizonAt(terrainHorizon, p.bearing) : false;
      if (behindMountains || isShaded(scene, origin, dir, exclude)) {
        s = 'shade';
      } else {
        s = 'sun';
        direct += stepMinutes;
        if (!effSunrise) effSunrise = d;
        effSunset = d;
      }
    }
    states[i] = s;
  }
  // Exact astronomical sunrise/sunset (the samples above are only stepMinutes apart).
  const noon = new Date(midnight + 12 * 3600000);
  const times = SunCalc.getTimes(noon, lat, lon);
  if (times.sunrise && !isNaN(times.sunrise.getTime())) sunrise = times.sunrise;
  if (times.sunset && !isNaN(times.sunset.getTime())) sunset = times.sunset;
  // Refine the window's first and last direct light to the minute.
  const lit = (d: Date) => {
    const dir = sunDirectionECEF(origin, d, lat, lon);
    if (!dir) return false;
    const p = sunPosition(d, lat, lon);
    if (terrainHorizon && p.altitude <= horizonAt(terrainHorizon, p.bearing)) return false;
    return !isShaded(scene, origin, dir, exclude);
  };
  const refine = (from: Date, towardsEarlier: boolean): Date => {
    let best = from;
    for (let m = 1; m < stepMinutes; m++) {
      const d = new Date(from.getTime() + (towardsEarlier ? -m : m) * 60000);
      if (lit(d)) best = d;
      else break;
    }
    return best;
  };
  if (effSunrise) effSunrise = refine(effSunrise, true);
  if (effSunset) effSunset = refine(effSunset, false);
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
