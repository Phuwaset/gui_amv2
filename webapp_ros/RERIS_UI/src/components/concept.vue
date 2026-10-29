<template>
  <div class="main-container">
    <div class="map-container">
      <div class="status" :class="{ connected: isConnected, disconnected: !isConnected }">
        {{ isConnected ? 'Connected' : 'Disconnected' }}
      </div>
      <div class="canvas-container" 
           @wheel.prevent="handleWheel" 
           @touchstart.prevent="handleTouchStart" 
           @touchmove.prevent="handleTouchMove"
           @touchend.prevent="handleTouchEnd" 
           @mousedown="handleMouseDown" 
           @mousemove="handleMouseMove" 
           @mouseup="handleMouseUp"
           @mouseleave="handleMouseUp">
        <canvas ref="canvas"></canvas>
      </div>
    </div>
    <!-- Joystick Container -->
    <div class="joystick-container">
      <JoystickComponent @updateVelocity="handleVelocity" />
      <p>Velocity X: {{ Vx.toFixed(2) }}</p>
      <p>Velocity Y: {{ Vy.toFixed(2) }}</p>
    </div>
    <!-- Zoom Controls -->
    <div class="zoom-container">
      <div class="zoom-controls">
        <button @click="zoomIn">+</button>
        <button @click="zoomOut">-</button>
      </div>
      <div class="zoom-size">
        Zoom: {{ zoomLevel.toFixed(1) }}x
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import JoystickComponent from 'components/JoystickComponent.vue';
import { ref, onMounted, onBeforeUnmount } from 'vue';

// --- INTERFACES ---
interface OccupancyGrid {
  width: number;
  height: number;
  resolution: number;
  origin_x: number;
  origin_y: number;
  data: number[];
  downsampled: boolean;
  originalDimensions: { width: number; height: number };
}

interface Goal {
  x: number; // world coordinates
  y: number; // world coordinates
  yaw: number; // world coordinates
  id: number;
}

interface GoalPreview {
    x: number;
    y: number;
    yaw: number;
}

// --- STATE REFS ---
const canvas = ref<HTMLCanvasElement | null>(null);
const mapData = ref<OccupancyGrid | null>(null);
const robotPosition = ref<{ x: number; y: number, yaw: number }>({ x: 0, y: 0, yaw: 0 });
const isConnected = ref(false);

// Interaction State
const zoomLevel = ref(1.0);
const offsetX = ref(0);
const offsetY = ref(0);
const isDragging = ref(false);
const startDrag = ref({ x: 0, y: 0 });

// Goal State
const goals = ref<Goal[]>([]);
const isSettingGoal = ref(false);
const newGoalPreview = ref<GoalPreview | null>(null);
let goalIdCounter = 0;
let pressTimeout: number | null = null;

// WebSocket and Velocity
let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;
const Vx = ref(0);
const Vy = ref(0);

// Touch State
let touchStartDist = 0;
let touchStartZoom = 1.0;

// Performance
let resizeTimeout: number | null = null;
let isDrawing = false;
let lastDrawTime = 0;
const DRAW_INTERVAL = 1000 / 30; // 30 FPS
let mapImageData: HTMLCanvasElement | null = null;
let lastDrawnMapDataString: string | null = null;

// --- FUNCTIONS ---

/**
 * Converts screen coordinates (from a click or touch event) to world coordinates.
 * @param {number} screenX - The x-coordinate on the screen.
 * @param {number} screenY - The y-coordinate on the screen.
 * @returns { {x: number, y: number} | null } The world coordinates or null if data is missing.
 */
const screenToWorld = (screenX: number, screenY: number) => {
    if (!canvas.value || !mapData.value) return null;

    const { resolution, origin_x, origin_y, width: mapWidth, height: mapHeight } = mapData.value;
    const rect = canvas.value.getBoundingClientRect();

    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    const mapPixelX = (canvasX - offsetX.value) / zoomLevel.value;
    const mapPixelY = (canvasY - offsetY.value) / zoomLevel.value;

    if (mapPixelX < 0 || mapPixelX > mapWidth || mapPixelY < 0 || mapPixelY > mapHeight) {
        return null; // Click is outside the map bounds
    }

    const worldX = origin_x + mapPixelX * resolution;
    const worldY = origin_y + (mapHeight - mapPixelY) * resolution;

    return { x: worldX, y: worldY };
}


