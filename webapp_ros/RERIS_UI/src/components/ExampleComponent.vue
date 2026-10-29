<template>
  <div class="main-container">
    <div class="map-container">
      <div class="status" :class="{ connected: isConnected, disconnected: !isConnected }">
        {{ isConnected ? 'Connected' : 'Disconnected' }}
      </div>
      <div class="canvas-container" ref="canvasContainer" @wheel="handleWheel" @touchstart="handleTouchStart"
        @touchmove="handleTouchMove" @touchend="handleTouchEnd" @mousedown="handleMouseDown"
        @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseUp">

        <canvas ref="canvas" :width="canvasWidth" :height="canvasHeight" @click="handleGoalClick" class="main-canvas">
        </canvas>

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
        <br>
        Vel : {{ touchDiffPos.dx }} , {{ touchDiffPos.dy }}
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
import { socketService, type RerisWebSocketMessage } from 'src/services/socketService';

interface OccupancyGrid {
  width: number;
  height: number;
  resolution: number;
  origin_x: number;
  origin_y: number;
  data: number[];
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
const CameraMoveVel = ref(1.0)
const minZoom = 0.1;
const maxZoom = 10.0;
const isDragging = ref(false);
const lastPointerPos = ref({ x: 0, y: 0 });

// Resolution-aware state
const previousCanvasSize = ref({ width: 0, height: 0 });
const mapCenterWorld = ref({ x: 0, y: 0 }); // Track world center point

// Touch handling
const touchState = ref({
  active: false,
  startDist: 0,
  startZoom: 1.0,
  startPos: { x: 0, y: 0 },
  lastPos: { x: 0, y: 0 },
  lastPosMulti: { x: 0, y: 0 },
});


// 
const touchDiffPos = ref({
  dx: 0,
  dy: 0,
  timeDiff: 0,
  timePrev: 0
})

const singleTarget = ref({
  hidden: true,
  currentPos: { x: 0, y: 0 },
  prevPos: { x: 0, y: 0 },
})


const touchTargetPos = ref({
  timeDiff: 0,
  timePrev: 0
})

const touchTargetMoving = ref({
  timeDiff: 0,
  timePrev: 0
})
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

// Computed properties
const joystickBottomPosition = computed(() => 20);

// World coordinate utilities
const worldToCanvas = (worldX: number, worldY: number) => {
  if (!mapData.value) return { x: 0, y: 0 };
  const { resolution, origin_x, origin_y, height } = mapData.value;
  const mapPixelX = (worldX - origin_x) / resolution;
  const mapPixelY = (origin_y + height * resolution - worldY) / resolution;
  const canvasX = mapPixelX * transform.value.scale + transform.value.translateX;
  const canvasY = mapPixelY * transform.value.scale + transform.value.translateY;
  return { x: canvasX, y: canvasY };
};

const canvasToWorld = (canvasX: number, canvasY: number) => {
  if (!mapData.value) return { x: 0, y: 0 };
  const { resolution, origin_x, origin_y, height } = mapData.value;
  const mapPixelX = (canvasX - transform.value.translateX) / transform.value.scale;
  const mapPixelY = (canvasY - transform.value.translateY) / transform.value.scale;
  const worldX = origin_x + mapPixelX * resolution;
  const worldY = origin_y + (height - mapPixelY) * resolution;
  return { x: worldX, y: worldY };
};

// Canvas resize handling
const handleResize = () => {
  if (!canvasContainer.value) return;
  const rect = canvasContainer.value.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const newWidth = Math.floor(rect.width);
  const newHeight = Math.floor(rect.height);

  if (newWidth === canvasWidth.value && newHeight === canvasHeight.value) return;

  canvasWidth.value = newWidth;
  canvasHeight.value = newHeight;

  if (canvas.value) {
    const effectiveDpr = Math.min(dpr, 2);
    canvas.value.style.width = `${newWidth}px`;
    canvas.value.style.height = `${newHeight}px`;
    canvas.value.width = Math.floor(newWidth * effectiveDpr);
    canvas.value.height = Math.floor(newHeight * effectiveDpr);
    const ctx = canvas.value.getContext('2d');
    if (ctx) {
      ctx.scale(effectiveDpr, effectiveDpr);
    }
  }
  forceRedraw();
};

// Smooth transform system (Placeholder for brevity, actual implementation is present)
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

// autoFitMap (Placeholder for brevity, actual implementation is present)
const autoFitMap = () => {
  if (!mapData.value || !canvas.value) return;

  const { width: mapWidth, height: mapHeight } = mapData.value;
  const canvasAspect = canvasWidth.value / canvasHeight.value;
  const mapAspect = mapWidth / mapHeight;

  let scale: number;
  const padding = 0.9;

  if (mapAspect > canvasAspect) {
    scale = (canvasWidth.value * padding) / mapWidth;
  } else {
    scale = (canvasHeight.value * padding) / mapHeight;
  }

  const centerX = canvasWidth.value / 2 - (mapWidth * scale) / 2;
  const centerY = canvasHeight.value / 2 - (mapHeight * scale) / 2;

  const initialTransform = {
    scale: scale,
    translateX: centerX,
    translateY: centerY
  };

  smoothTransform.setCurrent(initialTransform);
  previousCanvasSize.value = { width: canvasWidth.value, height: canvasHeight.value };
  forceRedraw();
};

// smoothZoom (Placeholder for brevity, actual implementation is present)
const smoothZoom = (factor: number, centerX?: number, centerY?: number) => {
  const currentTransform = smoothTransform.getCurrent();
  const newScale = Math.max(minZoom, Math.min(maxZoom, currentTransform.scale * factor));

  if (Math.abs(newScale - currentTransform.scale) < 0.001) return;

  if (centerX !== undefined && centerY !== undefined) {
    const scaleRatio = newScale / currentTransform.scale;
    const newTranslateX = centerX - (centerX - currentTransform.translateX) * scaleRatio;
    const newTranslateY = centerY - (centerY - currentTransform.translateY) * scaleRatio;

    smoothTransform.setTarget({
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY
    });
  } else {
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

const generateMapTexture = (map: OccupancyGrid): HTMLCanvasElement => {
  const { width, height, data } = map;

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = width;
  textureCanvas.height = height;

  const ctx = textureCanvas.getContext('2d', {
    alpha: false,
    desynchronized: true
  });
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.imageSmoothingEnabled = false;

  const imgData = ctx.createImageData(width, height);
  const imgArray = imgData.data;

  // This loop processes the map data and sets the pixel colors
  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    let color = 240; // Free space (light gray)
    if (val === -1) {
        color = 127; // Unknown (mid-gray)
    } else if (val > 50) {
        color = 0; // Occupied (black)
    }

    const x = i % width;
    const y = Math.floor(i / width);
    const flippedY = height - 1 - y;

    const pixelIndex = (flippedY * width + x) * 4;
    imgArray[pixelIndex] = color;
    imgArray[pixelIndex + 1] = color;
    imgArray[pixelIndex + 2] = color;
    imgArray[pixelIndex + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return textureCanvas;
};

const render = () => {
  if (!canvas.value || !mapData.value) return;

  const startTime = performance.now();
  const ctx = canvas.value.getContext('2d', {
    alpha: false,
    desynchronized: true
  });
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  ctx.save();
  ctx.translate(transform.value.translateX, transform.value.translateY);
  ctx.scale(transform.value.scale, transform.value.scale);

  if (layerVisibility.value.map && renderState.mapTexture) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(renderState.mapTexture, 0, 0);
  }

  ctx.restore();

  if (layerVisibility.value.robot) {
    drawRobot(ctx);
  }

  if (layerVisibility.value.target) {
    drawTarget(ctx);
  }

  const frameTime = performance.now() - startTime;
  updatePerformanceStats(frameTime);

  renderedFrames.value++;
  renderState.needsFullRedraw = false;
};

const drawRobot = (ctx: CanvasRenderingContext2D) => {
  if (!robotPosition.value || !mapData.value) return;

  const { x, y, yaw } = robotPosition.value;
  const canvasPos = worldToCanvas(x, y);

  ctx.save();
  ctx.translate(canvasPos.x, canvasPos.y);
  ctx.rotate(yaw);

  const size = Math.max(8, 12 * transform.value.scale);
  const halfSize = size / 2;

  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(-halfSize, halfSize);
  ctx.lineTo(halfSize, halfSize);
  ctx.closePath();
  ctx.fill();

  const circleRadius = Math.max(16, 20 * transform.value.scale);
  ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, circleRadius, 0, 2 * Math.PI);
  ctx.fill();

  ctx.restore();
};

const drawTarget = (ctx: CanvasRenderingContext2D) => {
  if (!singleGoal.value || !mapData.value || !robotPosition.value) return;

  const dx = (singleGoal.value.x - robotPosition.value.x);
  const dy = (singleGoal.value.y - robotPosition.value.y);


  const distError = Math.sqrt((dx * dx) + (dy * dy));
  if ((singleGoal.value.x != singleTarget.value.prevPos.x) &&
    (singleGoal.value.y != singleTarget.value.prevPos.y)) {
    singleTarget.value.hidden = false;
  }

  if (distError < 0.20) {
    singleTarget.value.hidden = true;
  };


  singleTarget.value.prevPos.x = singleGoal.value.x;
  singleTarget.value.prevPos.y = singleGoal.value.y;

  if (singleTarget.value.hidden) return;

  const { x, y } = singleGoal.value;
  const canvasPos = worldToCanvas(x, y);

  ctx.save();
  ctx.translate(canvasPos.x, canvasPos.y);

  const markerSize = Math.max(8, 12 * Math.sqrt(transform.value.scale));

  ctx.fillStyle = '#ff0044';
  ctx.beginPath();
  ctx.arc(0, -markerSize, markerSize * 0.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-markerSize * 0.6, -markerSize);
  ctx.lineTo(markerSize * 0.6, -markerSize);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -markerSize, markerSize * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

let renderScheduled = false;
const scheduleRender = () => {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    render();
    renderScheduled = false;
  });
};

const forceRedraw = () => {
  renderState.needsFullRedraw = true;
  scheduleRender();
};

const updatePerformanceStats = (frameTime: number) => {
  performanceState.frameCount++;
  performanceState.frameTimes.push(frameTime);

  if (performanceState.frameTimes.length > 60) {
    performanceState.frameTimes.shift();
  }

  const currentTime = performance.now();
  if (currentTime - performanceState.lastFPSTime >= 1000) {
    currentFPS.value = Math.round((performanceState.frameCount * 1000) / (currentTime - performanceState.lastFPSTime));
    performanceState.frameCount = 0;
    performanceState.lastFPSTime = currentTime;

    const sum = performanceState.frameTimes.reduce((a, b) => a + b, 0);
    averageFrameTime.value = sum / performanceState.frameTimes.length;
  }
};

const optimizeForMobile = () => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isMobile) {
    document.addEventListener('contextmenu', (e) => {
      if (e.target === canvas.value) {
        e.preventDefault();
      }
    });

    if (isIOS) {
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
    }

    if (canvas.value) {
      const ctx = canvas.value.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingQuality = 'low';
      }
    }

    showPerformanceInfo.value = false;
  }

  return isMobile;
};

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
  if (event.button !== 0) return;

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

