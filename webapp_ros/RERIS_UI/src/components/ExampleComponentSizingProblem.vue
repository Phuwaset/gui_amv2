<template>
  <div class="main-container">
    <div class="map-container">
      <div class="status" :class="{ connected: isConnected, disconnected: !isConnected }">
        {{ isConnected ? 'Connected' : 'Disconnected' }}
      </div>
      <div class="canvas-container" ref="canvasContainer" @wheel="handleWheel" @touchstart="handleTouchStart"
        @touchmove="handleTouchMove" @touchend="handleTouchEnd" @mousedown="handleMouseDown"
        @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseUp">

        <!-- Main composite canvas with hardware acceleration -->
        <canvas ref="canvas" :width="canvasWidth" :height="canvasHeight" @click="handleGoalClick" class="main-canvas">
        </canvas>

        <!-- Debug layer visibility controls (optional) -->
        <div class="layer-controls" v-if="showDebugControls">
          <label>
            <input type="checkbox" v-model="layerVisibility.map" @change="forceRedraw"> Map
          </label>
          <label>
            <input type="checkbox" v-model="layerVisibility.robot" @change="forceRedraw"> Robot
          </label>
          <label>
            <input type="checkbox" v-model="layerVisibility.target" @change="forceRedraw"> Target
          </label>
        </div>
      </div>
    </div>

    <!-- Joystick Container -->
    <div class="joystick-container" :style="{ bottom: joystickBottomPosition + 'px' }">
      <JoystickComponent @updateVelocity="handleVelocity" />
      <p>Velocity X: {{ Vx.toFixed(2) }}</p>
      <p>Velocity Y: {{ Vy.toFixed(2) }}</p>
    </div>

    <div class="zoom-container">
      <div class="zoom-controls">
        <button @click="zoomIn" :disabled="zoomLevel >= maxZoom">+</button>
        <button @click="zoomOut" :disabled="zoomLevel <= minZoom">-</button>
      </div>
      <div class="zoom-size">
        Size: {{ zoomLevel.toFixed(1) }}x
      </div>
      <div class="performance-info" v-if="showPerformanceInfo">
        <div>FPS: {{ currentFPS }}</div>
        <div>Frame Time: {{ averageFrameTime.toFixed(1) }}ms</div>
        <div>Rendered: {{ renderedFrames }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import JoystickComponent from 'components/JoystickComponent.vue';
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';

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

interface Transform {
  scale: number;
  translateX: number;
  translateY: number;
}

// Canvas and rendering refs
const canvas = ref<HTMLCanvasElement | null>(null);
const canvasContainer = ref<HTMLElement | null>(null);
const canvasWidth = ref(1080);
const canvasHeight = ref(1080);

// Map data and state
const mapData = ref<OccupancyGrid | null>(null);
const robotPosition = ref<{ x: number; y: number, yaw: number }>({ x: 0, y: 0, yaw: 0 });
const singleGoal = ref<{ x: number; y: number, yaw: number }>({ x: 0, y: 0, yaw: 0 });
const isConnected = ref(false);

// Transform and interaction state
const transform = ref<Transform>({ scale: 1.0, translateX: 0, translateY: 0 });
const zoomLevel = ref(1.0);
const minZoom = 0.1;
const maxZoom = 10.0;
const isDragging = ref(false);
const lastPointerPos = ref({ x: 0, y: 0 });

// Resolution-aware state - NEW
const previousCanvasSize = ref({ width: 0, height: 0 });
const mapCenterWorld = ref({ x: 0, y: 0 }); // Track world center point

// Touch handling
const touchState = ref({
  active: false,
  startDist: 0,
  startZoom: 1.0,
  startPos: { x: 0, y: 0 },
  lastPos: { x: 0, y: 0 }
});

// Velocity control
const Vx = ref(0);
const Vy = ref(0);

// Performance and rendering state
const showDebugControls = ref(false);
const showPerformanceInfo = ref(true);
const currentFPS = ref(0);
const averageFrameTime = ref(0);
const renderedFrames = ref(0);

// Layer management
const layerVisibility = ref({
  map: true,
  robot: true,
  target: true
});

// Optimized rendering system
const renderState = {
  mapImageData: null as ImageData | null,
  mapTexture: null as HTMLCanvasElement | null,
  lastMapHash: '',
  lastRobotState: { x: 0, y: 0, yaw: 0, hash: '' },
  lastTargetState: { x: 0, y: 0, yaw: 0, hash: '' },
  needsFullRedraw: true,
  animationFrameId: 0
};

// Performance monitoring
const performanceState = {
  frameCount: 0,
  lastFPSTime: performance.now(),
  frameTimes: [] as number[],
  lastFrameTime: performance.now()
};

// WebSocket
let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;

// Computed properties
const joystickBottomPosition = computed(() => 20);


// Fixed sections of your Vue component

// FIXED: World coordinate utilities with proper bounds checking
const worldToCanvas = (worldX: number, worldY: number) => {
  if (!mapData.value) return { x: 0, y: 0 };

  const { resolution, origin_x, origin_y, height } = mapData.value;

  // Convert world to map pixel coordinates
  const mapPixelX = (worldX - origin_x) / resolution;
  const mapPixelY = (origin_y + height * resolution - worldY) / resolution;

  // Apply transform to get canvas coordinates
  const canvasX = mapPixelX * transform.value.scale + transform.value.translateX;
  const canvasY = mapPixelY * transform.value.scale + transform.value.translateY;

  return { x: canvasX, y: canvasY };
};

const canvasToWorld = (canvasX: number, canvasY: number) => {
  if (!mapData.value) return { x: 0, y: 0 };

  const { resolution, origin_x, origin_y, height } = mapData.value;

  // Convert canvas to map pixel coordinates
  const mapPixelX = (canvasX - transform.value.translateX) / transform.value.scale;
  const mapPixelY = (canvasY - transform.value.translateY) / transform.value.scale;

  // Convert to world coordinates
  const worldX = origin_x + mapPixelX * resolution;
  const worldY = origin_y + (height - mapPixelY) * resolution;

  return { x: worldX, y: worldY };
};

// FIXED: Proper resolution-aware transform adjustment
const adjustTransformForResize = (oldWidth: number, oldHeight: number, newWidth: number, newHeight: number) => {
  if (!mapData.value || oldWidth === 0 || oldHeight === 0) return;

  // Get the current center point of the view in world coordinates
  const oldCenterX = oldWidth / 2;
  const oldCenterY = oldHeight / 2;

  // Convert current center to world coordinates BEFORE transform changes
  const worldCenter = canvasToWorld(oldCenterX, oldCenterY);

  // Calculate where this world point should be on the new canvas
  const newCenterX = newWidth / 2;
  const newCenterY = newHeight / 2;

  // Convert world center back to map pixel coordinates
  const { resolution, origin_x, origin_y, height } = mapData.value;
  const mapPixelX = (worldCenter.x - origin_x) / resolution;
  const mapPixelY = (origin_y + height * resolution - worldCenter.y) / resolution;

  // Calculate new translation to keep the same world point centered
  const newTranslateX = newCenterX - mapPixelX * transform.value.scale;
  const newTranslateY = newCenterY - mapPixelY * transform.value.scale;

  // Apply the new transform immediately (no animation for resize)
  transform.value = {
    scale: transform.value.scale,
    translateX: newTranslateX,
    translateY: newTranslateY
  };

  // Update smooth transform state
  smoothTransform.setCurrent(transform.value);

  console.log('Transform adjusted for resize:', {
    oldSize: { width: oldWidth, height: oldHeight },
    newSize: { width: newWidth, height: newHeight },
    worldCenter,
    newTransform: transform.value
  });
};

// FIXED: Enhanced canvas resize handling with proper state management
const handleResize = () => {
  if (!canvasContainer.value) return;

  const container = canvasContainer.value;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Store previous canvas size for transform adjustment
  const oldWidth = canvasWidth.value;
  const oldHeight = canvasHeight.value;

  // Calculate new display size with mobile considerations
  let newWidth = Math.floor(rect.width);
  let newHeight = Math.floor(rect.height);

  // Mobile viewport adjustments
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    // Account for mobile browsers' dynamic viewport
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // Ensure minimum canvas size on mobile
    newWidth = Math.max(newWidth, 300);
    newHeight = Math.max(newHeight, 400);
  }

  // Only proceed if size actually changed
  if (newWidth === oldWidth && newHeight === oldHeight) {
    return;
  }

  // Update canvas size
  canvasWidth.value = newWidth;
  canvasHeight.value = newHeight;

  if (canvas.value) {
    const effectiveDpr = isMobile ? Math.min(dpr, 2) : dpr;

    // Set display size
    canvas.value.style.width = `${newWidth}px`;
    canvas.value.style.height = `${newHeight}px`;

    // Set actual canvas resolution
    canvas.value.width = Math.floor(newWidth * effectiveDpr);
    canvas.value.height = Math.floor(newHeight * effectiveDpr);

    // Scale context to match device pixel ratio
    const ctx = canvas.value.getContext('2d');
    if (ctx) {
      ctx.scale(effectiveDpr, effectiveDpr);
    }
  }

  // Adjust transform to maintain the same view after resize
  if (oldWidth > 0 && oldHeight > 0 && mapData.value) {
    adjustTransformForResize(oldWidth, oldHeight, newWidth, newHeight);
  }

  // Update previous size tracking
  previousCanvasSize.value = { width: newWidth, height: newHeight };

  // Force a redraw
  forceRedraw();

  console.log('Canvas resized:', {
    from: { width: oldWidth, height: oldHeight },
    to: { width: newWidth, height: newHeight },
    isMobile
  });
};

