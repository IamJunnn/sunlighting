import { useState } from 'react';
import { useStore } from '../store';
import { degrees, sunPosition } from '../lib/sun';
import { dateStrFor, formatTime, hoursLabel, instantFor, minutesLabel, todayStr, tzOffsetMinutes } from '../lib/time';
import { DayTimeline, MonthlyChart } from './charts';

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return dateStrFor(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

export function ControlPanel() {
  const s = useStore();
  const [year, month, dayOfMonth] = [+s.dateStr.slice(0, 4), +s.dateStr.slice(5, 7) - 1, +s.dateStr.slice(8, 10)];
  const weekday = new Date(Date.UTC(year, month, dayOfMonth)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' });
  const [tokenDraft, setTokenDraft] = useState(s.ionToken);
  const [showToken, setShowToken] = useState(!s.ionToken);
  const loc = s.location!;
  const instant = instantFor(s.dateStr, s.minuteOfDay, s.tz);
  const sun = sunPosition(instant, loc.lat, loc.lon);
  const off = tzOffsetMinutes(s.tz, instant);
  const offLabel = `UTC${off >= 0 ? '+' : '−'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ':' + String(Math.abs(off) % 60).padStart(2, '0') : ''}`;

  return (
    <div className="panel controls">
      {!s.ionToken && (
      <section>
        {(
          <div className="token">
            <button type="button" className="ghost small" onClick={() => setShowToken(!showToken)}>
              {s.ionToken ? (showToken ? 'Hide token' : 'Cesium ion token ✓') : 'Set up 3D buildings (free token)'}
            </button>
            {showToken && (
              <div className="token-form">
                <div className="muted small">
                  Google's 3D buildings stream through Cesium ion. Create a free account at{' '}
                  <a href="https://ion.cesium.com/signup" target="_blank" rel="noreferrer">
                    ion.cesium.com
                  </a>
                  , open <strong>Access Tokens</strong>, copy the default token and paste it here. Then add{' '}
                  <strong>Google Photorealistic 3D Tiles</strong> (asset 2275207) from the Asset Depot to your account.
                </div>
                <input
                  type="text"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value.trim())}
                  placeholder="eyJhbGciOi…"
                  aria-label="Cesium ion access token"
                  spellCheck={false}
                />
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      s.setIonToken(tokenDraft);
                      setShowToken(false);
                    }}
                  >
                    Save token
                  </button>
                  {s.ionToken && (
                    <button type="button" onClick={() => { s.setIonToken(''); setTokenDraft(''); }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      )}

      <section>
        <div className="section-title">Date</div>
        <div className="row">
          <button type="button" className="icon" onClick={() => s.setDateStr(shiftDate(s.dateStr, -1))} aria-label="Previous day">
            ‹
          </button>
          <select value={month} onChange={(e) => s.setDateStr(dateStrFor(year, +e.target.value, Math.min(dayOfMonth, daysIn(year, +e.target.value))))} aria-label="Month">
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select value={dayOfMonth} onChange={(e) => s.setDateStr(dateStrFor(year, month, +e.target.value))} aria-label="Day">
            {Array.from({ length: daysIn(year, month) }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <button type="button" className="icon" onClick={() => s.setDateStr(shiftDate(s.dateStr, 1))} aria-label="Next day">
            ›
          </button>
          {s.dateStr !== todayStr() && (
            <button type="button" className="ghost small" onClick={() => s.setDateStr(todayStr())}>
              Today
            </button>
          )}
        </div>
        <div className="muted small">{weekday}, {MONTHS[month]} {dayOfMonth}</div>
      </section>

      <section>
        <div className="section-title">
          Time <span className="muted small">({s.tz.replace(/_/g, ' ')}, {offLabel})</span>
        </div>
        <div className="time-display">{minutesLabel(s.minuteOfDay)}</div>
        <input
          type="range"
          min={0}
          max={1439}
          step={1}
          value={s.minuteOfDay}
          onChange={(e) => {
            s.setPlaying(false);
            s.setMinute(+e.target.value);
          }}
          aria-label="Time of day"
        />
        <div className="row">
          <button type="button" className={'primary' + (s.playing ? ' active' : '')} onClick={() => s.setPlaying(!s.playing)}>
            {s.playing ? '❚❚ Pause' : '▶ Play day'}
          </button>
          <select value={s.playSpeed} onChange={(e) => s.setPlaySpeed(+e.target.value)} aria-label="Playback speed">
            <option value={5}>Slow</option>
            <option value={20}>Normal</option>
            <option value={60}>Fast</option>
            <option value={200}>Very fast</option>
          </select>
        </div>
        {s.windowPos && (
          <label className="check">
            <input type="checkbox" checked={s.showSunRay} onChange={(e) => s.setShowSunRay(e.target.checked)} /> Show line from window to sun
          </label>
        )}
        <div className="stats">
          <div>
            <span className="muted small">Sun altitude</span>
            <strong>{degrees(sun.altitude).toFixed(1)}°</strong>
          </div>
          <div>
            <span className="muted small">Sun bearing</span>
            <strong>{degrees(sun.bearing).toFixed(0)}°</strong>
          </div>
        </div>
      </section>

      {s.mode === 'buildings' && (s.windowBusy || s.windowDay) && (
        <section className="window-section">
          {s.windowBusy && (
            <div className="row">
              <span className="spinner" /> <span className="muted small">{s.windowBusy}</span>
            </div>
          )}
          {s.windowDay && (
            <div className={s.windowBusy ? 'dimmed' : ''}>
              {s.noBuildings !== false && s.noBuildings !== null && (
                <div className="warn small">Terrain and sun only: no 3D buildings exist here, so neighbouring buildings are not counted.</div>
              )}
              <div className="hero">
                <div className="hero-num">{hoursLabel(s.windowDay.directMinutes)}</div>
                <div className="hero-sub">
                  direct sun on this window
                  {s.windowDay.lostMinutes > 0 && (
                    <>
                      {' '}
                      · <span className="warn">{hoursLabel(s.windowDay.lostMinutes)} blocked</span>
                    </>
                  )}
                </div>
              </div>
              <table className="times">
                <tbody>
                  <tr>
                    <td className="muted">Sun on window</td>
                    <td>{formatTime(s.windowDay.effectiveSunrise, s.tz)}</td>
                    <td>{formatTime(s.windowDay.effectiveSunset, s.tz)}</td>
                  </tr>
                  <tr>
                    <td className="muted">Sunrise / sunset</td>
                    <td>{formatTime(s.windowDay.sunrise, s.tz)}</td>
                    <td>{formatTime(s.windowDay.sunset, s.tz)}</td>
                  </tr>
                </tbody>
              </table>
              <DayTimeline day={s.windowDay} minute={s.minuteOfDay} onPick={(m) => { s.setPlaying(false); s.setMinute(m); }} />
              {s.windowMonthly.length === 12 ? (
                <MonthlyChart monthly={s.windowMonthly} selected={s.dateStr} onPick={(ds) => s.setDateStr(ds)} />
              ) : (
                <button type="button" onClick={() => (window as unknown as { __runWindowAnalysis?: (y: boolean) => void }).__runWindowAnalysis?.(true)}>
                  Whole year
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {s.history && s.history.years.length > 0 && (
        <section>
          <div className="section-title">Actual sun on {MONTHS[month]} {dayOfMonth}, past years</div>
          <div className="hero">
            <div className="hero-num">{Math.round(s.history.sunnyFraction * 100)}%</div>
            <div className="hero-sub">
              of daylight was sunny on average
              {s.windowDay && (
                <>
                  {' '}
                  · expect about <strong>{hoursLabel(Math.round(s.windowDay.directMinutes * s.history.sunnyFraction))}</strong> of real sun on this window
                </>
              )}
            </div>
          </div>
          <table className="times">
            <tbody>
              {s.history.years.map((yr) => (
                <tr key={yr.year}>
                  <td className="muted">{yr.year}</td>
                  <td>{yr.sunshineH.toFixed(1)} h sun</td>
                  <td className="muted">{Math.round(yr.cloudPct)}% cloud</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {s.mode === 'terrain' && (
      <>
      <section>
        <div className="section-title">Layers</div>
        <div className="seg">
          <button type="button" className={s.layer === 'satellite' ? 'active' : ''} onClick={() => s.setLayer('satellite')}>
            Satellite
          </button>
          <button type="button" className={s.layer === 'sunhours' ? 'active' : ''} onClick={() => s.setLayer('sunhours')}>
            Sun hours {s.sunHoursBusy && <span className="spinner" />}
          </button>
        </div>
        {s.layer === 'sunhours' && (
          <div className="legend-ramp" title="Hours of direct sun on the selected day">
            <span className="small muted">{s.sunHours ? `${s.sunHours.minHours.toFixed(1)}h` : '…'}</span>
            <div className="ramp" />
            <span className="small muted">{s.sunHours ? `${s.sunHours.maxHours.toFixed(1)}h` : '…'}</span>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={s.showShadows} onChange={(e) => s.setShowShadows(e.target.checked)} /> Cast shadows
        </label>
        <label className="check">
          <input type="checkbox" checked={s.showSunPaths} onChange={(e) => s.setShowSunPaths(e.target.checked)} /> Sun paths & compass
        </label>
      </section>

      <section>
        <div className="section-title">Terrain area</div>
        <div className="seg">
          {([14, 13, 12] as const).map((z) => (
            <button key={z} type="button" className={s.areaZoom === z ? 'active' : ''} onClick={() => s.setAreaZoom(z)}>
              {z === 14 ? '~5 km' : z === 13 ? '~10 km' : '~20 km'}
            </button>
          ))}
        </div>
        <div className="muted small">Larger areas capture shadows from distant mountains at lower detail.</div>
      </section>
      </>
      )}
    </div>
  );
}
