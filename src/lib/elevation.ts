// Fetches AWS Terrarium elevation tiles and satellite imagery, stitching them
// into a square heightmap / texture centred on a location.

import { latToTileY, lonToTileX, metersPerPixel, tileXToLon, tileYToLat } from './geo';

export interface TerrainData {
  /** Grid width and height in samples. */
  size: number;
  /** Row-major heights in metres; row 0 is the northern edge. */
  heights: Float32Array;
  /** Ground distance of one sample, in metres (x and y treated as equal locally). */
  metersPerSample: number;
  /** Total width of the grid in metres. */
  widthMeters: number;
  center: { lat: number; lon: number };
  minH: number;
  maxH: number;
  /** Elevation at the centre point (metres). */
  centerH: number;
  zoom: number;
}

const TERRAIN_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const IMAGERY_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/** Number of tiles on each side of the fetched square. */
export const TILES_PER_SIDE = 3;

export async function fetchTerrain(
  lat: number,
  lon: number,
  zoom: number,
  onProgress?: (done: number, total: number) => void,
): Promise<TerrainData> {
  const n = TILES_PER_SIDE;
  const half = n / 2;
  // Fractional tile coordinates of the centre point.
  const cx = lonToTileX(lon, zoom);
  const cy = latToTileY(lat, zoom);
  // The tile containing the point sits in the middle of the n x n block.
  const x0 = Math.floor(cx) - Math.floor(half);
  const y0 = Math.floor(cy) - Math.floor(half);
  const size = n * 256;
  const cropSize = size - 256; // one tile narrower, so a centred crop always fits
  // Top-left of a crop whose centre is exactly the requested point.
  const offX = Math.round((cx - x0) * 256 - cropSize / 2);
  const offY = Math.round((cy - y0) * 256 - cropSize / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const jobs: Promise<void>[] = [];
  let done = 0;
  const total = n * n;
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      jobs.push(
        loadImage(TERRAIN_URL(zoom, x0 + tx, y0 + ty))
          .then((img) => ctx.drawImage(img, tx * 256, ty * 256))
          .catch(() => {
            /* missing tile (ocean / out of range) stays at height 0 */
          })
          .finally(() => onProgress?.(++done, total)),
      );
    }
  }
  await Promise.all(jobs);

  // Crop the image so the location is exactly in the middle of a square grid.
  const crop = ctx.getImageData(offX, offY, cropSize, cropSize);
  const heights = new Float32Array(cropSize * cropSize);
  let minH = Infinity;
  let maxH = -Infinity;
  const d = crop.data;
  for (let i = 0; i < cropSize * cropSize; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    const a = d[i * 4 + 3];
    // Terrarium encoding: h = R*256 + G + B/256 - 32768
    let h = a === 0 ? 0 : r * 256 + g + b / 256 - 32768;
    if (h < -500) h = 0; // treat invalid values as sea level
    heights[i] = h;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }

  const mps = metersPerPixel(lat, zoom);
  const c = (cropSize / 2) | 0;
  return {
    size: cropSize,
    heights,
    metersPerSample: mps,
    widthMeters: cropSize * mps,
    center: { lat, lon },
    minH,
    maxH,
    centerH: heights[c * cropSize + c],
    zoom,
  };
}

/**
 * Fetch satellite imagery covering the same square as the terrain grid, at one
 * zoom level finer than the terrain for sharper texture.
 */
export async function fetchImagery(
  lat: number,
  lon: number,
  terrainZoom: number,
  onProgress?: (done: number, total: number) => void,
): Promise<HTMLCanvasElement> {
  const zoom = terrainZoom + 1;
  const n = TILES_PER_SIDE * 2;
  const half = n / 2;
  const cx = lonToTileX(lon, zoom);
  const cy = latToTileY(lat, zoom);
  const x0 = Math.floor(cx) - Math.floor(half);
  const y0 = Math.floor(cy) - Math.floor(half);
  const size = n * 256;
  const cropSize = size - 512; // matches the terrain crop (one terrain tile = two imagery tiles)
  const offX = Math.round((cx - x0) * 256 - cropSize / 2);
  const offY = Math.round((cy - y0) * 256 - cropSize / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2b3a2e';
  ctx.fillRect(0, 0, size, size);

  const jobs: Promise<void>[] = [];
  let done = 0;
  const total = n * n;
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      jobs.push(
        loadImage(IMAGERY_URL(zoom, x0 + tx, y0 + ty))
          .then((img) => ctx.drawImage(img, tx * 256, ty * 256))
          .catch(() => {})
          .finally(() => onProgress?.(++done, total)),
      );
    }
  }
  await Promise.all(jobs);

  const out = document.createElement('canvas');
  out.width = cropSize;
  out.height = cropSize;
  out.getContext('2d')!.drawImage(canvas, offX, offY, cropSize, cropSize, 0, 0, cropSize, cropSize);
  return out;
}

/** Bilinear sample of the heightmap at fractional grid coordinates. */
export function sampleHeight(t: TerrainData, px: number, py: number): number {
  const s = t.size;
  const x = Math.max(0, Math.min(s - 1.001, px));
  const y = Math.max(0, Math.min(s - 1.001, py));
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const h = t.heights;
  const h00 = h[y0 * s + x0];
  const h10 = h[y0 * s + x0 + 1];
  const h01 = h[(y0 + 1) * s + x0];
  const h11 = h[(y0 + 1) * s + x0 + 1];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
}

/** Height at a local east/north offset (metres) from the centre. */
export function heightAtENU(t: TerrainData, east: number, north: number): number {
  const px = t.size / 2 + east / t.metersPerSample;
  const py = t.size / 2 - north / t.metersPerSample;
  return sampleHeight(t, px, py);
}

/** Geographic bounds of the terrain square (approximate, for display). */
export function terrainBounds(t: TerrainData) {
  const halfPx = t.size / 2;
  const cx = lonToTileX(t.center.lon, t.zoom) * 256;
  const cy = latToTileY(t.center.lat, t.zoom) * 256;
  return {
    west: tileXToLon((cx - halfPx) / 256, t.zoom),
    east: tileXToLon((cx + halfPx) / 256, t.zoom),
    north: tileYToLat((cy - halfPx) / 256, t.zoom),
    south: tileYToLat((cy + halfPx) / 256, t.zoom),
  };
}