// FIXED: Enhanced smooth transform system with better state management
const smoothTransform = (() => {
  let targetTransform = { scale: 1, translateX: 0, translateY: 0 };
  let currentTransform = { scale: 1, translateX: 0, translateY: 0 };
  let isAnimating = false;

  const lerp = (start: number, end: number, factor: number) =>
    start + (end - start) * factor;

  const animate = () => {
    const lerpFactor = 0.15;

    const prevTransform = { ...currentTransform };

    currentTransform.scale = lerp(currentTransform.scale, targetTransform.scale, lerpFactor);
    currentTransform.translateX = lerp(currentTransform.translateX, targetTransform.translateX, lerpFactor);
    currentTransform.translateY = lerp(currentTransform.translateY, targetTransform.translateY, lerpFactor);

    // Check if animation is complete
    const threshold = 0.001;
    const scaleComplete = Math.abs(currentTransform.scale - targetTransform.scale) < threshold;
    const translateXComplete = Math.abs(currentTransform.translateX - targetTransform.translateX) < 1;
    const translateYComplete = Math.abs(currentTransform.translateY - targetTransform.translateY) < 1;

    if (scaleComplete && translateXComplete && translateYComplete) {
      currentTransform = { ...targetTransform };
      isAnimating = false;
    } else {
      requestAnimationFrame(animate);
    }

    // Update reactive ref
    transform.value = { ...currentTransform };
    zoomLevel.value = currentTransform.scale;

    // Trigger redraw if transform changed significantly
    const transformChanged =
      Math.abs(prevTransform.scale - currentTransform.scale) > 0.001 ||
      Math.abs(prevTransform.translateX - currentTransform.translateX) > 0.5 ||
      Math.abs(prevTransform.translateY - currentTransform.translateY) > 0.5;

    if (transformChanged) {
      scheduleRender();
    }
  };

  return {
    setTarget: (newTransform: Partial<Transform>) => {
      targetTransform = { ...targetTransform, ...newTransform };
      if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(animate);
      }
    },
    setCurrent: (newTransform: Transform) => {
      currentTransform = { ...newTransform };
      targetTransform = { ...newTransform };
      transform.value = { ...newTransform };
      zoomLevel.value = newTransform.scale;
      isAnimating = false; // Stop any ongoing animation
    },
    getCurrent: () => ({ ...currentTransform }),
    getTarget: () => ({ ...targetTransform }),
    isAnimating: () => isAnimating
  };
})();

