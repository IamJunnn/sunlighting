// What this calendar date actually delivered in past years: measured sunshine
// hours from the Open-Meteo historical archive (ERA5 reanalysis, free, no key).

export interface YearSunshine {
  year: number;
  /** Hours of bright sunshine (direct radiation above 120 W/m²). */
  sunshineH: number;
  daylightH: number;
  cloudPct: number;
}

export interface SunshineHistory {
  dateStr: string;
  years: YearSunshine[];
  /** Mean sunshine as a fraction of daylight across the years. */
  sunnyFraction: number;
}

export async function fetchSunshineHistory(lat: number, lon: number, dateStr: string, count = 5): Promise<SunshineHistory> {
  const [y, m, d] = dateStr.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  // Only complete years: the archive lags a few days behind today.
  const firstYear = Math.min(y, thisYear) - 1;
  const years: YearSunshine[] = [];
  const jobs = Array.from({ length: count }, (_, i) => firstYear - i).map(async (year) => {
    const day = `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28 + (m === 2 ? 0 : 2))).padStart(2, '0')}`;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${day}&end_date=${day}&daily=sunshine_duration,daylight_duration,cloud_cover_mean&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = (await res.json()) as { daily?: { sunshine_duration: (number | null)[]; daylight_duration: number[]; cloud_cover_mean: (number | null)[] } };
    const dd = data.daily;
    if (!dd || dd.sunshine_duration[0] == null) return;
    years.push({ year, sunshineH: dd.sunshine_duration[0]! / 3600, daylightH: dd.daylight_duration[0] / 3600, cloudPct: dd.cloud_cover_mean[0] ?? 0 });
  });
  await Promise.all(jobs);
  years.sort((a, b) => b.year - a.year);
  const fr = years.length ? years.reduce((acc, yr) => acc + (yr.daylightH ? yr.sunshineH / yr.daylightH : 0), 0) / years.length : 0;
  return { dateStr, years, sunnyFraction: fr };
}
