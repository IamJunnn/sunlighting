import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface Props {
  text: string;
  position: [number, number, number];
  color?: string;
  /** Font size in CSS px at 2x resolution. */
  fontSize?: number;
  /** World-space height of the sprite. */
  height: number;
  background?: string;
  bold?: boolean;
}

/** A camera-facing text label drawn to a canvas, so it needs no HTML overlay or web fonts. */
export function TextSprite({ text, position, color = '#fff', fontSize = 28, height, background, bold = true }: Props) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = `${bold ? '700' : '500'} ${fontSize}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.font = font;
    const padX = background ? fontSize * 0.6 : 4;
    const w = Math.ceil(ctx.measureText(text).width + padX * 2);
    const h = Math.ceil(fontSize * 1.5);
    canvas.width = w;
    canvas.height = h;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    if (background) {
      ctx.fillStyle = background;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, h / 2);
      ctx.fill();
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
    }
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    return { texture, aspect: w / h };
  }, [text, color, fontSize, background, bold]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} sizeAttenuation />
    </sprite>
  );
}