// FIXED: Auto-fit map with proper initial centering
const autoFitMap = () => {
  if (!mapData.value || !canvas.value) return;

  const { width: mapWidth, height: mapHeight } = mapData.value;
  const canvasAspect = canvasWidth.value / canvasHeight.value;
  const mapAspect = mapWidth / mapHeight;

  // Calculate scale to fit map with padding
  let scale: number;
  const padding = 0.9; // 90% of canvas size

  if (mapAspect > canvasAspect) {
    // Map is wider - fit to width
    scale = (canvasWidth.value * padding) / mapWidth;
  } else {
    // Map is taller - fit to height  
    scale = (canvasHeight.value * padding) / mapHeight;
  }

  // Center the map on canvas
  const centerX = canvasWidth.value / 2 - (mapWidth * scale) / 2;
  const centerY = canvasHeight.value / 2 - (mapHeight * scale) / 2;

  const initialTransform = {
    scale: scale,
    translateX: centerX,
    translateY: centerY
  };

  // Set transform immediately without animation
  smoothTransform.setCurrent(initialTransform);

  // Store the canvas size for future resize adjustments
  previousCanvasSize.value = { width: canvasWidth.value, height: canvasHeight.value };

  console.log('Auto-fit map:', {
    mapSize: { width: mapWidth, height: mapHeight },
    canvasSize: { width: canvasWidth.value, height: canvasHeight.value },
    scale,
    transform: initialTransform
  });

  scheduleRender();
};

// FIXED: Center view on robot with proper coordinate conversion
// const centerOnRobot = () => {
//   if (!robotPosition.value || !mapData.value) return;

//   // Convert robot world position to map pixel coordinates
//   const { resolution, origin_x, origin_y, height } = mapData.value;
//   const robotMapX = (robotPosition.value.x - origin_x) / resolution;
//   const robotMapY = (origin_y + height * resolution - robotPosition.value.y) / resolution;

//   // Calculate canvas center
//   const canvasCenterX = canvasWidth.value / 2;
//   const canvasCenterY = canvasHeight.value / 2;

//   // Calculate new translation to center robot
//   const currentScale = smoothTransform.getCurrent().scale;
//   const newTranslateX = canvasCenterX - robotMapX * currentScale;
//   const newTranslateY = canvasCenterY - robotMapY * currentScale;

//   smoothTransform.setTarget({
//     translateX: newTranslateX,
//     translateY: newTranslateY
//   });

//   console.log('Centering on robot:', {
//     robotWorld: robotPosition.value,
//     robotMap: { x: robotMapX, y: robotMapY },
//     newTranslate: { x: newTranslateX, y: newTranslateY }
//   });
// };

// FIXED: Enhanced zoom with proper center point handling
const smoothZoom = (factor: number, centerX?: number, centerY?: number) => {
  const currentTransform = smoothTransform.getCurrent();
  const newScale = Math.max(minZoom, Math.min(maxZoom, currentTransform.scale * factor));

  if (Math.abs(newScale - currentTransform.scale) < 0.001) return;

  if (centerX !== undefined && centerY !== undefined) {
    // Zoom to specific point
    const scaleRatio = newScale / currentTransform.scale;
    const newTranslateX = centerX - (centerX - currentTransform.translateX) * scaleRatio;
    const newTranslateY = centerY - (centerY - currentTransform.translateY) * scaleRatio;

    smoothTransform.setTarget({
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY
    });
  } else {
    // Zoom to canvas center
    const centerX = canvasWidth.value / 2;
    const centerY = canvasHeight.value / 2;
    const scaleRatio = newScale / currentTransform.scale;

    const newTranslateX = centerX - (centerX - currentTransform.translateX) * scaleRatio;
    const newTranslateY = centerY - (centerY - currentTransform.translateY) * scaleRatio;

    smoothTransform.setTarget({
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY
    });
  }
};


// Optimized map texture generation
const generateMapTexture = (mapData: OccupancyGrid): HTMLCanvasElement => {
  const { width, height, data } = mapData;

  // Create offscreen canvas for map texture
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = width;
  textureCanvas.height = height;

  const ctx = textureCanvas.getContext('2d', {
    alpha: false,
    desynchronized: true
  });
  if (!ctx) throw new Error('Failed to get canvas context');

  // Disable smoothing for pixel-perfect rendering
  ctx.imageSmoothingEnabled = false;

  // Generate optimized image data
  const imgData = ctx.createImageData(width, height);
  const imgArray = imgData.data;

  // Optimized color mapping with lookup table
  const colorLUT = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    if (i === 255) colorLUT[i] = 127; // Unknown (-1 mapped to 255)
    else if (i === 0) colorLUT[i] = 240; // Free space
    else if (i === 100) colorLUT[i] = 0; // Occupied
    else colorLUT[i] = Math.max(0, 255 - i * 2.55); // Probability
  }

  // Vectorized pixel processing
  for (let i = 0; i < data.length; i++) {
    const val = data[i] === -1 ? 255 : Math.max(0, Math.min(255, data[i]));
    const color = colorLUT[val];

    const x = i % width;
    const y = Math.floor(i / width);
    const flippedY = height - 1 - y; // Flip Y-axis

    const pixelIndex = (flippedY * width + x) * 4;
    imgArray[pixelIndex] = color;     // R
    imgArray[pixelIndex + 1] = color; // G  
    imgArray[pixelIndex + 2] = color; // B
    imgArray[pixelIndex + 3] = 255;   // A
  }

  ctx.putImageData(imgData, 0, 0);
  return textureCanvas;
};

