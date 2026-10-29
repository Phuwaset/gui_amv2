<template>
  <div class="map-brush-editor">
    <div class="toolbar">
      <label>
        Load PGM
        <input type="file" accept=".pgm" @change="onLoadPGM" hidden />
      </label>
      <label>
        Load YAML
        <input type="file" accept=".yaml,.yml" @change="onLoadYAML" hidden />
      </label>

      <select v-model="mode" title="Brush Mode">
        <option value="free">Free (วาดพื้นที่ว่าง)</option>
        <option value="occ">Occupied (วาดสิ่งกีดขวาง)</option>
        <option value="erase">Erase (คืนสภาพเดิม)</option>
      </select>

      <label>Size <input type="range" min="1" max="200" v-model.number="brushSize" /></label>
      <label>Strength <input type="range" min="1" max="255" v-model.number="brushStrength" /></label>
      <label>Feather <input type="range" min="0" max="1" step="0.05" v-model.number="feather" /></label>
      <label><input type="checkbox" v-model="showGrid" /> Grid</label>

      <button @click="undo" :disabled="!canUndo">Undo</button>
      <button @click="redo" :disabled="!canRedo">Redo</button>
      <button @click="downloadPGM" :disabled="!pgm">Export PGM</button>
      <button @click="downloadYAML" :disabled="!yamlText">Export YAML</button>
    </div>

    <div
      class="canvas-wrap"
      ref="wrapRef"
      @wheel.prevent="onWheel"
      @mousedown="onPointerDown"
      @mousemove="onPointerMove"
      @mouseup="onPointerUp"
      @mouseleave="onPointerUp"
    >
      <canvas ref="canvasRef"></canvas>
      <div v-if="pgm" class="hint">Scroll: Zoom • Right-drag: Pan • Left-drag: Paint</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, watch, computed, onMounted } from "vue";
import { parsePGM, encodePGM, type PgmData } from "@/utils/pgm";
import { parseRosYaml, updateImagePath, type RosMapYaml } from "@/utils/mapYaml";

type Mode = "free" | "occ" | "erase";

const canvasRef = ref<HTMLCanvasElement|null>(null);
const wrapRef = ref<HTMLDivElement|null>(null);

const state = reactive({
  scale: 1,
  tx: 0,
  ty: 0,
  dragging: false,
  panning: false,
  lastX: 0,
  lastY: 0
});

const pgm = ref<PgmData|null>(null);
const originalPixels = ref<Uint8ClampedArray|null>(null);
const yaml = ref<RosMapYaml|null>(null);
const yamlText = ref<string>("");

const mode = ref<Mode>("free");
const brushSize = ref(30);
const brushStrength = ref(255); // 0..255
const feather = ref(0.3);
const showGrid = ref(true);

// Undo/Redo
const undoStack: Uint8ClampedArray[] = [];
const redoStack: Uint8ClampedArray[] = [];
const canUndo = computed(()=> undoStack.length>0);
const canRedo = computed(()=> redoStack.length>0);

function pushUndo(snapshot?: Uint8ClampedArray) {
  if (!pgm.value) return;
  const snap = snapshot ?? new Uint8ClampedArray(pgm.value.pixels);
  undoStack.push(snap);
  // limit
  if (undoStack.length > 30) undoStack.shift();
  // clear redo on new op
  redoStack.length = 0;
}
function undo() {
  if (!pgm.value || undoStack.length===0) return;
  const current = new Uint8ClampedArray(pgm.value.pixels);
  const prev = undoStack.pop()!;
  redoStack.push(current);
  pgm.value.pixels.set(prev);
  draw();
}
function redo() {
  if (!pgm.value || redoStack.length===0) return;
  const current = new Uint8ClampedArray(pgm.value.pixels);
  const next = redoStack.pop()!;
  undoStack.push(current);
  pgm.value.pixels.set(next);
  draw();
}

