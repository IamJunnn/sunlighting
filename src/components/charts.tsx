import { useMemo, useState } from 'react';
import type { DayAnalysis, HorizonProfile } from '../lib/horizon';
import { degrees, sunPosition, SEASON_PRESETS } from '../lib/sun';
import { dateStrFor, hoursLabel, localMidnight, minutesLabel } from '../lib/time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 24-hour strip: night / sky-lit but terrain-shaded / direct sun. Click to set the time. */
export function DayTimeline({ day, minute, onPick }: { day: DayAnalysis; minute: number; onPick: (m: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 100;
  const n = day.states.length;
  // Merge consecutive identical states into runs.
  const runs: { state: string; from: number; to: number }[] = [];
  for (let i = 0; i < n; i++) {
    const st = day.states[i];
    const last = runs[runs.length - 1];
    if (last && last.state === st) last.to = i + 1;
    else runs.push({ state: st, from: i, to: i + 1 });
  }
  const toX = (i: number) => (i / n) * W;
  const hoverMin = hover !== null ? hover : null;
  const hoverState = hoverMin !== null ? day.states[Math.min(n - 1, Math.floor(hoverMin / day.stepMinutes))] : null;
  return (
    <div className="timeline">
      <svg
        viewBox={`0 0 ${W} 14`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(((e.clientX - r.left) / r.width) * 1439));
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onPick(Math.round(((e.clientX - r.left) / r.width) * 1439));
        }}
      >
        {runs.map((r, i) => (
          <rect key={i} x={toX(r.from)} y={2} width={toX(r.to) - toX(r.from)} height={10} className={`tl-${r.state}`} />
        ))}
        <line x1={(minute / 1440) * W} x2={(minute / 1440) * W} y1={0} y2={14} className="tl-cursor" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="axis">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
      {hoverMin !== null && hoverState && (
        <div className="tooltip" style={{ left: `${(hoverMin / 1440) * 100}%` }}>
          {minutesLabel(hoverMin)} ·{' '}
          {hoverState === 'sun' ? 'direct sun' : hoverState === 'shade' ? 'terrain shadow' : 'night'}
        </div>
      )}
      <div className="legend">
        <span>
          <i className="sw tl-sun" /> Direct sun
        </span>
        <span>
          <i className="sw tl-shade" /> Terrain shadow
        </span>
        <span>
          <i className="sw tl-night" /> Night
        </span>
      </div>
    </div>
  );
}