// Optimized rendering pipeline
const render = () => {
  if (!canvas.value || !mapData.value) return;

  const startTime = performance.now();
  const ctx = canvas.value.getContext('2d', {
    alpha: false,
    desynchronized: true
  });
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  // Set transform
  ctx.save();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.translate(transform.value.translateX, transform.value.translateY);
  ctx.scale(transform.value.scale, transform.value.scale);

  // Render map layer
  if (layerVisibility.value.map && renderState.mapTexture) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(renderState.mapTexture, 0, 0);
  }

  ctx.restore();

  // Render UI elements (robot, target) without transform
  if (layerVisibility.value.robot) {
    drawRobot(ctx);
  }

  if (layerVisibility.value.target) {
    drawTarget(ctx);
  }

  // Performance tracking
  const frameTime = performance.now() - startTime;
  updatePerformanceStats(frameTime);

  renderedFrames.value++;
  renderState.needsFullRedraw = false;
};

// UPDATED: Efficient robot rendering with proper coordinate conversion
const drawRobot = (ctx: CanvasRenderingContext2D) => {
  if (!robotPosition.value || !mapData.value) return;

  const { x, y, yaw } = robotPosition.value;
  const canvasPos = worldToCanvas(x, y);

  ctx.save();
  ctx.translate(canvasPos.x, canvasPos.y);
  ctx.rotate(yaw);

  // Draw robot triangle
  const size = Math.max(8, 12 * transform.value.scale);
  const halfSize = size / 2;

  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(-halfSize, halfSize);
  ctx.lineTo(halfSize, halfSize);
  ctx.closePath();
  ctx.fill();

  // Draw detection circle
  const circleRadius = Math.max(16, 20 * transform.value.scale);
  ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, circleRadius, 0, 2 * Math.PI);
  ctx.fill();

  ctx.restore();
};

// UPDATED: Efficient target rendering with proper coordinate conversion
const drawTarget = (ctx: CanvasRenderingContext2D) => {
  if (!singleGoal.value || !mapData.value || !robotPosition.value) return;

  // Distance-based visibility check
  const robotDist = Math.sqrt(robotPosition.value.x ** 2 + robotPosition.value.y ** 2);
  const targetDist = Math.sqrt(singleGoal.value.x ** 2 + singleGoal.value.y ** 2);
  const distError = Math.abs(targetDist - robotDist);

  if (distError < 0.20) return; // Too close to robot

  const { x, y } = singleGoal.value;
  const canvasPos = worldToCanvas(x, y);

  ctx.save();
  ctx.translate(canvasPos.x, canvasPos.y);

  const markerSize = Math.max(8, 12 * Math.sqrt(transform.value.scale));

  // Draw marker pin
  ctx.fillStyle = '#ff0044';
  ctx.beginPath();
  ctx.arc(0, -markerSize, markerSize * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Draw marker tail
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-markerSize * 0.6, -markerSize);
  ctx.lineTo(markerSize * 0.6, -markerSize);
  ctx.closePath();
  ctx.fill();

  // Draw center dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -markerSize, markerSize * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

// Render scheduling
let renderScheduled = false;
const scheduleRender = () => {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    render();
    renderScheduled = false;
  });
};

// Force full redraw
const forceRedraw = () => {
  renderState.needsFullRedraw = true;
  scheduleRender();
};

// Performance monitoring
const updatePerformanceStats = (frameTime: number) => {
  performanceState.frameCount++;
  performanceState.frameTimes.push(frameTime);

  // Keep only last 60 frame times
  if (performanceState.frameTimes.length > 60) {
    performanceState.frameTimes.shift();
  }

  // Update FPS every second
  const currentTime = performance.now();
  if (currentTime - performanceState.lastFPSTime >= 1000) {
    currentFPS.value = Math.round((performanceState.frameCount * 1000) / (currentTime - performanceState.lastFPSTime));
    performanceState.frameCount = 0;
    performanceState.lastFPSTime = currentTime;

    // Calculate average frame time
    const sum = performanceState.frameTimes.reduce((a, b) => a + b, 0);
    averageFrameTime.value = sum / performanceState.frameTimes.length;
  }
};

// NEW: Mobile-specific touch optimization
const optimizeForMobile = () => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isMobile) {
    // Disable context menu on long press for better touch UX
    document.addEventListener('contextmenu', (e) => {
      if (e.target === canvas.value) {
        e.preventDefault();
      }
    });

    // Prevent elastic scrolling on iOS
    if (isIOS) {
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
    }

    // Optimize performance settings for mobile
    if (canvas.value) {
      const ctx = canvas.value.getContext('2d');
      if (ctx) {
        // Reduce rendering quality slightly for better performance
        ctx.imageSmoothingQuality = 'low';
      }
    }

    // Reduce performance monitoring frequency on mobile
    showPerformanceInfo.value = false;
  }

  return isMobile;
};

