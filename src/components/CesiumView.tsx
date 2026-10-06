import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useStore } from '../store';
import { instantFor, dateStrFor } from '../lib/time';
import { analyzeWindowDay, sunDirectionECEF } from '../lib/buildingAnalysis';
import type { DayAnalysis } from '../lib/horizon';
import { fetchLabels } from '../lib/osmLabels';
import { sunPosition } from '../lib/sun';

/** Cesium ion asset id of Google Photorealistic 3D Tiles. */
const GOOGLE_3D_TILES_ASSET = 2275207;

export function CesiumView() {
  const el = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const windowEntity = useRef<Cesium.Entity | null>(null);
  const rayEntity = useRef<Cesium.Entity | null>(null);
  const homeRef = useRef<(() => void) | null>(null);
  const orbitRef = useRef<((deltaDeg: number | null) => void) | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const headingRef = useRef<((deg: number) => void) | null>(null);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [status, setStatus] = useState<string>('');
  /** 0 scene, 1 terrain, 2 buildings, 3 streaming tiles, 4 ready; -1 = failed/fallback */
  const [stage, setStageRaw] = useState(0);
  const setSceneLoading = useStore((st) => st.setSceneLoading);
  const noBuildings = useStore((st) => st.noBuildings);
  const setNoBuildings = useStore((st) => st.setNoBuildings);
  const setStage = (n: number) => {
    setStageRaw(n);
    setSceneLoading(n >= 0 && n < 4);
  };
  const { location, tz, dateStr, minuteOfDay, ionToken, windowPos, setWindowPos, showSunRay } = useStore();

  // Create the viewer once per location/token.
  useEffect(() => {
    if (!el.current || !location) return;
    Cesium.Ion.defaultAccessToken = ionToken;
    const viewer = new Cesium.Viewer(el.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: false,
      shadows: true,
      terrainShadows: Cesium.ShadowMode.ENABLED,
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: 'Esri World Imagery',
        }),
      ),
    });
    viewerRef.current = viewer;
    (window as unknown as { __viewer?: Cesium.Viewer }).__viewer = viewer;
    const scene = viewer.scene;
    scene.globe.enableLighting = false;
    scene.globe.depthTestAgainstTerrain = true;
    scene.skyAtmosphere!.show = true;
    viewer.shadowMap.size = 4096;
    viewer.shadowMap.softShadows = true;
    viewer.shadowMap.maximumDistance = 2500;
    viewer.clock.shouldAnimate = false;
    const ctl = scene.screenSpaceCameraController;
    ctl.minimumZoomDistance = 15;
    ctl.maximumZoomDistance = 700;
    ctl.enableCollisionDetection = true;
    // Google Earth-style mouse: left-drag pans, right-drag rotates and tilts, wheel zooms.
    ctl.tiltEventTypes = [Cesium.CameraEventType.RIGHT_DRAG, Cesium.CameraEventType.MIDDLE_DRAG, Cesium.CameraEventType.PINCH, { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL }];
    ctl.zoomEventTypes = [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH];
    // No 3D tiles yet: cast shadows would only paint artefacts on the flat imagery.
    viewer.shadows = false;

    const target = Cesium.Cartesian3.fromDegrees(location.lon, location.lat);
    const pinSvg =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64" viewBox="0 0 48 64"><path d="M24 2C11.8 2 2 11.8 2 24c0 16 22 38 22 38s22-22 22-38C46 11.8 36.2 2 24 2z" fill="#38bdf8" stroke="#061a26" stroke-width="3"/><circle cx="24" cy="24" r="9" fill="#061a26"/></svg>',
      );
    viewer.entities.add({
      position: target,
      billboard: { image: pinSvg, width: 48, height: 64, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: location.name,
        font: '700 15px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -72),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(20,22,28,0.85)'),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Camera heights are absolute, so start from the ground height at the location
    // (the built-in heightmap if it is loaded, then refined from Cesium's terrain).
    let groundHeight = useStore.getState().terrain?.centerH ?? 0;
    const home = () =>
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(location.lon, location.lat - 0.0028, groundHeight + 260),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-43), roll: 0 },
      });
    home();
    homeRef.current = home;
    // Orbit the camera around the location (null = face north again).
    // Orbit about the point on the ground (not sea level), keeping the current distance to it.
    const orbitTo = (headingRad: number) => {
      const cam = viewer.camera;
      const center = Cesium.Cartesian3.fromDegrees(location.lon, location.lat, groundHeight);
      const range = Math.min(Math.max(Cesium.Cartesian3.distance(cam.positionWC, center), 60), 900);
      const pitch = Cesium.Math.clamp(cam.pitch, Cesium.Math.toRadians(-70), Cesium.Math.toRadians(-20));
      cam.lookAt(center, new Cesium.HeadingPitchRange(headingRad, pitch, range));
      cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
    };
    orbitRef.current = (deltaDeg) => orbitTo(deltaDeg === null ? 0 : viewer.camera.heading + Cesium.Math.toRadians(deltaDeg));
    headingRef.current = (deg) => orbitTo(Cesium.Math.toRadians(deg));
    // Keep the compass dial in sync with however the camera is moved.
    viewer.camera.changed.addEventListener(() => setHeadingDeg(Cesium.Math.toDegrees(viewer.camera.heading)));
    viewer.camera.percentageChanged = 0.01;

    let cancelled = false;
    const load3D = async () => {
      if (!ionToken) {
        setStage(-1);
        setStatus('No Cesium ion token: showing imagery only. Paste a token in the Controls panel to load 3D buildings.');
        return;
      }
      try {
        setStage(1);
        setStatus('');
        const terrain = await Cesium.createWorldTerrainAsync();
        if (cancelled) return;
        scene.terrainProvider = terrain;
        try {
          const [sample] = await Cesium.sampleTerrainMostDetailed(terrain, [Cesium.Cartographic.fromDegrees(location.lon, location.lat)]);
          if (!cancelled && sample && Number.isFinite(sample.height)) {
            const wasHome = Cesium.Cartesian3.distance(viewer.camera.positionWC, Cesium.Cartesian3.fromDegrees(location.lon, location.lat - 0.0028, groundHeight + 260)) < 5;
            groundHeight = sample.height;
            if (wasHome) home();
          }
        } catch {
          /* keep heightmap estimate */
        }
        setStage(2);
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(GOOGLE_3D_TILES_ASSET, { showCreditsOnScreen: true });
        if (cancelled) return;
        tileset.shadows = Cesium.ShadowMode.ENABLED;
        // Cast and receive shadows, but do not let the sun angle darken the photo texture.
        tileset.imageBasedLighting.imageBasedLightingFactor = new Cesium.Cartesian2(1, 1);
        scene.primitives.add(tileset);
        viewer.shadows = true;
        scene.light = new Cesium.SunLight({ intensity: 1.8 });
        tilesetRef.current = tileset;
        // Google's tiles carry their own ground, so hide the globe underneath to avoid z-fighting.
        scene.globe.show = false;
        setStage(3);
        // Hold the loader until the first batch of tiles around the pin has streamed in (or 12 s).
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          const check = () => {
            if (cancelled || tileset.tilesLoaded || performance.now() - t0 > 12000) {
              tileset.allTilesLoaded.removeEventListener(check);
              clearInterval(iv);
              resolve();
            }
          };
          tileset.allTilesLoaded.addEventListener(check);
          const iv = setInterval(check, 500);
        });
        if (cancelled) return;
        setStage(4);
        setStatus('');
        // Probe for real 3D geometry: cast rays down around the pin and see whether anything
        // stands above the terrain. Google's "top-down only" areas drape the photo flat.
        try {
          const probe = async () => {
            const carto = Cesium.Cartographic.fromDegrees(location.lon, location.lat);
            const [t] = await Cesium.sampleTerrainMostDetailed(terrain, [carto.clone()]);
            const ground = t?.height ?? 0;
            let maxRise = 0;
            const picker = scene as unknown as { pickFromRay: (r: Cesium.Ray, ex: unknown[]) => { position?: Cesium.Cartesian3 } | undefined };
            for (let dx = -2; dx <= 2; dx++) {
              for (let dy = -2; dy <= 2; dy++) {
                const lon = location.lon + (dx * 70) / (111320 * Math.cos((location.lat * Math.PI) / 180));
                const lat = location.lat + (dy * 70) / 111320;
                const top = Cesium.Cartesian3.fromDegrees(lon, lat, ground + 400);
                const down = Cesium.Cartesian3.negate(Cesium.Cartesian3.normalize(top, new Cesium.Cartesian3()), new Cesium.Cartesian3());
                const hit = picker.pickFromRay(new Cesium.Ray(top, down), []);
                if (hit?.position) {
                  const h = Cesium.Cartographic.fromCartesian(hit.position).height;
                  const [tt] = await Cesium.sampleTerrainMostDetailed(terrain, [Cesium.Cartographic.fromDegrees(lon, lat)]);
                  maxRise = Math.max(maxRise, h - (tt?.height ?? ground));
                }
              }
            }
            return maxRise;
          };
          const rise = await probe();
          if (!cancelled) setNoBuildings(rise < 4);
        } catch {
          /* leave unknown */
        }
      } catch (e) {
        setStage(-1);
        const msg = e instanceof Error ? e.message : String(e);
        if (/429/.test(msg)) {
          setStatus('3D buildings paused: the free Google tile quota is rate-limited right now (HTTP 429). Showing flat imagery. Retrying in 30 s…');
          retryTimer = window.setTimeout(() => !cancelled && load3D(), 30000);
        } else if (/40[13]/.test(msg)) {
          setStatus('3D buildings refused (HTTP 401/403): the token is invalid or Google Photorealistic 3D Tiles is not added to your Cesium ion assets.');
        } else {
          setStatus(`Could not load 3D buildings: ${msg}`);
        }
      }
    };
    let retryTimer: number | undefined;
    load3D();
    retryRef.current = () => {
      window.clearTimeout(retryTimer);
      load3D();
    };

    // Street names so the view can be read like a map: nearby only, one label per street,
    // hidden when the camera is far or tilted low (they drift on the 3D mesh then).
    fetchLabels(location.lat, location.lon, 450)
      .then((labels) => {
        if (cancelled || viewer.isDestroyed()) return;
        const seen = new Set<string>();
        for (const l of labels) {
          if (l.kind !== 'street' || seen.has(l.text)) continue;
          seen.add(l.text);
          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(l.lon, l.lat),
            label: {
              text: l.text,
              font: '600 12px sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 650),
              translucencyByDistance: new Cesium.NearFarScalar(250, 0.95, 650, 0.2),
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
            },
          });
        }
      })
      .catch(() => {
        /* labels are a convenience; the view works without them */
      });

    // Click a building façade to mark "your window".
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((ev: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (!scene.pickPositionSupported) return;
      const picked = scene.pickPosition(ev.position);
      if (!picked) return;
      // Step 1.5 m back towards the camera so the ray casts start outside the wall.
      const toCam = Cesium.Cartesian3.subtract(viewer.camera.positionWC, picked, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(toCam, toCam);
      const origin = Cesium.Cartesian3.add(picked, Cesium.Cartesian3.multiplyByScalar(toCam, 1.5, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      setWindowPos([origin.x, origin.y, origin.z]);
      setTimeout(() => (window as unknown as { __runWindowAnalysis?: (y: boolean) => void }).__runWindowAnalysis?.(true), 0);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      tilesetRef.current = null;
      windowEntity.current = null;
      rayEntity.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lon, ionToken]);

  // A new date re-runs the window analysis.
  useEffect(() => {
    if (!windowPos) return;
    const t = setTimeout(() => (window as unknown as { __runWindowAnalysis?: (y: boolean) => void }).__runWindowAnalysis?.(false), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  // Sun time.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(instantFor(dateStr, minuteOfDay, tz));
    viewer.scene.requestRender();
  }, [dateStr, minuteOfDay, tz]);

  // Window marker + a ray towards the current sun position.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !location) return;
    if (windowEntity.current) viewer.entities.remove(windowEntity.current);
    if (rayEntity.current) viewer.entities.remove(rayEntity.current);
    windowEntity.current = null;
    rayEntity.current = null;
    if (!windowPos) return;
    const origin = new Cesium.Cartesian3(...windowPos);
    const windowPin =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="54" viewBox="0 0 48 64"><path d="M24 2C11.8 2 2 11.8 2 24c0 16 22 38 22 38s22-22 22-38C46 11.8 36.2 2 24 2z" fill="#ffffff" stroke="#38bdf8" stroke-width="4"/><rect x="15" y="15" width="18" height="18" rx="2" fill="#38bdf8"/><path d="M24 15v18M15 24h18" stroke="#ffffff" stroke-width="2"/></svg>',
      );
    windowEntity.current = viewer.entities.add({
      position: origin,
      billboard: { image: windowPin, width: 40, height: 54, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: 'Your window',
        font: '700 13px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -62),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(56,189,248,0.9)'),
        backgroundPadding: new Cesium.Cartesian2(7, 4),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    // Optional dashed line from the window towards the sun at the chosen time.
    const dir = showSunRay ? sunDirectionECEF(origin, instantFor(dateStr, minuteOfDay, tz), location.lat, location.lon) : null;
    if (dir) {
      const end = Cesium.Cartesian3.add(origin, Cesium.Cartesian3.multiplyByScalar(dir, 400, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      rayEntity.current = viewer.entities.add({
        polyline: {
          positions: [origin, end],
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString('#ffd166') }),
          // Keep it visible through buildings and trees.
          depthFailMaterial: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString('#ffd166').withAlpha(0.7) }),
        },
      });
    }
  }, [windowPos, dateStr, minuteOfDay, tz, location, showSunRay]);

  // Expose the analysis runner to the panel through the window object. It reads the
  // store at call time, so the panel never holds a stale closure.
  useEffect(() => {
    const run = async (wholeYear: boolean) => {
      const viewer = viewerRef.current;
      const tileset = tilesetRef.current;
      const { windowPos, location, dateStr, tz, setWindowBusy, setWindowAnalysis } = useStore.getState();
      if (!viewer || viewer.isDestroyed() || !windowPos || !location) return;
      const scene = viewer.scene;
      const origin = new Cesium.Cartesian3(...windowPos);
      // Look straight down from above so every nearby building is loaded for the ray casts.
      const saved = { position: viewer.camera.positionWC.clone(), direction: viewer.camera.directionWC.clone(), up: viewer.camera.upWC.clone() };
      const carto = Cesium.Cartographic.fromCartesian(origin);
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 900),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
      setWindowBusy('Loading surroundings…');
      try {
        // Wait (at most 20 s) until the tiles around the window are loaded, polling each second.
        const t0 = performance.now();
        while (performance.now() - t0 < 20000) {
          scene.requestRender();
          const ready = (!tileset || tileset.tilesLoaded) && (!scene.globe.show || scene.globe.tilesLoaded);
          if (ready) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
        const exclude = [windowEntity.current, rayEntity.current].filter(Boolean);
        setWindowBusy('Casting rays towards the sun…');
        await new Promise((r) => setTimeout(r, 50));
        const horizon = useStore.getState().horizon;
        const day = analyzeWindowDay(scene, origin, location.lat, location.lon, dateStr, tz, exclude, 10, horizon);
        let monthly: DayAnalysis[] = useStore.getState().windowMonthly;
        if (wholeYear) {
          const year = +dateStr.slice(0, 4);
          monthly = [];
          for (let m = 0; m < 12; m++) {
            setWindowBusy(`Month ${m + 1} of 12…`);
            await new Promise((r) => setTimeout(r, 10));
            monthly.push(analyzeWindowDay(scene, origin, location.lat, location.lon, dateStrFor(year, m, 15), tz, exclude, 15, horizon));
          }
        }
        setWindowAnalysis(day, monthly);
        setWindowBusy(null);
      } catch (e) {
        console.error('window analysis failed', e);
        setWindowBusy(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        viewer.camera.setView({ destination: saved.position, orientation: { direction: saved.direction, up: saved.up } });
      }
    };
    (window as unknown as { __runWindowAnalysis?: typeof run }).__runWindowAnalysis = run;
    return () => {
      delete (window as unknown as { __runWindowAnalysis?: typeof run }).__runWindowAnalysis;
    };
  }, []);

  // Google's photo tiles carry noon daylight baked in, so grade the view ourselves:
  // untouched by day, golden in the last hour, orange at sunset, then a fade to blue night.
  const alt = location ? (sunPosition(instantFor(dateStr, minuteOfDay, tz), location.lat, location.lon).altitude * 180) / Math.PI : 90;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const golden = clamp01((10 - alt) / 10) * clamp01((alt + 2) / 2); // ramps in from 10° to 0°, gone by −2°
  const dusk = clamp01((2 - alt) / 6) * clamp01((alt + 8) / 4); // orange band straddling the horizon, fades out by −8°
  const night = clamp01((-alt - 2) / 8); // 0 at −2°, full at −10°
  const overlay = [
    `rgba(255, 170, 60, ${(0.14 * golden).toFixed(3)})`,
    `rgba(255, 110, 40, ${(0.22 * dusk).toFixed(3)})`,
    `rgba(6, 12, 36, ${(0.78 * night).toFixed(3)})`,
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div
        className="night-overlay"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `linear-gradient(${overlay[0]}, ${overlay[0]}), linear-gradient(${overlay[1]}, ${overlay[1]}), linear-gradient(${overlay[2]}, ${overlay[2]})`,
          mixBlendMode: 'normal',
          transition: 'background 0.3s',
        }}
      />
      {stage >= 0 && stage < 4 && (
        <div className="loader">
          <div className="loader-card">
            <div className="loader-sun" />
            <div className="loader-title">{location?.name}</div>
            <ol className="loader-steps">
              {['Opening the 3D view', 'Loading terrain', 'Fetching 3D buildings', 'Streaming the neighbourhood'].map((label, i) => (
                <li key={label} className={i < stage ? 'done' : i === stage ? 'active' : ''}>
                  <span className="loader-dot" />
                  {label}
                </li>
              ))}
            </ol>
            <div className="loader-bar">
              <div style={{ width: `${Math.min(100, 12 + stage * 26)}%` }} />
            </div>
          </div>
        </div>
      )}
      {noBuildings && stage === 4 && (
        <div className="cesium-status disclaimer">
          <div>
            <strong>No 3D buildings here.</strong> Google has not modelled this area (common outside North America, Europe, Japan and Australia), so
            the view is a flat photo and shadows from neighbouring buildings cannot be computed. Clicking a window gives sun and terrain only, which
            will overstate the light a real window gets.
          </div>
          <button type="button" className="small" onClick={() => setNoBuildings(false)} aria-label="Dismiss">
            OK
          </button>
        </div>
      )}
      {status && (
        <div className="cesium-status">
          {status}
          {ionToken && /429|Could not/.test(status) && (
            <button type="button" className="small" onClick={() => retryRef.current?.()}>
              Retry now
            </button>
          )}
        </div>
      )}
      <div className="view-buttons">
        <CompassDial heading={headingDeg} onHeading={(d) => headingRef.current?.(d)} onReset={() => orbitRef.current?.(null)} />
        <button type="button" className="recenter" onClick={() => homeRef.current?.()}>◎ {location?.name ?? 'Back'}</button>
      </div>
    </div>
  );
}