const handleTouchStart = (event: TouchEvent) => {
  event.preventDefault();

  if (event.touches.length === 1) {
    const touch = event.touches[0];

    const dx = touch.clientX - touchState.value.lastPos.x;
    const dy = touch.clientY - touchState.value.lastPos.y;

    const dist = Math.sqrt((dx * dx) + (dy * dy));
    const distVel = (dist / (((Math.floor(performance.now())) - (touchTargetMoving.value.timePrev)) / 1000))
    if (((Math.floor(performance.now())) - touchTargetPos.value.timePrev >= 500) && (distVel > 0 && distVel <= 10)) {
      console.log("set goal press");
      console.log("cx:", touch.clientX);
      console.log("cy:", touch.clientY);

      sendGoalClick(touch.clientX, touch.clientY);
    }


    touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
    isDragging.value = true;
  } else if (event.touches.length === 2) {
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

    touchState.value.lastPosMulti = {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };

    touchState.value.active = true;
    isDragging.value = false;
    console.log("updateTouchStart")
  }

  touchTargetPos.value.timePrev = Math.floor(performance.now());
};

const handleTouchMove = (event: TouchEvent) => {
  event.preventDefault();

  if (event.touches.length === 1 && isDragging.value) {

    const touch = event.touches[0];
    const dx = touch.clientX - touchState.value.lastPos.x;
    const dy = touch.clientY - touchState.value.lastPos.y;

    const dist = Math.sqrt((dx * dx) + (dy * dy));
    const distVel = (dist / (((Math.floor(performance.now())) - (touchTargetMoving.value.timePrev)) / 1000))

    if (((Math.floor(performance.now())) - touchTargetPos.value.timePrev >= 100) && (distVel > 0 && distVel <= 10)) {
      console.log("set goal");
      console.log("cx:", touch.clientX);
      console.log("cy:", touch.clientY);

      sendGoalClick(touch.clientX, touch.clientY);
    }
    else {
      const currentTransform = smoothTransform.getCurrent();
      smoothTransform.setTarget({
        translateX: currentTransform.translateX + (dx * 5.25),
        translateY: currentTransform.translateY + (dy * 5.25)
      });

    }
    touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
    touchTargetMoving.value.timePrev = Math.floor(performance.now());
  } else if (event.touches.length === 2 && touchState.value.active) {
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



    touchDiffPos.value.dx = (centerX - touchState.value.lastPosMulti.x);
    touchDiffPos.value.dy = (centerY - touchState.value.lastPosMulti.y);

    console.log(CameraMoveVel)


    const currentTransform = smoothTransform.getCurrent();
    smoothTransform.setTarget({
      scale: newScale,
      translateX: currentTransform.translateX + (touchDiffPos.value.dx * 5.25),
      translateY: currentTransform.translateY + (dy * 5.25)
    });


    touchState.value.lastPosMulti = {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
    touchDiffPos.value.timePrev = Math.floor(performance.now());
    touchTargetMoving.value.timePrev = Math.floor(performance.now());
  }

};

const handleTouchEnd = (event: TouchEvent) => {
  event.preventDefault();

  if (event.touches.length === 0) {
    isDragging.value = false;
    touchState.value.active = false;
  } else if (event.touches.length === 1) {
    touchState.value.active = false;
    const touch = event.touches[0];
    touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
    isDragging.value = true;

    touchTargetMoving.value.timePrev = Math.floor(performance.now());
  }
};

const handleGoalClick = (event: MouseEvent) => {
  if (!canvas.value || isDragging.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const worldPos = canvasToWorld(event.clientX - rect.left, event.clientY - rect.top);
  
  singleGoal.value = { ...worldPos, yaw: 0 };
  scheduleRender();
  
  socketService.sendGoalCommand({ ...worldPos, yaw: 0 });
  console.log(`Goal set via click: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`);
};

const sendGoalClick = (clientX: number, clientY: number) => {
  if (!canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const worldPos = canvasToWorld(clientX - rect.left, clientY - rect.top);

  singleGoal.value = { ...worldPos, yaw: 0 };
  scheduleRender();
  
  socketService.sendGoalCommand({ ...worldPos, yaw: 0 });
  console.log(`Goal set via touch: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`);
};

const handleVelocity = (velocity: { Vx: number, Vy: number }) => {
  Vx.value = velocity.Vx;
  Vy.value = velocity.Vy;
  socketService.sendVelocityCommand(Vx.value, Vy.value);
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

let unsubscribeConnection: () => void = () => {};
let unsubscribeMessages: () => void = () => {};

onMounted(() => {
  handleResize();
  window.addEventListener('resize', handleResize);

  unsubscribeConnection = socketService.onConnectionChange(newStatus => {
    isConnected.value = newStatus;
  });

  let isInitialMapLoad = true;
  unsubscribeMessages = socketService.onMessage(message => {
    if (message.map) {
      const newMapData = message.map;
      const newMapHash = `${newMapData.width}-${newMapData.height}-${newMapData.data.length}`;
      
      if (renderState.lastMapHash !== newMapHash) {
        mapData.value = newMapData;
        renderState.mapTexture = generateMapTexture(newMapData);
        renderState.lastMapHash = newMapHash;
        
        if (isInitialMapLoad) {
            autoFitMap(); 
            isInitialMapLoad = false;
        }
        forceRedraw();
      }
    }
    if (message.odom) {
      const { position, orientation } = message.odom;
      robotPosition.value = {
        x: position.x,
        y: position.y,
        yaw: -(quaternionToEuler(orientation.x, orientation.y, orientation.z, orientation.w).yaw - 1.5708)
      };
      scheduleRender();
    }
  });

  // Connect the service
  socketService.connect('192.168.10.2');
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  unsubscribeConnection();
  unsubscribeMessages();
  socketService.disconnect();
});

</script>

<style scoped>
/* ... existing styles ... */
</style>