// NEW: Prevent zoom on double-tap for iOS Safari
const preventDoubleZoom = (element: HTMLElement) => {
  let lastTouchEnd = 0;
  element.addEventListener('touchend', (event) => {
    const now = new Date().getTime();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
};



const zoomIn = () => smoothZoom(1.25);
const zoomOut = () => smoothZoom(0.8);

// Event handlers
const handleWheel = (event: WheelEvent) => {
  event.preventDefault();

  const rect = canvas.value?.getBoundingClientRect();
  if (!rect) return;

  const centerX = event.clientX - rect.left;
  const centerY = event.clientY - rect.top;

  const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
  smoothZoom(zoomFactor, centerX, centerY);
};

const handleMouseDown = (event: MouseEvent) => {
  if (event.button !== 0) return; // Only left button

  isDragging.value = true;
  lastPointerPos.value = { x: event.clientX, y: event.clientY };

  if (canvas.value) {
    canvas.value.style.cursor = 'grabbing';
  }
};

const handleMouseMove = (event: MouseEvent) => {
  if (!isDragging.value) return;

  const dx = event.clientX - lastPointerPos.value.x;
  const dy = event.clientY - lastPointerPos.value.y;

  const currentTransform = smoothTransform.getCurrent();
  smoothTransform.setTarget({
    translateX: currentTransform.translateX + dx,
    translateY: currentTransform.translateY + dy
  });

  lastPointerPos.value = { x: event.clientX, y: event.clientY };
};

const handleMouseUp = () => {
  isDragging.value = false;

  if (canvas.value) {
    canvas.value.style.cursor = 'crosshair';
  }
};

// Touch handling
const handleTouchStart = (event: TouchEvent) => {
  event.preventDefault();

  if (event.touches.length === 1) {
    // Single touch - start panning
    const touch = event.touches[0];
    touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
    isDragging.value = true;
  } else if (event.touches.length === 2) {
    // Two finger - start zooming
    const touch1 = event.touches[0];
    const touch2 = event.touches[1];

    touchState.value.startDist = Math.hypot(
      touch1.clientX - touch2.clientX,
      touch1.clientY - touch2.clientY
    );
    touchState.value.startZoom = smoothTransform.getCurrent().scale;
    touchState.value.startPos = {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
    touchState.value.active = true;
    isDragging.value = false;
  }
};

const handleTouchMove = (event: TouchEvent) => {
  event.preventDefault();

  if (event.touches.length === 1 && isDragging.value) {
    // Single touch panning
    const touch = event.touches[0];
    const dx = touch.clientX - touchState.value.lastPos.x;
    const dy = touch.clientY - touchState.value.lastPos.y;

    const currentTransform = smoothTransform.getCurrent();
    smoothTransform.setTarget({
      translateX: currentTransform.translateX + dx,
      translateY: currentTransform.translateY + dy
    });

    touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
  } else if (event.touches.length === 2 && touchState.value.active) {
    // Two finger zoom and pan
    const touch1 = event.touches[0];
    const touch2 = event.touches[1];

    const currentDist = Math.hypot(
      touch1.clientX - touch2.clientX,
      touch1.clientY - touch2.clientY
    );

    const zoomFactor = currentDist / touchState.value.startDist;
    const newScale = Math.max(minZoom, Math.min(maxZoom, touchState.value.startZoom * zoomFactor));

    const centerX = (touch1.clientX + touch2.clientX) / 2;
    const centerY = (touch1.clientY + touch2.clientY) / 2;

    // Calculate pan offset
    const dx = centerX - touchState.value.startPos.x;
    const dy = centerY - touchState.value.startPos.y;

    const currentTransform = smoothTransform.getCurrent();
    smoothTransform.setTarget({
      scale: newScale,
      translateX: currentTransform.translateX + dx,
      translateY: currentTransform.translateY + dy
    });
  }
};

const handleTouchEnd = (event: TouchEvent) => {
  event.preventDefault();

  if (event.touches.length === 0) {
    isDragging.value = false;
    touchState.value.active = false;
  } else if (event.touches.length === 1) {
    // Switch from zoom to pan
    touchState.value.active = false;
    const touch = event.touches[0];
    touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
    isDragging.value = true;
  }
};

// UPDATED: Goal click handling with proper coordinate conversion
const handleGoalClick = (event: MouseEvent) => {
  if (!canvas.value || !mapData.value || !robotPosition.value || isDragging.value) return;

  const rect = canvas.value.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // Convert canvas coordinates to world coordinates
  const worldPos = canvasToWorld(clickX, clickY);

  // Bounds check
  const { width: mapWidth, height: mapHeight } = mapData.value;
  const mapPixelX = (clickX - transform.value.translateX) / transform.value.scale;
  const mapPixelY = (clickY - transform.value.translateY) / transform.value.scale;

  if (mapPixelX < 0 || mapPixelX > mapWidth || mapPixelY < 0 || mapPixelY > mapHeight) {
    console.warn('Clicked position is outside the map bounds.');
    return;
  }

  // Update goal
  singleGoal.value = { x: worldPos.x, y: worldPos.y, yaw: 0 };
  scheduleRender();

  // Send to WebSocket
  if (ws && ws.readyState === WebSocket.OPEN) {
    const goalCommand = {
      action: "goal_cmd",
      x: worldPos.x,
      y: worldPos.y,
      yaw: 0
    };
    ws.send(JSON.stringify(goalCommand));
  }

  console.log(`Goal set at: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`);
};

// Velocity handling
const handleVelocity = (velocity: { Vx: number, Vy: number }) => {
  Vx.value = velocity.Vx;
  Vy.value = velocity.Vy;

  if (ws && isConnected.value) {
    const velocityCmd = {
      action: "vel_cmd",
      Vx: Vx.value,
      Vy: Vy.value,
    };
    ws.send(JSON.stringify(velocityCmd));
  }
};

// WebSocket connection
const connectWebSocket = () => {
  if (ws) ws.close();

  ws = new WebSocket('ws://192.168.10.2:7448');

  ws.onopen = () => {
    console.log('WebSocket connected');
    isConnected.value = true;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const { map, odom } = JSON.parse(event.data);

      let mapChanged = false;
      let robotChanged = false;

      // Handle map data
      if (map?.width && map?.height && map?.data) {
        const newMapData = {
          ...map,
          resolution: map.resolution || 0.05,
          origin_x: map.origin?.[0] || 0,
          origin_y: map.origin?.[1] || 0,
          data: map.compressed ? decompressData(map.data) : map.data,
          downsampled: map.downsampled || false,
          originalDimensions: map.original_dimensions || { width: map.width, height: map.height }
        };

        const newMapHash = `${newMapData.width}-${newMapData.height}-${newMapData.data.length}`;
        if (renderState.lastMapHash !== newMapHash) {
          mapData.value = newMapData;
          renderState.mapTexture = generateMapTexture(newMapData);
          renderState.lastMapHash = newMapHash;
          mapChanged = true;

          // Update map center for resolution tracking
          mapCenterWorld.value = {
            x: newMapData.origin_x + (newMapData.width * newMapData.resolution) / 2,
            y: newMapData.origin_y + (newMapData.height * newMapData.resolution) / 2
          };
        }
      }

      // Handle robot position
      if (odom?.position && odom?.orientation) {
        const newRobotPosition = {
          x: odom.position.x,
          y: odom.position.y,
          yaw: -(quaternionToEuler(odom.orientation.x, odom.orientation.y, odom.orientation.z, odom.orientation.w).yaw - 1.5708)
        };

        const newRobotHash = `${newRobotPosition.x.toFixed(3)}-${newRobotPosition.y.toFixed(3)}-${newRobotPosition.yaw.toFixed(3)}`;
        if (renderState.lastRobotState.hash !== newRobotHash) {
          robotPosition.value = newRobotPosition;
          renderState.lastRobotState = { ...newRobotPosition, hash: newRobotHash };
          robotChanged = true;
        }
      }

      // Schedule render if needed
      if (mapChanged || robotChanged) {
        scheduleRender();
      }

    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    isConnected.value = false;
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    isConnected.value = false;
    reconnectTimeout = setTimeout(connectWebSocket, 5000);
  };
};

// Utility functions
const decompressData = (compressedData: [number, number][]) => {
  const result: number[] = [];
  for (const [value, count] of compressedData) {
    for (let i = 0; i < count; i++) {
      result.push(value);
    }
  }
  return result;
};

const quaternionToEuler = (x: number, y: number, z: number, w: number) => {
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  const sinp = 2 * (w * y - z * x);
  const pitch = Math.asin(Math.max(-1, Math.min(1, sinp)));

  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return { roll, pitch, yaw };
};



// // NEW: Reset view to fit map
// const resetView = () => {
//   if (!mapData.value) return;
//   autoFitMap();
// };

// // NEW: Center view on robot
// const centerOnRobot = () => {
//   if (!robotPosition.value || !mapData.value) return;

//   const robotCanvas = worldToCanvas(robotPosition.value.x, robotPosition.value.y);
//   const canvasCenterX = canvasWidth.value / 2;
//   const canvasCenterY = canvasHeight.value / 2;

//   const currentTransform = smoothTransform.getCurrent();
//   const offsetX = canvasCenterX - robotCanvas.x + currentTransform.translateX;
//   const offsetY = canvasCenterY - robotCanvas.y + currentTransform.translateY;

//   smoothTransform.setTarget({
//     translateX: offsetX,
//     translateY: offsetY
//   });
// };


// FIXED: Better debounced resize with orientation change detection
let resizeTimeout: number | null = null;
let orientationTimeout: number | null = null;
const debouncedResize = () => {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    handleResize();
  }, 100);
};

// Handle orientation changes separately with longer delay
const handleOrientationChange = () => {
  if (orientationTimeout) clearTimeout(orientationTimeout);
  orientationTimeout = setTimeout(() => {
    console.log('Orientation changed, adjusting layout');
    handleResize();
  }, 300); // Longer delay for orientation changes
};

// FIXED: Enhanced lifecycle with better event handling
onMounted(async () => {
  await nextTick();

  // Mobile optimizations
  const isMobile = optimizeForMobile();

  // Initialize canvas with proper sizing
  handleResize();

  // Prevent double-zoom on mobile
  if (canvas.value && isMobile) {
    preventDoubleZoom(canvas.value);
  }

  // Set up event listeners with proper cleanup tracking
  window.addEventListener('resize', debouncedResize);

  // Mobile-specific event listeners
  if (isMobile) {
    // Handle orientation changes with separate handler
    window.addEventListener('orientationchange', handleOrientationChange);

    // Handle viewport height changes (mobile browser toolbars)
    const handleViewportChange = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      debouncedResize();
    };

    // Use separate handlers for different events
    window.addEventListener('resize', handleViewportChange);

    // Prevent pull-to-refresh on mobile
    document.body.style.overscrollBehavior = 'none';
  }

  // Connect WebSocket
  connectWebSocket();

  // Auto-fit when map loads with retry mechanism
  const mapWatcher = () => {
    if (mapData.value && canvasWidth.value > 0 && canvasHeight.value > 0) {
      // Delay auto-fit to ensure everything is properly initialized
      setTimeout(() => {
        autoFitMap();
      }, 100);
    } else {
      requestAnimationFrame(mapWatcher);
    }
  };
  mapWatcher();
});

