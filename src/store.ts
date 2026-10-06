import { create } from 'zustand';
import type { TerrainData } from './lib/elevation';
import type { DayAnalysis, HorizonProfile } from './lib/horizon';
import { timeZoneFor, todayStr } from './lib/time';
import { parseHash } from './lib/hash';
import type { SunshineHistory } from './lib/history';

const initial = parseHash();
const initialLocation = initial?.location ?? null;

export interface Location {
  lat: number;
  lon: number;
  name: string;
}

export type Layer = 'satellite' | 'sunhours';
export type ViewMode = 'terrain' | 'buildings';

function storedToken(): string {
  let t = '';
  try {
    t = localStorage.getItem('cesiumIonToken') ?? '';
  } catch {
    /* private mode */
  }
  return t || (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined) || '';
}

export interface SunHoursLayer {
  size: number;
  hours: Float32Array;
  minHours: number;
  maxHours: number;
  dateStr: string;
}

interface State {
  location: Location | null;
  tz: string;
  dateStr: string;
  minuteOfDay: number;
  playing: boolean;
  playSpeed: number; // simulated minutes per real second
  layer: Layer;
  showSunPaths: boolean;
  showShadows: boolean;
  areaZoom: 12 | 13 | 14;
  terrain: TerrainData | null;
  imagery: HTMLCanvasElement | null;
  loading: string | null;
  error: string | null;
  horizon: HorizonProfile | null;
  day: DayAnalysis | null;
  monthly: DayAnalysis[];
  sunHours: SunHoursLayer | null;
  sunHoursBusy: boolean;
  /** 'terrain' = built-in heightmap view; 'buildings' = CesiumJS with photorealistic 3D buildings. */
  mode: ViewMode;
  ionToken: string;
  /** ECEF position of the window the user clicked on a building, metres. */
  windowPos: [number, number, number] | null;
  windowDay: DayAnalysis | null;
  windowMonthly: DayAnalysis[];
  windowBusy: string | null;
  history: SunshineHistory | null;
  /** True while the 3D scene is still loading (panels stay hidden). */
  sceneLoading: boolean;
  /** null = unknown, true = Google has no 3D buildings here (flat photo only). */
  noBuildings: boolean | null;
  showSunRay: boolean;

  setLocation: (loc: Location | null) => void;
  setDateStr: (d: string) => void;
  setMinute: (m: number) => void;
  setPlaying: (p: boolean) => void;
  setPlaySpeed: (s: number) => void;
  setLayer: (l: Layer) => void;
  setShowSunPaths: (v: boolean) => void;
  setShowShadows: (v: boolean) => void;
  setAreaZoom: (z: 12 | 13 | 14) => void;
  setTerrain: (t: TerrainData | null, img: HTMLCanvasElement | null) => void;
  setLoading: (s: string | null) => void;
  setError: (s: string | null) => void;
  setAnalysis: (h: HorizonProfile | null, day: DayAnalysis | null, monthly: DayAnalysis[]) => void;
  setDay: (day: DayAnalysis | null) => void;
  setSunHours: (s: SunHoursLayer | null) => void;
  setSunHoursBusy: (b: boolean) => void;
  setMode: (m: ViewMode) => void;
  setIonToken: (t: string) => void;
  setWindowPos: (p: [number, number, number] | null) => void;
  setWindowAnalysis: (day: DayAnalysis | null, monthly: DayAnalysis[]) => void;
  setWindowBusy: (b: string | null) => void;
  setHistory: (h: SunshineHistory | null) => void;
  setSceneLoading: (b: boolean) => void;
  setNoBuildings: (b: boolean | null) => void;
  setShowSunRay: (b: boolean) => void;
}

export const useStore = create<State>((set) => ({
  location: initialLocation,
  tz: initialLocation ? timeZoneFor(initialLocation.lat, initialLocation.lon) : 'UTC',
  dateStr: initial?.dateStr ?? todayStr(),
  minuteOfDay: initial?.minuteOfDay ?? 12 * 60,
  playing: false,
  playSpeed: 20,
  layer: initial?.layer ?? 'satellite',
  showSunPaths: true,
  showShadows: true,
  areaZoom: 13,
  terrain: null,
  imagery: null,
  loading: null,
  error: null,
  horizon: null,
  day: null,
  monthly: [],
  sunHours: null,
  sunHoursBusy: false,
  mode: initial?.mode ?? 'buildings',
  ionToken: storedToken(),
  windowPos: null,
  windowDay: null,
  windowMonthly: [],
  windowBusy: null,
  history: null,
  sceneLoading: true,
  noBuildings: null,
  showSunRay: false,

  setLocation: (location) =>
    set({
      location,
      tz: location ? timeZoneFor(location.lat, location.lon) : 'UTC',
      terrain: null,
      imagery: null,
      horizon: null,
      day: null,
      monthly: [],
      sunHours: null,
      error: null,
      playing: false,
      windowPos: null,
      windowDay: null,
      windowMonthly: [],
      history: null,
      sceneLoading: true,
      noBuildings: null,
    }),
  setDateStr: (dateStr) => set({ dateStr }),
  setMinute: (minuteOfDay) => set({ minuteOfDay }),
  setPlaying: (playing) => set({ playing }),
  setPlaySpeed: (playSpeed) => set({ playSpeed }),
  setLayer: (layer) => set({ layer }),
  setShowSunPaths: (showSunPaths) => set({ showSunPaths }),
  setShowShadows: (showShadows) => set({ showShadows }),
  setAreaZoom: (areaZoom) => set({ areaZoom }),
  setTerrain: (terrain, imagery) => set({ terrain, imagery }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setAnalysis: (horizon, day, monthly) => set({ horizon, day, monthly }),
  setDay: (day) => set({ day }),
  setSunHours: (sunHours) => set({ sunHours }),
  setSunHoursBusy: (sunHoursBusy) => set({ sunHoursBusy }),
  setMode: (mode) => set({ mode }),
  setIonToken: (ionToken) => {
    try {
      localStorage.setItem('cesiumIonToken', ionToken);
    } catch {
      /* private mode */
    }
    set({ ionToken });
  },
  setWindowPos: (windowPos) => set({ windowPos, windowDay: null, windowMonthly: [] }),
  setWindowAnalysis: (windowDay, windowMonthly) => set({ windowDay, windowMonthly }),
  setWindowBusy: (windowBusy) => set({ windowBusy }),
  setHistory: (history) => set({ history }),
  setSceneLoading: (sceneLoading) => set({ sceneLoading }),
  setNoBuildings: (noBuildings) => set({ noBuildings }),
  setShowSunRay: (showSunRay) => set({ showSunRay }),
}));