/** Grouped bars per month: astronomical daylight vs. direct sun reaching the property. */
export function MonthlyChart({ monthly, selected, onPick }: { monthly: DayAnalysis[]; selected: string; onPick: (ds: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 150;
  const padL = 26;
  const padB = 20;
  const padT = 8;
  const plotW = W - padL - 6;
  const plotH = H - padB - padT;
  const maxH = 24;
  const groupW = plotW / 12;
  const barW = (groupW - 6) / 2;
  const y = (hours: number) => padT + plotH - (hours / maxH) * plotH;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="monthly" onMouseLeave={() => setHover(null)}>
        {[0, 6, 12, 18, 24].map((h) => (
          <g key={h}>
            <line x1={padL} x2={W - 6} y1={y(h)} y2={y(h)} className="grid" />
            <text x={padL - 4} y={y(h) + 3} className="tick" textAnchor="end">
              {h}
            </text>
          </g>
        ))}
        {monthly.map((d, i) => {
          const x0 = padL + i * groupW + 3;
          const day = d.daylightMinutes / 60;
          const sun = d.directMinutes / 60;
          const isSel = d.dateStr.slice(0, 7) === selected.slice(0, 7);
          return (
            <g
              key={d.dateStr}
              className={'month' + (isSel ? ' selected' : '') + (hover === i ? ' hover' : '')}
              onMouseEnter={() => setHover(i)}
              onClick={() => onPick(d.dateStr)}
            >
              <rect x={padL + i * groupW} y={padT} width={groupW} height={plotH} className="hit" />
              <rect x={x0} y={y(day)} width={barW} height={Math.max(0, plotH + padT - y(day))} rx={2} className="bar daylight" />
              <rect x={x0 + barW + 2} y={y(sun)} width={barW} height={Math.max(0, plotH + padT - y(sun))} rx={2} className="bar direct" />
              <text x={padL + i * groupW + groupW / 2} y={H - 6} className="tick" textAnchor="middle">
                {MONTHS[i]}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && monthly[hover] && (
        <div className="tooltip" style={{ left: `${((padL + hover * groupW + groupW / 2) / W) * 100}%` }}>
          <strong>{MONTHS[hover]} 15</strong>
          <br />
          Daylight {hoursLabel(monthly[hover].daylightMinutes)}
          <br />
          Direct sun {hoursLabel(monthly[hover].directMinutes)}
          {monthly[hover].lostMinutes > 0 && (
            <>
              <br />
              Lost to terrain {hoursLabel(monthly[hover].lostMinutes)}
            </>
          )}
        </div>
      )}
      <div className="legend">
        <span>
          <i className="sw daylight" /> Daylight (sun above horizon)
        </span>
        <span>
          <i className="sw direct" /> Direct sun at property
        </span>
      </div>
    </div>
  );
}

/** Skyline profile: terrain elevation angle by bearing with the sun's daily paths drawn over it. */
export function HorizonChart({
  horizon,
  lat,
  lon,
  tz,
  dateStr,
  minute,
}: {
  horizon: HorizonProfile;
  lat: number;
  lon: number;
  tz: string;
  dateStr: string;
  minute: number;
}) {
  const W = 320;
  const H = 130;
  const padL = 26;
  const padB = 16;
  const padT = 6;
  const plotW = W - padL - 6;
  const plotH = H - padB - padT;
  let maxDeg = 0;
  for (let i = 0; i < horizon.angles.length; i++) maxDeg = Math.max(maxDeg, degrees(horizon.angles[i]));
  const yMax = Math.max(30, Math.ceil((maxDeg + 5) / 10) * 10, lat > 60 || lat < -60 ? 30 : 70);
  const x = (bearingDeg: number) => padL + (bearingDeg / 360) * plotW;
  const y = (deg: number) => padT + plotH - (Math.max(0, deg) / yMax) * plotH;

  const skyline = Array.from(horizon.angles, (a, i) => `${x(i * horizon.stepDeg).toFixed(1)},${y(degrees(a)).toFixed(1)}`).join(' ');
  const area = `${x(0)},${y(0)} ${skyline} ${x(360)},${y(degrees(horizon.angles[0]))} ${x(360)},${y(0)}`;

  function path(ds: string): string {
    const midnight = localMidnight(ds, tz).getTime();
    const parts: string[] = [];
    let prevB = -1;
    for (let m = 0; m <= 1440; m += 5) {
      const p = sunPosition(new Date(midnight + m * 60000), lat, lon);
      const b = degrees(p.bearing);
      const alt = degrees(p.altitude);
      if (alt < -2) {
        prevB = -1;
        continue;
      }
      const jump = prevB >= 0 && Math.abs(b - prevB) > 180;
      parts.push(`${prevB < 0 || jump ? 'M' : 'L'}${x(b).toFixed(1)},${y(alt).toFixed(1)}`);
      prevB = b;
    }
    return parts.join(' ');
  }

  const year = +dateStr.slice(0, 4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seasonPaths = useMemo(() => SEASON_PRESETS.map((s) => path(dateStrFor(year, s.month, s.day))), [year, tz, lat, lon, yMax]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayPath = useMemo(() => path(dateStr), [dateStr, tz, lat, lon, yMax]);
  const now = sunPosition(new Date(localMidnight(dateStr, tz).getTime() + minute * 60000), lat, lon);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="horizon">
        {[0, 30, 60, 90].filter((d) => d <= yMax).map((d) => (
          <g key={d}>
            <line x1={padL} x2={W - 6} y1={y(d)} y2={y(d)} className="grid" />
            <text x={padL - 4} y={y(d) + 3} className="tick" textAnchor="end">
              {d}°
            </text>
          </g>
        ))}
        <polygon points={area} className="skyline" />
        {seasonPaths.map((d, i) => (
          <path key={i} d={d} className="sunpath faint" />
        ))}
        <path d={todayPath} className="sunpath" />
        {degrees(now.altitude) > 0 && <circle cx={x(degrees(now.bearing))} cy={y(degrees(now.altitude))} r={4} className="sun-now" />}
        {[
          ['N', 0],
          ['E', 90],
          ['S', 180],
          ['W', 270],
          ['N', 360],
        ].map(([l, b], i) => (
          <text key={i} x={x(+b)} y={H - 4} className="tick" textAnchor="middle">
            {l}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span>
          <i className="sw skyline" /> Terrain skyline
        </span>
        <span>
          <i className="sw sunpath" /> Sun path (selected day)
        </span>
        <span>
          <i className="sw sunpath faint" /> Solstices &amp; equinoxes
        </span>
      </div>
    </div>
  );
}