function onLoadPGM(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  parsePGM(file).then(data => {
    pgm.value = data;
    originalPixels.value = new Uint8ClampedArray(data.pixels);
    fitToScreen();
    pushUndo(new Uint8ClampedArray(data.pixels)); // initial snapshot
    draw();
  }).catch(err => alert(err.message));
}

function onLoadYAML(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  file.text().then(text => {
    yamlText.value = text;
    try {
      yaml.value = parseRosYaml(text);
    } catch (err:any) {
      alert("YAML parse warning: " + err.message);
    }
  });
}

// Painting
let painting = false;

function applyBrush(worldX: number, worldY: number, commit=false) {
  if (!pgm.value || !canvasRef.value) return;

  // worldX/worldY เป็นพิกัดบนแคนวาสหลัง invert transform → แปลงเป็นพิกัดพิกเซล
  const { width, height, pixels, maxval } = pgm.value;
  const cx = Math.floor(worldX);
  const cy = Math.floor(worldY);
  const r = Math.max(1, Math.floor(brushSize.value/2));

  const negate = yaml.value?.negate ?? 0; // 0: 0=free 255=occ, 1: ตรงข้าม
  // mapping โหมดวาด → ค่า gray เป้าหมาย
  // map_server ปกติ: 0=ฟรี, 205+=อาจถูกครอบครอง, 254-255=เต็ม
  const targetGray = ((): number => {
    if (mode.value === "erase" && originalPixels.value) {
      return -1; // สั่งอ่านคืนค่าเก่า
    }
    const occGray = negate ? 0 : 255;
    const freeGray = negate ? 255 : 0;
    return mode.value === "occ" ? occGray : freeGray;
  })();

  pushUndo(); // snapshot ก่อนลงแปรงครั้งใหม่

  const s = brushStrength.value; // 0..255
  const f = feather.value;       // 0..1

  const x0 = Math.max(0, cx - r);
  const y0 = Math.max(0, cy - r);
  const x1 = Math.min(width-1, cx + r);
  const y1 = Math.min(height-1, cy + r);

  for (let y=y0; y<=y1; y++) {
    for (let x=x0; x<=x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;

      // น้ำหนักตามระยะ (feather): ตรงกลางแรงสุด ขอบค่อย ๆ เบา
      const t = Math.max(0, 1 - dist / r);
      const w = f>0 ? Math.pow(t, 1 + 3*f) : 1; // curve

      const idx = y*width + x;

      if (targetGray < 0 && originalPixels.value) {
        pixels[idx] = originalPixels.value[idx];
      } else {
        // blend ตาม strength
        const cur = pixels[idx];
        const tgt = targetGray;
        // linear blend: cur + alpha*(tgt-cur)
        const alpha = (s/255) * w;
        pixels[idx] = clamp8(cur + alpha*(tgt - cur));
      }
    }
  }
  draw();
}

function onPointerDown(ev: MouseEvent) {
  if (!pgm.value) return;
  state.dragging = true;
  state.lastX = ev.clientX;
  state.lastY = ev.clientY;
  state.panning = ev.button === 2 || ev.ctrlKey || ev.metaKey || ev.altKey; // right click หรือกดคีย์ช่วย → pan
  if (!state.panning && ev.button === 0) {
    painting = true;
    const {x,y} = toWorld(ev.clientX, ev.clientY);
    applyBrush(x,y);
  }
}
function onPointerMove(ev: MouseEvent) {
  if (!pgm.value) return;
  if (!state.dragging) return;

  if (state.panning) {
    const dx = ev.clientX - state.lastX;
    const dy = ev.clientY - state.lastY;
    state.tx += dx;
    state.ty += dy;
    state.lastX = ev.clientX;
    state.lastY = ev.clientY;
    draw();
  } else if (painting) {
    const {x,y} = toWorld(ev.clientX, ev.clientY);
    applyBrush(x,y);
  }
}
function onPointerUp() {
  state.dragging = false;
  painting = false;
}