onBeforeUnmount(() => {
  // Enhanced cleanup
  if (ws) ws.close();
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (resizeTimeout) clearTimeout(resizeTimeout);
  if (orientationTimeout) clearTimeout(orientationTimeout);
  if (renderState.animationFrameId) cancelAnimationFrame(renderState.animationFrameId);

  // Remove all event listeners
  window.removeEventListener('resize', debouncedResize);

  // Mobile cleanup
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    window.removeEventListener('orientationchange', handleOrientationChange);
    document.body.style.position = '';
    document.body.style.overscrollBehavior = '';

    // Reset viewport height
    document.documentElement.style.removeProperty('--vh');
  }
});


</script>

<style scoped>
/* Hardware-accelerated smooth animations */
:root {
  --vh: 1vh;
  /* Fallback for viewport height */
}

.main-container {
  width: 100%;
  height: 100vh;
  height: calc(var(--vh, 1vh) * 100);
  /* Use CSS custom property for mobile */
  position: relative;
  overflow: hidden;
  background: #2a2a2a;
}

.map-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #1e1e1e 0%, #2a2a2a 100%);
}

.status {
  position: fixed;
  top: 15px;
  left: 15px;
  font-size: 14px;
  font-weight: 600;
  z-index: 1000;
  padding: 8px 16px;
  border-radius: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.connected {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.1);
}

