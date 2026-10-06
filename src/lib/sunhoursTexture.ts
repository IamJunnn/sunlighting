// Builds the sun-hours heatmap texture: a hillshaded (grayscale imagery) base with a
// sequential single-hue ramp on top.

import type { SunHoursLayer } from '../store';

/** Sequential single-hue (orange) ramp: dark = few hours, bright = many. */
function sunHoursColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [38, 18, 8]],
    [0.35, [140, 52, 18]],
    [0.7, [233, 120, 40]],
    [1, [255, 236, 170]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}

export function buildSunHoursCanvas(imagery: HTMLCanvasElement | null, sh: SunHoursLayer): HTMLCanvasElement {
  const heat = document.createElement('canvas');
  heat.width = sh.size;
  heat.height = sh.size;
  const hctx = heat.getContext('2d')!;
  const img = hctx.createImageData(sh.size, sh.size);
  const lo = sh.minHours;
  const span = Math.max(sh.maxHours - lo, 0.5);
  for (let i = 0; i < sh.hours.length; i++) {
    const [r, g, b] = sunHoursColor((sh.hours[i] - lo) / span);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  hctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  const size = imagery ? imagery.width : 1024;
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d')!;
  if (imagery) {
    ctx.filter = 'grayscale(1) contrast(1.2) brightness(1.15)';
    ctx.drawImage(imagery, 0, 0, size, size);
    ctx.filter = 'none';
    ctx.globalAlpha = 0.72;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(heat, 0, 0, size, size);
  return out;
}