function onWheel(ev: WheelEvent) {
  if (!pgm.value || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;

  const prev = state.scale;
  const delta = Math.sign(ev.deltaY) * -0.1;
  const next = clampf(prev * (1 + delta), 0.1, 20);

  // zoom around mouse
  const wx = (mx - state.tx) / prev;
  const wy = (my - state.ty) / prev;
  state.scale = next;
  state.tx = mx - wx * next;
  state.ty = my - wy * next;

  draw();
}

function toWorld(cx: number, cy: number) {
  const rect = canvasRef.value!.getBoundingClientRect();
  const x = (cx - rect.left - state.tx) / state.scale;
  const y = (cy - rect.top  - state.ty) / state.scale;
  return { x, y };
}

function fitToScreen() {
  if (!pgm.value || !wrapRef.value) return;
  const { width, height } = pgm.value;
  const wrap = wrapRef.value.getBoundingClientRect();
  const scale = Math.min(wrap.width / width, wrap.height / height) * 0.95;
  state.scale = scale;
  state.tx = (wrap.width - width*scale)/2;
  state.ty = (wrap.height - height*scale)/2;
  const c = canvasRef.value!;
  c.width = Math.floor(wrap.width);
  c.height = Math.floor(wrap.height);
}

function draw() {
  if (!pgm.value || !canvasRef.value) return;
  const ctx = canvasRef.value.getContext("2d")!;
  const { width, height, pixels } = pgm.value;

  // เคลียร์
  ctx.clearRect(0,0,canvasRef.value.width, canvasRef.value.height);

  // สร้าง ImageData จาก pixels
  const img = new ImageData(width, height);
  for (let i=0, j=0; i<pixels.length; i++, j+=4) {
    const g = pixels[i];
    img.data[j] = g; img.data[j+1] = g; img.data[j+2] = g; img.data[j+3] = 255;
  }

  // วาดด้วย transform
  ctx.save();
  ctx.setTransform(state.scale, 0, 0, state.scale, state.tx, state.ty);
  ctx.putImageData(img, 0, 0);

  // grid
  if (showGrid.value) {
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1/state.scale;
    const step = 10; // ทุก 10 พิกเซล
    ctx.beginPath();
    for (let x=0; x<=width; x+=step) { ctx.moveTo(x,0); ctx.lineTo(x,height); }
    for (let y=0; y<=height; y+=step) { ctx.moveTo(0,y); ctx.lineTo(width,y); }
    ctx.stroke();
  }

  // brush preview
  if (!state.panning) {
    // จะวาดพรีวิวใน onmousemove ก็ได้ แต่เพื่อความง่ายขอข้าม
  }

  ctx.restore();
}

function downloadPGM() {
  if (!pgm.value) return;
  const data = encodePGM(pgm.value, true);
  const blob = new Blob([data], { type: "image/x-portable-graymap" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "edited_map.pgm";
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadYAML() {
  if (!yamlText.value) return;
  const out = updateImagePath(yamlText.value, "edited_map.pgm");
  const blob = new Blob([out], { type: "text/yaml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "map.yaml";
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(() => {
  const resize = () => {
    if (!canvasRef.value || !wrapRef.value) return;
    const r = wrapRef.value.getBoundingClientRect();
    canvasRef.value.width = Math.floor(r.width);
    canvasRef.value.height = Math.floor(r.height);
    draw();
  };
  window.addEventListener("resize", resize);
  setTimeout(resize, 0);
});
function clamp8(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }
function clampf(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }
</script>

<style scoped>
.map-brush-editor {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
  height: 100%;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.toolbar label { display: inline-flex; gap: 6px; align-items: center; }
.canvas-wrap {
  position: relative;
  width: 100%;
  height: calc(100vh - 160px);
  background: #1c1c1c;
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
  cursor: crosshair;
}
.canvas-wrap canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.canvas-wrap .hint {
  position: absolute; left: 8px; bottom: 8px;
  font-size: 12px; color: #ccc; background: rgba(0,0,0,0.35);
  padding: 4px 6px; border-radius: 4px;
}
</style>
