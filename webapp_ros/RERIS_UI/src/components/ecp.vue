<template class="main-container">
  <div class="map-container">
    <div class="status" :class="{ connected: isConnected, disconnected: !isConnected }">
      {{ isConnected ? 'Connected' : 'Disconnected' }}
    </div>
    <div
      class="canvas-container"
      @wheel="handleWheel"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    >
      <!-- Map Canvas (Static Layer) -->
      <canvas ref="mapCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
      <!-- Robot Canvas (Dynamic Layer) -->
      <canvas ref="robotCanvas" :width="canvasWidth" :height="canvasHeight" @click="handleGoalClick" style="position: absolute; left: 0; top: 0;"></canvas>
    </div>

    <div class="joystick-container" :style="{ bottom: joystickBottomPosition + 'px' }">
      <JoystickComponent @updateVelocity="handleVelocity" />
      <p>Velocity X: {{ Vx.toFixed(2) }}</p>
      <p>Velocity Y: {{ Vy.toFixed(2) }}</p>
    </div>

    <div class="zoom-container">
      <div class="zoom-controls">
        <button @click="zoomIn">+</button>
        <button @click="zoomOut">-</button>
      </div>
      <div class="zoom-size">
        Size: {{ zoomLevel.toFixed(1) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import JoystickComponent from 'components/JoystickComponent.vue';

const mapCanvas = ref<HTMLCanvasElement | null>(null);
const robotCanvas = ref<HTMLCanvasElement | null>(null);

const canvasWidth = ref(1080);
const canvasHeight = ref(1080);
const zoomLevel = ref(1.0);
const offsetX = ref(0);
const offsetY = ref(0);
const isConnected = ref(false);
const Vx = ref(0);
const Vy = ref(0);
const mapData = ref<any>(null);
const robotPosition = ref({ x: 0, y: 0, yaw: 0 });
const singleGoal = ref({ x: 0, y: 0, yaw: 0 });

let mapImageData: HTMLCanvasElement | null = null;

const joystickBottomPosition = computed(() => 10);

function decompressData(compressedData: [number, number][]) {
  const result: number[] = [];
  for (const [value, count] of compressedData) {
    for (let i = 0; i < count; i++) {
      result.push(value);
    }
  }
  return result;
}

function drawMap() {
  if (!mapCanvas.value || !mapData.value) return;
  const ctx = mapCanvas.value.getContext('2d');
  if (!ctx) return;

  const { width, height, data } = mapData.value;

  if (!mapImageData) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    const imgData = tempCtx.createImageData(width, height);
    const imgArray = imgData.data;

    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const x = i % width;
      const y = Math.floor(i / width);
      const flippedY = height - 1 - y;
      const color = val === -1 ? 127 : val === 0 ? 240 : val === 100 ? 0 : 255 - val * 2.55;
      const index = (flippedY * width + x) * 4;
      imgArray[index] = imgArray[index + 1] = imgArray[index + 2] = color;
      imgArray[index + 3] = 255;
    }

    tempCtx.putImageData(imgData, 0, 0);
    mapImageData = tempCanvas;
  }

  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  ctx.drawImage(mapImageData, 0, 0, mapData.value.width, mapData.value.height, offsetX.value, offsetY.value, canvasWidth.value, canvasHeight.value);
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color = "#d00") {
  const { width, height, resolution, origin_x, origin_y } = mapData.value;
  const robotX = ((x - origin_x) / resolution) * (canvasWidth.value / width) + offsetX.value;
  const robotY = ((origin_y + height * resolution - y) / resolution) * (canvasHeight.value / height) + offsetY.value;

  ctx.save();
  ctx.beginPath();
  ctx.arc(robotX, robotY - 10, 10, 0, Math.PI * 2, true);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.closePath();

  ctx.beginPath();
  ctx.moveTo(robotX, robotY);
  ctx.lineTo(robotX - 7, robotY - 10);
  ctx.lineTo(robotX + 7, robotY - 10);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(robotX, robotY - 10, 4, 0, Math.PI * 2, true);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.closePath();
  ctx.restore();
}

function drawRobot() {
  if (!robotCanvas.value || !mapData.value || !robotPosition.value) return;
  const ctx = robotCanvas.value.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  const { x, y, yaw } = robotPosition.value;
  const { resolution, origin_x, origin_y, width, height } = mapData.value;

  const robotX = ((x - origin_x) / resolution) * (canvasWidth.value / width) + offsetX.value;
  const robotY = ((origin_y + height * resolution - y) / resolution) * (canvasHeight.value / height) + offsetY.value;

  const triangleSize = 10 * zoomLevel.value;
  const halfSize = triangleSize / 2;
  const cosA = Math.cos(yaw);
  const sinA = Math.sin(yaw);
  const points = [
    { x: 0, y: -triangleSize },
    { x: -halfSize, y: halfSize },
    { x: halfSize, y: halfSize },
  ].map(({ x, y }) => ({
    x: x * cosA - y * sinA + robotX,
    y: x * sinA + y * cosA + robotY,
  }));

  ctx.fillStyle = "green";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(0,255,0,0.3)";
  ctx.beginPath();
  ctx.arc(robotX, robotY, triangleSize * 2, 0, Math.PI * 2);
  ctx.fill();

  drawMarker(ctx, singleGoal.value.x, singleGoal.value.y);
}

function zoomIn() {
  zoomLevel.value += 0.1;
  drawMap();
  drawRobot();
}

function zoomOut() {
  zoomLevel.value = Math.max(0.1, zoomLevel.value - 0.1);
  drawMap();
  drawRobot();
}

function handleGoalClick(e: MouseEvent) {
  const rect = robotCanvas.value!.getBoundingClientRect();
  const clickX = (e.clientX - rect.left - offsetX.value) / zoomLevel.value;
  const clickY = (e.clientY - rect.top - offsetY.value) / zoomLevel.value;

  const { origin_x, origin_y, resolution, width, height } = mapData.value;
  const worldX = origin_x + clickX * resolution;
  const worldY = origin_y + (height - clickY) * resolution;

  singleGoal.value = { x: worldX, y: worldY, yaw: 0 };
  drawRobot();
}

function handleVelocity(velocity: { Vx: number; Vy: number }) {
  Vx.value = velocity.Vx;
  Vy.value = velocity.Vy;
}

function handleWheel(e: WheelEvent) {
  if (e.deltaY < 0) zoomIn();
  else zoomOut();
  e.preventDefault();
}

function handleMouseDown() {}
function handleMouseMove() {}
function handleMouseUp() {}
function handleTouchStart() {}
function handleTouchMove() {}
function handleTouchEnd() {}

onMounted(() => {
  drawMap();
  drawRobot();
});
</script>

<style scoped>
.canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #7f7f7f;
}
canvas {
  position: absolute;
  top: 0;
  left: 0;
}
</style>