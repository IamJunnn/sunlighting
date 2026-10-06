import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TerrainData } from '../lib/elevation';
import type { Layer, SunHoursLayer } from '../store';
import { buildSunHoursCanvas } from '../lib/sunhoursTexture';

interface Props {
  terrain: TerrainData;
  imagery: HTMLCanvasElement | null;
  layer: Layer;
  sunHours: SunHoursLayer | null;
  showShadows: boolean;
}

export function Terrain({ terrain, imagery, layer, sunHours, showShadows }: Props) {
  const geometry = useMemo(() => {
    const s = terrain.size;
    const mps = terrain.metersPerSample;
    const pos = new Float32Array(s * s * 3);
    const uv = new Float32Array(s * s * 2);
    const h0 = terrain.centerH;
    for (let r = 0; r < s; r++) {
      for (let c = 0; c < s; c++) {
        const i = r * s + c;
        pos[i * 3] = (c - s / 2) * mps;
        pos[i * 3 + 1] = terrain.heights[i] - h0;
        pos[i * 3 + 2] = (r - s / 2) * mps;
        uv[i * 2] = c / (s - 1);
        uv[i * 2 + 1] = 1 - r / (s - 1);
      }
    }
    const idx = new Uint32Array((s - 1) * (s - 1) * 6);
    let k = 0;
    for (let r = 0; r < s - 1; r++) {
      for (let c = 0; c < s - 1; c++) {
        const a = r * s + c;
        const b = a + 1;
        const d = a + s;
        const e = d + 1;
        idx[k++] = a;
        idx[k++] = d;
        idx[k++] = b;
        idx[k++] = b;
        idx[k++] = d;
        idx[k++] = e;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }, [terrain]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const texture = useMemo(() => {
    let src: HTMLCanvasElement | null = null;
    if (layer === 'sunhours' && sunHours) src = buildSunHoursCanvas(imagery, sunHours);
    else src = imagery;
    if (!src) return null;
    const t = new THREE.CanvasTexture(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }, [imagery, layer, sunHours]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const dataLayer = layer === 'sunhours' && !!sunHours;
  return (
    <mesh geometry={geometry} castShadow={showShadows && !dataLayer} receiveShadow={showShadows && !dataLayer}>
      {dataLayer ? (
        // Unlit, so the colours read as data rather than being modulated by the time-of-day lighting.
        <meshBasicMaterial map={texture ?? undefined} />
      ) : (
        <meshStandardMaterial map={texture ?? undefined} color={texture ? '#ffffff' : '#6b7a5a'} roughness={1} metalness={0} />
      )}
    </mesh>
  );
}