const handleVelocity = (velocity: { Vx: number, Vy: number }) => {
  Vx.value = velocity.Vx;
  Vy.value = velocity.Vy;

  if (ws && isConnected.value) {
    let velocityData = { "Vx": Vx.value, "Vy": Vy.value };
    ws.send(JSON.stringify(velocityData));
  }
};

const connectWebSocket = () => {
  if (ws) ws.close();
  ws = new WebSocket('ws://192.168.10.2:7448');

  ws.onopen = () => {
    console.log('WebSocket connection established');
    isConnected.value = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  };

  ws.onmessage = (event) => {
    try {
      const { map, odom } = JSON.parse(event.data);
      if (map?.data) {
        mapData.value = {
          ...map,
          resolution: map.resolution,
          origin_x: map.origin?.[0] ?? 0,
          origin_y: map.origin?.[1] ?? 0,
          data: map.compressed ? decompressData(map.data) : map.data,
        };
      }
      if (odom?.position) {
        robotPosition.value = {
          x: odom.position.x,
          y: odom.position.y,
          yaw: -(quaternionToEuler(odom.orientation.x, odom.orientation.y, odom.orientation.z, odom.orientation.w).yaw - Math.PI / 2)
        };
        checkGoalReached();
      }
      drawMap();
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };

  ws.onerror = (error) => console.error('WebSocket error:', error);

  ws.onclose = () => {
    isConnected.value = false;
    console.log('WebSocket closed. Attempting to reconnect...');
    reconnectTimeout = window.setTimeout(connectWebSocket, 5000);
  };
}

/**
 * Checks if the robot has reached the current goal and removes it if so.
 */
const checkGoalReached = () => {
    if (goals.value.length === 0) return;

    const currentGoal = goals.value[0];
    const { x: robotX, y: robotY } = robotPosition.value;

    const distance = Math.hypot(robotX - currentGoal.x, robotY - currentGoal.y);

    if (distance < 0.1) { // 10cm threshold
        console.log(`Goal ${currentGoal.id} reached! Removing.`);
        goals.value.shift(); // Remove the first goal from the array
        drawMap(true);
    }
}

const decompressData = (compressedData: [number, number][]) => {
  const result: number[] = [];
  for (const [value, count] of compressedData) {
    for (let i = 0; i < count; i++) {
      result.push(value);
    }
  }
  return result;
};

// --- INTERACTION HANDLERS ---

const zoomIn = () => {
  zoomLevel.value = Math.min(5.0, zoomLevel.value + 0.1);
  drawMap(true);
};
const zoomOut = () => {
  zoomLevel.value = Math.max(0.1, zoomLevel.value - 0.1);
  drawMap(true);
};
const handleWheel = (event: WheelEvent) => {
  event.preventDefault();
  if (event.deltaY < 0) zoomIn();
  else zoomOut();
};

const handleMouseDown = (event: MouseEvent) => {
  startDrag.value = { x: event.clientX, y: event.clientY };
  pressTimeout = window.setTimeout(() => {
    isDragging.value = false; // Prevent panning
    isSettingGoal.value = true;
    const worldPos = screenToWorld(event.clientX, event.clientY);
    if (worldPos) {
        newGoalPreview.value = { ...worldPos, yaw: 0 };
    }
    pressTimeout = null;
  }, 250); // 250ms for a long press
  isDragging.value = true;
};

const handleMouseMove = (event: MouseEvent) => {
  if (isSettingGoal.value && newGoalPreview.value) {
    const worldPos = screenToWorld(event.clientX, event.clientY);
    if (worldPos) {
        const dx = worldPos.x - newGoalPreview.value.x;
        const dy = worldPos.y - newGoalPreview.value.y;
        newGoalPreview.value.yaw = Math.atan2(dy, dx);
        drawMap(true);
    }
  } else if (isDragging.value) {
    if (pressTimeout) { // If moved before long press timeout, cancel it
        clearTimeout(pressTimeout);
        pressTimeout = null;
    }
    const dx = event.clientX - startDrag.value.x;
    const dy = event.clientY - startDrag.value.y;
    offsetX.value += dx;
    offsetY.value += dy;
    startDrag.value = { x: event.clientX, y: event.clientY };
    drawMap(true);
  }
};

const handleMouseUp = () => {
  if (pressTimeout) {
    clearTimeout(pressTimeout);
    pressTimeout = null;
  }
  if (isSettingGoal.value && newGoalPreview.value) {
    // Finalize the goal
    goals.value = [{ ...newGoalPreview.value, id: ++goalIdCounter }]; // Replace old goals
    console.log('New goal set:', goals.value[0]);
  }
  isDragging.value = false;
  isSettingGoal.value = false;
  newGoalPreview.value = null;
  drawMap(true);
};

// Touch handlers would mirror the mouse handlers with similar logic
const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    startDrag.value = { x: touch.clientX, y: touch.clientY };
    pressTimeout = window.setTimeout(() => {
        isDragging.value = false;
        isSettingGoal.value = true;
        const worldPos = screenToWorld(touch.clientX, touch.clientY);
        if (worldPos) {
            newGoalPreview.value = { ...worldPos, yaw: 0 };
        }
        pressTimeout = null;
    }, 250);
    isDragging.value = true;
};
const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (isSettingGoal.value && newGoalPreview.value) {
        const worldPos = screenToWorld(touch.clientX, touch.clientY);
        if (worldPos) {
            const dx = worldPos.x - newGoalPreview.value.x;
            const dy = worldPos.y - newGoalPreview.value.y;
            newGoalPreview.value.yaw = Math.atan2(dy, dx);
            drawMap(true);
        }
    } else if (isDragging.value) {
        if (pressTimeout) {
            clearTimeout(pressTimeout);
            pressTimeout = null;
        }
        const dx = touch.clientX - startDrag.value.x;
        const dy = touch.clientY - startDrag.value.y;
        offsetX.value += dx;
        offsetY.value += dy;
        startDrag.value = { x: touch.clientX, y: touch.clientY };
        drawMap(true);
    }
};
const handleTouchEnd = () => {
    if (pressTimeout) {
        clearTimeout(pressTimeout);
        pressTimeout = null;
    }
    if (isSettingGoal.value && newGoalPreview.value) {
        goals.value = [{ ...newGoalPreview.value, id: ++goalIdCounter }];
        console.log('New goal set:', goals.value[0]);
    }
    isDragging.value = false;
    isSettingGoal.value = false;
    newGoalPreview.value = null;
    drawMap(true);
};