.disconnected {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.1);
  animation: pulse-disconnect 2s ease-in-out infinite;
}

@keyframes pulse-disconnect {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.7;
  }
}

.canvas-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  touch-action: none;
  position: relative;
  border-radius: 12px;
  background: #1a1a1a;
}

.main-canvas {
  width: 100%;
  /* for visual scale */
  height: 100%;
  /* for visual scale */
  display: block;
  cursor: crosshair;
  image-rendering: -moz-crisp-edges;
  image-rendering: -webkit-crisp-edges;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.3s ease;
  will-change: transform;
  transform: translateZ(0);
  /* Enable hardware acceleration */
}

.main-canvas:active {
  cursor: grabbing;
}

.layer-controls {
  position: absolute;
  top: 60px;
  left: 15px;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(15px);
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 13px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.layer-controls:hover {
  background: rgba(0, 0, 0, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

.layer-controls label {
  display: flex;
  align-items: center;
  margin: 6px 0;
  cursor: pointer;
  transition: color 0.2s ease;
}

.layer-controls label:hover {
  color: #60a5fa;
}

.layer-controls input[type="checkbox"] {
  margin-right: 8px;
  accent-color: #3b82f6;
}

.zoom-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  padding: 16px;
  text-align: center;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(15px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.zoom-container:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  background: rgba(0, 0, 0, 0.9);
}

.joystick-container {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1000;
  padding: 16px;
  text-align: center;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(15px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.joystick-container:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.joystick-container p {
  margin: 4px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

.zoom-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.zoom-controls button {
  font-size: 18px;
  font-weight: 600;
  padding: 12px 16px;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 48px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.zoom-controls button:before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.zoom-controls button:hover:before {
  opacity: 1;
}

.zoom-controls button:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);
}

.zoom-controls button:active {
  transform: translateY(0) scale(0.98);
  transition: all 0.1s ease;
}

.zoom-controls button:disabled {
  background: rgba(107, 114, 128, 0.5);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.zoom-controls button:disabled:hover {
  transform: none;
  box-shadow: none;
}

.zoom-size {
  margin-bottom: 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}

.performance-info {
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
}

.performance-info div {
  margin: 3px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Mobile-first responsive design */
@media (max-width: 1024px) {

  /* iPad and large tablets */
  .main-container {
    height: 100vh;
    height: 100dvh;
    /* Dynamic viewport height for mobile */
  }

  .status {
    top: env(safe-area-inset-top, 10px);
    left: 10px;
    font-size: 13px;
    padding: 8px 14px;
  }

  .joystick-container {
    bottom: max(env(safe-area-inset-bottom, 20px), 20px);
    left: 15px;
    padding: 14px;
    border-radius: 14px;
  }

  .zoom-container {
    bottom: max(env(safe-area-inset-bottom, 20px), 20px);
    right: 15px;
    padding: 14px;
    border-radius: 14px;
  }

  .zoom-controls button {
    font-size: 18px;
    padding: 12px 14px;
    min-width: 46px;
    min-height: 46px;
  }

  .layer-controls {
    top: calc(env(safe-area-inset-top, 10px) + 50px);
    left: 10px;
    padding: 12px 14px;
    font-size: 12px;
  }
}

@media (max-width: 768px) {

  /* Smartphones in landscape and small tablets */
  .main-container {
    height: 100vh;
    height: 100dvh;
  }

  .status {
    top: env(safe-area-inset-top, 8px);
    left: 8px;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 16px;
  }

  .canvas-container {
    border-radius: 8px;
    margin: 8px;
    width: 100%;
    height: 100%;
    position: relative;
  }

  .joystick-container {
    bottom: max(env(safe-area-inset-bottom, 15px), 15px);
    left: 12px;
    padding: 12px;
    border-radius: 12px;
    transform: scale(0.9);
    transform-origin: bottom left;
  }

  .joystick-container p {
    font-size: 11px;
    margin: 2px 0;
  }

  .zoom-container {
    bottom: max(env(safe-area-inset-bottom, 15px), 15px);
    right: 12px;
    padding: 12px;
    border-radius: 12px;
    transform: scale(0.9);
    transform-origin: bottom right;
  }

  .zoom-controls {
    gap: 6px;
    margin-bottom: 10px;
  }

  .zoom-controls button {
    font-size: 16px;
    padding: 10px 12px;
    min-width: 42px;
    min-height: 42px;
    border-radius: 10px;
  }

  .zoom-size {
    font-size: 13px;
    margin-bottom: 10px;
  }

  .performance-info {
    font-size: 10px;
    padding-top: 10px;
  }

  .layer-controls {
    top: calc(env(safe-area-inset-top, 8px) + 42px);
    left: 8px;
    padding: 10px 12px;
    font-size: 11px;
    border-radius: 10px;
    transform: scale(0.9);
    transform-origin: top left;
  }
}

@media (max-width: 480px) {

  /* Small smartphones */
  .main-container {
    height: 100vh;
    height: 100dvh;
  }

  .status {
    top: env(safe-area-inset-top, 6px);
    left: 6px;
    font-size: 11px;
    padding: 5px 10px;
    border-radius: 14px;
  }

  .canvas-container {
    border-radius: 6px;
    margin: 6px;
  }

  .joystick-container {
    bottom: max(env(safe-area-inset-bottom, 12px), 12px);
    left: 8px;
    padding: 10px;
    border-radius: 10px;
    transform: scale(0.8);
    transform-origin: bottom left;
  }

  .joystick-container p {
    font-size: 10px;
    margin: 1px 0;
  }

  .zoom-container {
    bottom: max(env(safe-area-inset-bottom, 12px), 12px);
    right: 8px;
    padding: 10px;
    border-radius: 10px;
    transform: scale(0.8);
    transform-origin: bottom right;
  }

  .zoom-controls {
    gap: 5px;
    margin-bottom: 8px;
  }

  .zoom-controls button {
    font-size: 14px;
    padding: 8px 10px;
    min-width: 38px;
    min-height: 38px;
    border-radius: 8px;
  }

  .zoom-size {
    font-size: 12px;
    margin-bottom: 8px;
  }

  .performance-info {
    font-size: 9px;
    padding-top: 8px;
  }

  .performance-info div {
    margin: 2px 0;
  }

  .layer-controls {
    top: calc(env(safe-area-inset-top, 6px) + 36px);
    left: 6px;
    padding: 8px 10px;
    font-size: 10px;
    border-radius: 8px;
    transform: scale(0.8);
    transform-origin: top left;
  }

  .layer-controls label {
    margin: 4px 0;
  }
}

/* Landscape orientation adjustments */
@media (max-width: 768px) and (orientation: landscape) {
  .joystick-container {
    transform: scale(0.85);
    bottom: max(env(safe-area-inset-bottom, 10px), 10px);
    left: max(env(safe-area-inset-left, 10px), 10px);
  }

  .zoom-container {
    transform: scale(0.85);
    bottom: max(env(safe-area-inset-bottom, 10px), 10px);
    right: max(env(safe-area-inset-right, 10px), 10px);
  }

  .status {
    top: max(env(safe-area-inset-top, 6px), 6px);
    left: max(env(safe-area-inset-left, 8px), 8px);
  }

  .layer-controls {
    top: calc(max(env(safe-area-inset-top, 6px), 6px) + 36px);
    left: max(env(safe-area-inset-left, 8px), 8px);
  }
}

/* iPhone X and newer with notch */
@media (max-width: 428px) and (orientation: landscape) {
  .joystick-container {
    left: max(env(safe-area-inset-left, 15px), 15px);
    transform: scale(0.75);
  }

  .zoom-container {
    right: max(env(safe-area-inset-right, 15px), 15px);
    transform: scale(0.75);
  }

  .status {
    left: max(env(safe-area-inset-left, 12px), 12px);
  }

  .layer-controls {
    left: max(env(safe-area-inset-left, 12px), 12px);
  }
}

/* High DPI display optimization */
@media (-webkit-min-device-pixel-ratio: 2),
(min-resolution: 192dpi) {
  .main-canvas {
    image-rendering: -webkit-optimize-contrast;
    image-rendering: optimize-contrast;
  }
}

/* Loading animation */
.canvas-container:empty::after {
  content: 'Loading map...';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: rgba(255, 255, 255, 0.7);
  font-size: 18px;
  font-weight: 500;
  animation: pulse-loading 1.5s ease-in-out infinite alternate;
}

@keyframes pulse-loading {
  from {
    opacity: 0.4;
  }

  to {
    opacity: 1;
  }
}

/* Smooth focus indicators for accessibility */
.zoom-controls button:focus-visible,
.layer-controls input:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
  border-radius: 8px;
}

/* Touch optimizations and mobile-specific improvements */
@media (hover: none) and (pointer: coarse) {

  /* Disable hover effects on touch devices */
  .zoom-container:hover,
  .joystick-container:hover,
  .layer-controls:hover {
    transform: scale(0.9);
    /* Keep the scaling from responsive rules */
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .zoom-controls button:hover {
    transform: none;
    box-shadow: none;
  }

  .main-canvas {
    cursor: default;
    touch-action: none;
    /* Prevent default touch behaviors */
  }

  /* Larger touch targets for better usability */
  .zoom-controls button {
    min-width: 48px;
    min-height: 48px;
    padding: 12px;
    font-size: 18px;
  }

  /* Better touch feedback */
  .zoom-controls button:active {
    background: linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%);
    transform: scale(0.95);
  }

  /* Prevent text selection on touch */
  * {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
  }
}

/* iOS Safari specific fixes */
@supports (-webkit-touch-callout: none) {
  .main-container {
    height: 100vh;
    height: -webkit-fill-available;
    /* iOS Safari fix */
  }

  .canvas-container {
    -webkit-overflow-scrolling: touch;
  }

  /* Fix for iOS Safari bottom bar */
  .joystick-container,
  .zoom-container {
    bottom: max(env(safe-area-inset-bottom), 20px);
  }
}

/* Prevent zoom on double tap for better UX */
.main-canvas,
.zoom-controls button,
.joystick-container {
  touch-action: manipulation;
}

/* Better focus states for accessibility */
.zoom-controls button:focus-visible {
  outline: 3px solid #60a5fa;
  outline-offset: 3px;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .status.connected {
    background: rgba(0, 255, 0, 0.3);
    border-color: #00ff00;
  }

  .status.disconnected {
    background: rgba(255, 0, 0, 0.3);
    border-color: #ff0000;
  }

  .zoom-controls button {
    border: 2px solid #ffffff;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .canvas-container {
    transition: none;
  }
}

/* Smooth scrollbar for webkit browsers */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  transition: background 0.3s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* Disable text selection on interactive elements */
.zoom-controls,
.layer-controls,
.joystick-container,
.canvas-container {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

/* Smooth animation for all interactive elements */
* {
  -webkit-tap-highlight-color: transparent;
}

/* Modern glassmorphism effects */
.status,
.zoom-container,
.joystick-container,
.layer-controls {
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
</style>