import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Stars } from '@react-three/drei';
import { useStore } from '../store';
import { Terrain } from './Terrain';
import { SunPath } from './SunPath';
import { Marker } from './Marker';
import { instantFor } from '../lib/time';
import { sunPosition, sunVector } from '../lib/sun';
import { stateAt } from '../lib/horizon';

export function Scene() {
  const { location, tz, dateStr, minuteOfDay, terrain, imagery, layer, sunHours, showSunPaths, showShadows, horizon } =
    useStore();

  const w = terrain?.widthMeters ?? 10000;
  const radius = w * 0.22;

  const sun = useMemo(() => {
    if (!location) return null;
    const t = instantFor(dateStr, minuteOfDay, tz);
    const p = sunPosition(t, location.lat, location.lon);
    const v = sunVector(p);
    const state = horizon ? stateAt(t, location.lat, location.lon, horizon) : p.altitude > 0 ? 'sun' : 'night';
    return { p, v, state };
  }, [location, dateStr, minuteOfDay, tz, horizon]);

  if (!location || !terrain || !sun) return null;

  const alt = sun.p.altitude;
  const dayFactor = Math.max(0, Math.min(1, (alt + 0.03) / 0.25)); // 0 at night, 1 well above horizon
  const sunIntensity = 2.6 * dayFactor;
  const warmth = Math.max(0, 1 - alt / 0.3);
  const sunColor = `rgb(255, ${Math.round(245 - 80 * warmth)}, ${Math.round(230 - 150 * warmth)})`;
  const ambient = 0.12 + 0.5 * dayFactor;
  const shadowExtent = w * 0.72;

  return (
    <Canvas
      shadows
      camera={{ position: [w * 0.32, w * 0.3, w * 0.46], fov: 50, near: 5, far: w * 40 }}
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
      dpr={[1, 1.75]}
    >
      <Sky
        sunPosition={[sun.v[0], Math.max(sun.v[1], -0.08), sun.v[2]]}
        distance={w * 20}
        turbidity={6}
        rayleigh={alt < 0 ? 0.3 : 1.5}
        mieCoefficient={0.004}
        mieDirectionalG={0.85}
      />
      {alt < 0.05 && <Stars radius={w * 6} depth={w} count={2500} factor={w * 0.01} fade />}
      <hemisphereLight args={['#bcd3ff', '#3a3a30', ambient]} />
      <directionalLight
        position={[sun.v[0] * w, sun.v[1] * w, sun.v[2] * w]}
        intensity={sunIntensity}
        color={sunColor}
        castShadow={showShadows && alt > 0}
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={w * 3}
        shadow-bias={-0.00015}
        shadow-normalBias={terrain.metersPerSample * 0.6}
      />
      <Terrain terrain={terrain} imagery={imagery} layer={layer} sunHours={sunHours} showShadows={showShadows} />
      <SunPath
        lat={location.lat}
        lon={location.lon}
        tz={tz}
        dateStr={dateStr}
        minuteOfDay={minuteOfDay}
        radius={radius}
        showPaths={showSunPaths}
      />
      <Marker scale={radius / 700} state={sun.state} />
      <OrbitControls
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={60}
        maxDistance={w * 1.6}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
