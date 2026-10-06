import { useStore } from '../store';
import { formatTime, hoursLabel } from '../lib/time';
import { DayTimeline, HorizonChart, MonthlyChart } from './charts';

function WindowSection() {
  const s = useStore();
  const run = (window as unknown as { __runWindowAnalysis?: (wholeYear: boolean) => Promise<void> }).__runWindowAnalysis;
  const day = s.windowDay;
  const lostPct = day && day.daylightMinutes ? Math.round((day.lostMinutes / day.daylightMinutes) * 100) : 0;
  return (
    <section className="window-section">
      <div className="section-title">Sunlight</div>
      {!s.ionToken && <div className="muted small">Paste your Cesium ion token in Controls first.</div>}
      {s.ionToken && !s.windowPos && <div className="muted small">Click a window on a building.</div>}
      {s.windowPos && !day && !s.windowBusy && (
        <div className="row">
          <button type="button" className="primary" onClick={() => run?.(false)} disabled={!run}>
            Analyze {s.dateStr}
          </button>
          <button type="button" onClick={() => run?.(true)} disabled={!run}>
            Whole year
          </button>
        </div>
      )}
      {s.windowBusy && (
        <div className="row">
          <span className="spinner" /> <span className="muted small">{s.windowBusy}</span>
        </div>
      )}
      {day && (
        <>
          <div className="hero">
            <div className="hero-num">{hoursLabel(day.directMinutes)}</div>
            <div className="hero-sub">
              direct sun on this window · {hoursLabel(day.daylightMinutes)} daylight
              {day.lostMinutes > 0 ? (
                <>
                  {' '}
                  · <span className="warn">{hoursLabel(day.lostMinutes)} ({lostPct}%) blocked</span>
                </>
              ) : null}
            </div>
          </div>
          <table className="times">
            <thead>
              <tr>
                <th></th>
                <th>First</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="muted">Sun above horizon</td>
                <td>{formatTime(day.sunrise, s.tz)}</td>
                <td>{formatTime(day.sunset, s.tz)}</td>
              </tr>
              <tr>
                <td className="muted">Sun on this window</td>
                <td>{formatTime(day.effectiveSunrise, s.tz)}</td>
                <td>{formatTime(day.effectiveSunset, s.tz)}</td>
              </tr>
            </tbody>
          </table>
          <DayTimeline day={day} minute={s.minuteOfDay} onPick={(m) => { s.setPlaying(false); s.setMinute(m); }} />
          {s.windowMonthly.length === 12 && (
            <>
              <div className="muted small">Hours per day on the 15th of each month, clear sky.</div>
              <MonthlyChart monthly={s.windowMonthly} selected={s.dateStr} onPick={(ds) => s.setDateStr(ds)} />
            </>
          )}
          <div className="row">
            <button type="button" onClick={() => run?.(false)} disabled={!run || !!s.windowBusy}>
              Re-run for {s.dateStr}
            </button>
            {s.windowMonthly.length !== 12 && (
              <button type="button" onClick={() => run?.(true)} disabled={!run || !!s.windowBusy}>
                Whole year
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function AnalysisPanel() {
  const s = useStore();
  const loc = s.location!;
  const day = s.day;

  if (s.mode === 'buildings') {
    return (
      <div className="panel analysis">
        <WindowSection />
      </div>
    );
  }

  if (!day || !s.horizon) {
    return (
      <div className="panel analysis">
        <div className="muted">Analyzing terrain…</div>
      </div>
    );
  }

  const lostPct = day.daylightMinutes ? Math.round((day.lostMinutes / day.daylightMinutes) * 100) : 0;

  return (
    <div className="panel analysis">
      <section>
        <div className="section-title">Sunlight at this property</div>
        <div className="hero">
          <div className="hero-num">{hoursLabel(day.directMinutes)}</div>
          <div className="hero-sub">
            of direct sun on this day, out of {hoursLabel(day.daylightMinutes)} of daylight
            {day.lostMinutes > 0 ? (
              <>
                {' '}
                · <span className="warn">{hoursLabel(day.lostMinutes)} ({lostPct}%) blocked by terrain</span>
              </>
            ) : (
              <> · nothing blocked by terrain</>
            )}
          </div>
        </div>
        <table className="times">
          <thead>
            <tr>
              <th></th>
              <th>Sunrise</th>
              <th>Sunset</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="muted">Astronomical</td>
              <td>{formatTime(day.sunrise, s.tz)}</td>
              <td>{formatTime(day.sunset, s.tz)}</td>
            </tr>
            <tr>
              <td className="muted">First / last direct sun</td>
              <td>{formatTime(day.effectiveSunrise, s.tz)}</td>
              <td>{formatTime(day.effectiveSunset, s.tz)}</td>
            </tr>
          </tbody>
        </table>
        <DayTimeline day={day} minute={s.minuteOfDay} onPick={(m) => { s.setPlaying(false); s.setMinute(m); }} />
      </section>

      <section>
        <div className="section-title">Across the year</div>
        <div className="muted small">Hours per day on the 15th of each month. Click a month to jump to it.</div>
        <MonthlyChart monthly={s.monthly} selected={s.dateStr} onPick={(ds) => s.setDateStr(ds)} />
      </section>

      <section>
        <div className="section-title">Terrain skyline vs. sun path</div>
        <div className="muted small">Where the sun dips behind the skyline, the property is in shadow.</div>
        <HorizonChart horizon={s.horizon} lat={loc.lat} lon={loc.lon} tz={s.tz} dateStr={s.dateStr} minute={s.minuteOfDay} />
      </section>
    </div>
  );
}
