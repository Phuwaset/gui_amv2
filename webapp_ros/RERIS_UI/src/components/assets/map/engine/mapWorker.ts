
// src/components/map/engine/mapWorker.ts
export type WInit = { type: 'INIT', width: number, height: number };
export type WUpdate = { type: 'UPDATE_GRID', width: number, height: number, data: Uint8Array };
export type WBuild  = { type: 'BUILD' };
export type WMsg = WInit | WUpdate | WBuild;

let off: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let w = 0, h = 0;
let latest: Uint8Array | null = null;

function ensureCanvas(width: number, height: number) {
  if (!off || width !== w || height !== h) {
    w = width; h = height;
    off = new OffscreenCanvas(w, h);
    ctx = off.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  }
}

self.onmessage = async (ev: MessageEvent<WMsg>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'INIT': {
      ensureCanvas(msg.width, msg.height);
      break;
    }
    case 'UPDATE_GRID': {
      ensureCanvas(msg.width, msg.height);
      latest = msg.data;
      break;
    }
    case 'BUILD': {
      if (!off || !ctx || !latest) {
        (self as any).postMessage({ type: 'BUILT', ok: false });
        break;
      }
      const img = ctx.createImageData(w, h);
      const dst = img.data;
      for (let i = 0, px = 0; i < latest.length; i++, px += 4) {
        const v = latest[i] as any as number;
        let gray: number;
        if (v < 0) gray = 205;
        else if (v >= 65) gray = 0;
        else gray = 254;
        dst[px + 0] = gray;
        dst[px + 1] = gray;
        dst[px + 2] = gray;
        dst[px + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const bmp = off.transferToImageBitmap();
      (self as any).postMessage({ type: 'BUILT', ok: true, bitmap: bmp }, [bmp as any]);
      break;
    }
  }
};