function quaternionToEuler(x: number, y: number, z: number, w: number) {
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);
  return { roll: 0, pitch, yaw };
}

const drawMap = (force: boolean = false) => {
  if ((isDrawing && !force) || !canvas.value || !mapData.value) return;
  const currentTime = performance.now();
  if (currentTime - lastDrawTime < DRAW_INTERVAL && !force) return;
  
  isDrawing = true;
  lastDrawTime = currentTime;

  requestAnimationFrame(() => {
    const ctx = canvas.value!.getContext('2d');
    if (!ctx) { isDrawing = false; return; }

    ctx.imageSmoothingEnabled = false;
    const { width, height, data, resolution, origin_x, origin_y } = mapData.value;
    
    const container = canvas.value!.parentElement;
    if(container && (canvas.value!.width !== container.clientWidth || canvas.value!.height !== container.clientHeight)) {
        canvas.value!.width = container.clientWidth;
        canvas.value!.height = container.clientHeight;
    }
    const canvasWidth = canvas.value!.width;
    const canvasHeight = canvas.value!.height;

    const currentMapDataString = JSON.stringify(data);
    if (currentMapDataString !== lastDrawnMapDataString) {
        lastDrawnMapDataString = currentMapDataString;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            const imgData = tempCtx.createImageData(width, height);
            for (let i = 0; i < data.length; i++) {
                const val = data[i];
                const x = i % width;
                const y = Math.floor(i / width);
                const flippedY = height - 1 - y;
                const color = val === -1 ? 127 : val === 0 ? 240 : val === 100 ? 0 : 255 - val * 2.55;
                const index = (flippedY * width + x) * 4;
                imgData.data[index] = imgData.data[index + 1] = imgData.data[index + 2] = color;
                imgData.data[index + 3] = 255;
            }
            tempCtx.putImageData(imgData, 0, 0);
            mapImageData = tempCanvas;
        }
    }
    
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.save();
    ctx.translate(offsetX.value, offsetY.value);
    ctx.scale(zoomLevel.value, zoomLevel.value);
    
    if (mapImageData) ctx.drawImage(mapImageData, 0, 0);

    // Draw Robot
    if (robotPosition.value) {
      const { x, y, yaw } = robotPosition.value;
      const robotPixelX = (x - origin_x) / resolution;
      const robotPixelY = height - ((y - origin_y) / resolution);
      ctx.save();
      ctx.translate(robotPixelX, robotPixelY);
      ctx.rotate(-yaw + Math.PI / 2);
      const triangleSize = 10 / zoomLevel.value;
      ctx.fillStyle = "green";
      ctx.beginPath();
      ctx.moveTo(0, -triangleSize);
      ctx.lineTo(-triangleSize / 2, triangleSize / 2);
      ctx.lineTo(triangleSize / 2, triangleSize / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Draw Finalized Goals
    goals.value.forEach(goal => {
        const goalPixelX = (goal.x - origin_x) / resolution;
        const goalPixelY = height - ((goal.y - origin_y) / resolution);
        ctx.save();
        ctx.translate(goalPixelX, goalPixelY);
        ctx.rotate(goal.yaw);
        const arrowSize = 15 / zoomLevel.value;
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2 / zoomLevel.value;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-arrowSize, -arrowSize / 2);
        ctx.lineTo(-arrowSize, arrowSize / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    });

    // Draw Goal Preview
    if (isSettingGoal.value && newGoalPreview.value) {
        const { x, y, yaw } = newGoalPreview.value;
        const pixelX = (x - origin_x) / resolution;
        const pixelY = height - ((y - origin_y) / resolution);
        ctx.save();
        ctx.translate(pixelX, pixelY);
        ctx.rotate(yaw);
        const arrowSize = 20 / zoomLevel.value;
        ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2 / zoomLevel.value;
        ctx.beginPath();
        ctx.moveTo(arrowSize, 0);
        ctx.lineTo(0, -arrowSize/2);
        ctx.lineTo(0, arrowSize/2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();
    isDrawing = false;
  });
};

const debouncedDrawMap = () => {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => drawMap(true), 100);
};

onMounted(() => {
  connectWebSocket();
  window.addEventListener('resize', debouncedDrawMap);
  drawMap(true);
});

onBeforeUnmount(() => {
  if (ws) ws.close();
  window.removeEventListener('resize', debouncedDrawMap);
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (resizeTimeout) clearTimeout(resizeTimeout);
});

</script>

<style scoped>
.main-container, .map-container, .canvas-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #333;
  color: #fff;
}
.map-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}
.canvas-container {
  cursor: grab;
  touch-action: none; /* Prevents default browser actions like scrolling */
}
.canvas-container:active {
  cursor: grabbing;
}
canvas {
  display: block;
}
.status {
  position: fixed;
  top: 10px;
  left: 10px;
  font-size: 1.2em;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 5px 10px;
  border-radius: 5px;
  z-index: 10;
}
.connected { color: #4caf50; }
.disconnected { color: #f44336; }

.joystick-container {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 10;
  text-align: center;
}
.joystick-container p {
    background-color: rgba(0, 0, 0, 0.5);
    padding: 2px 5px;
    border-radius: 3px;
    margin-top: 5px;
}

.zoom-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10;
  background-color: rgba(25, 25, 25, 0.6);
  border: 1px solid #555;
  padding: 10px;
  border-radius: 5px;
  text-align: center;
}
.zoom-controls {
  display: flex;
  flex-direction: column;
}
.zoom-controls button {
  font-size: 24px;
  font-weight: bold;
  padding: 5px 12px;
  margin: 5px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  border: 1px solid #777;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.zoom-controls button:hover {
  background-color: rgba(0, 0, 0, 1);
}
.zoom-size {
  margin-top: 10px;
  font-size: 16px;
}
</style>
