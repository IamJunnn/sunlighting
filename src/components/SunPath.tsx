import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { TextSprite } from './TextSprite';
import { instantFor, localMidnight } from '../lib/time';
import { SEASON_PRESETS, sunPosition, sunVector } from '../lib/sun';
import { dateStrFor } from '../lib/time';

interface Props {
  lat: number;
  lon: number;
  tz: string;
  dateStr: string;
  minuteOfDay: number;
  radius: number;
  showPaths: boolean;
}

type P3 = [number, number, number];

function dayArc(dateStr: string, tz: string, lat: number, lon: number, radius: number, stepMin: number): P3[][] {
  const midnight = localMidnight(dateStr, tz).getTime();
  const segments: P3[][] = [];
  let cur: P3[] = [];
  for (let m = 0; m <= 1440; m += stepMin) {
    const p = sunPosition(new Date(midnight + m * 60000), lat, lon);
    if (p.altitude >= 0) {
      const v = sunVector(p);
      cur.push([v[0] * radius, v[1] * radius, v[2] * radius]);
    } else if (cur.length) {
      segments.push(cur);
      cur = [];
    }
  }
  if (cur.length) segments.push(cur);
  return segments;
}

export function SunPath({ lat, lon, tz, dateStr, minuteOfDay, radius, showPaths }: Props) {
  const year = +dateStr.slice(0, 4);

  const todayArc = useMemo(() => dayArc(dateStr, tz, lat, lon, radius, 3), [dateStr, tz, lat, lon, radius]);

  const seasonArcs = useMemo(
    () =>
      SEASON_PRESETS.map((s) => {
        const ds = dateStrFor(year, s.month, s.day);
        return { key: s.key, label: s.label, arcs: dayArc(ds, tz, lat, lon, radius, 6) };
      }),
    [year, tz, lat, lon, radius],
  );

  const hourMarks = useMemo(() => {
    const marks: { pos: P3; label: string }[] = [];
    for (let h = 0; h < 24; h++) {
      const p = sunPosition(instantFor(dateStr, h * 60, tz), lat, lon);
      if (p.altitude > 0.01) {
        const v = sunVector(p);
        marks.push({ pos: [v[0] * radius, v[1] * radius, v[2] * radius], label: `${h}` });
      }
    }
    return marks;
  }, [dateStr, tz, lat, lon, radius]);

  const sun = useMemo(() => {
    const p = sunPosition(instantFor(dateStr, minuteOfDay, tz), lat, lon);
    const v = sunVector(p);
    return { pos: [v[0] * radius, v[1] * radius, v[2] * radius] as P3, up: p.altitude > 0 };
  }, [dateStr, minuteOfDay, tz, lat, lon, radius]);

  const compass = useMemo(() => {
    const pts: P3[] = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      pts.push([Math.sin(a) * radius, 0, -Math.cos(a) * radius]);
    }
    return pts;
  }, [radius]);

  const sunSize = radius * 0.035;

  return (
    <group>
      {showPaths && (
        <>
          <Line points={compass} color="#ffffff" transparent opacity={0.35} lineWidth={1} />
          {(
            [
              ['N', 0, -1],
              ['E', 1, 0],
              ['S', 0, 1],
              ['W', -1, 0],
            ] as [string, number, number][]
          ).map(([l, x, z]) => (
            <TextSprite key={l} text={l} position={[x * radius * 1.07, sunSize, z * radius * 1.07]} height={sunSize * 2.2} fontSize={40} />
          ))}
          {seasonArcs.map((s) =>
            s.arcs.map((pts, i) => (
              <Line key={s.key + i} points={pts} color="#ffffff" transparent opacity={0.28} lineWidth={1} />
            )),
          )}
          {todayArc.map((pts, i) => (
            <Line key={'t' + i} points={pts} color="#ffd166" lineWidth={2.5} />
          ))}
          {hourMarks.map((m) => (
            <group key={m.label} position={m.pos}>
              <mesh>
                <sphereGeometry args={[sunSize * 0.3, 8, 8]} />
                <meshBasicMaterial color="#ffd27a" />
              </mesh>
              <TextSprite text={m.label} position={[0, sunSize * 1.4, 0]} height={sunSize * 1.4} color="#ffd27a" bold={false} />
            </group>
          ))}
        </>
      )}
      {sun.up && (
        <>
          <mesh position={sun.pos}>
            <sphereGeometry args={[sunSize, 24, 24]} />
            <meshBasicMaterial color="#fff2b0" />
          </mesh>
          <mesh position={sun.pos}>
            <sphereGeometry args={[sunSize * 1.9, 24, 24]} />
            <meshBasicMaterial color="#ffd166" transparent opacity={0.25} />
          </mesh>
          <Line points={[[0, 0, 0], sun.pos]} color="#ffd166" transparent opacity={0.5} lineWidth={1} dashed dashSize={radius * 0.03} gapSize={radius * 0.02} />
        </>
      )}
    </group>
  );
}