/** A compass you drag around to rotate the view; tap it to face north. */
function CompassDial({ heading, onHeading, onReset }: { heading: number; onHeading: (deg: number) => void; onReset: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const angleAt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // Angle of the pointer from the top of the dial, clockwise. The needle points north, so the
    // view heading is the opposite of where north sits on the dial.
    return (-(Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  };
  return (
    <div
      ref={ref}
      className="compass"
      role="slider"
      aria-label="Rotate the view (drag around the dial, tap for north)"
      aria-valuenow={Math.round(heading)}
      aria-valuemin={0}
      aria-valuemax={359}
      tabIndex={0}
      onPointerDown={(e) => {
        moved.current = false;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!(e.buttons & 1)) return;
        moved.current = true;
        onHeading(angleAt(e));
      }}
      onPointerUp={() => {
        if (!moved.current) onReset();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onHeading((heading - 15 + 360) % 360);
        if (e.key === 'ArrowRight') onHeading((heading + 15) % 360);
        if (e.key === 'Enter' || e.key === ' ') onReset();
      }}
    >
      <div className="compass-ring" style={{ transform: `rotate(${-heading}deg)` }}>
        <span className="compass-n">N</span>
        <span className="compass-tick t1" />
        <span className="compass-tick t2" />
        <span className="compass-tick t3" />
      </div>
      <span className="compass-hint">drag</span>
    </div>
  );
}
