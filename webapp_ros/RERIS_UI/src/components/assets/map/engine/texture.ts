// src/components/map/engine/texture.ts
import type { OccupancyGrid } from '../interfaces/map_interface';

export interface LutConfig {
  free: number;      // brightness for free (0) cells [0-255], default 240
  occupied: number;  // brightness for occupied (100) cells [0-255], default 0
  unknown: number;   // brightness for unknown (-1) cells [0-255], default 127
}

export function generateMapTexture(map: OccupancyGrid, lutCfg?: LutConfig): HTMLCanvasElement {
  const { width, height, data } = map;
  const tex = document.createElement('canvas');
  tex.width = width; tex.height = height;
  const ctx = tex.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('Canvas 2D not available');

  ctx.imageSmoothingEnabled = false;
  const imgData = ctx.createImageData(width, height);
  const img = imgData.data;

  const lutFree     = lutCfg?.free     ?? 240;
  const lutOccupied = lutCfg?.occupied ?? 0;
  const lutUnknown  = lutCfg?.unknown  ?? 127;

  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    if (i === 255) lut[i] = lutUnknown;
    else if (i === 0) lut[i] = lutFree;
    else if (i === 100) lut[i] = lutOccupied;
    else lut[i] = Math.max(0, 255 - i * 2.55);
  }

  for (let i = 0; i < data.length; i++) {
    const v = data[i] === -1 ? 255 : Math.max(0, Math.min(255, data[i]));
    const c = lut[v];
    const x = i % width;
    const y = Math.floor(i / width);
    const fy = height - 1 - y;
    const idx = (fy * width + x) * 4;
    img[idx] = c; img[idx+1] = c; img[idx+2] = c; img[idx+3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return tex;
}


export function decompressData(compressedData: [number, number][]) {
  const result: number[] = [];
  for (const [value, count] of compressedData) {
    for (let i = 0; i < count; i++) {
      result.push(value);
    }
  }
  return result;
};
