<template>
  <div class="map-container">
    <div class="status" :class="{ connected: isConnected, disconnected: !isConnected }">
      {{ isConnected ? 'Connected' : 'Disconnected' }}
    </div>
    <div class="canvas-container">
      <canvas ref="canvas" :width="canvasWidth" :height="canvasHeight"></canvas>
    </div>
    <div class="map-controls">
      <button @click="reconnectWebSocket" :disabled="isConnected">Reconnect</button>
      <div class="zoom-controls">
        <button @click="zoomIn">+</button>
        <span>Zoom: {{ zoomLevel.toFixed(1) }}x</span>
        <button @click="zoomOut">-</button>
      </div>
    </div>
  </div>
</template>
    
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

// OccupancyGrid type definition
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


const canvas = ref<HTMLCanvasElement | null>(null);
const mapData = ref<OccupancyGrid | null>(null);  // Updated to use OccupancyGrid type

const robotPosition = ref<{ x: number; y: number, yaw: number }>({ x: 0, y: 0 });
const isConnected = ref(false);
const zoomLevel = ref(1.0);
const canvasWidth = ref(800);
const canvasHeight = ref(600);

let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;

const connectWebSocket = () => {
  if (ws) {
    ws.close();
  }

  ws = new WebSocket('ws://192.168.10.2:7448');

  ws.onopen = () => {
    console.log('WebSocket connection established');
    isConnected.value = true;
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const raw_data = JSON.parse(event.data);
      const data = raw_data.map;
      // Handle map data update

      if (data.width && data.height && data.data) {
        mapData.value = {
          width: data.width,
          height: data.height,
          resolution: data.resolution,
          origin_x: data.origin ? data.origin[0] : 0,
          origin_y: data.origin ? data.origin[1] : 0,
          data: data.compressed ? decompressData(data.data) : data.data,
          downsampled: data.downsampled,
          originalDimensions: data.original_dimensions
        };




        adjustCanvasSize();
        drawMap();
      }


      robotPosition.value.y = (raw_data.odom.position.y)
      robotPosition.value.x = (raw_data.odom.position.x)
      robotPosition.value.yaw = -(quaternionToEuler(raw_data.odom.orientation.x, raw_data.odom.orientation.y, raw_data.odom.orientation.z, raw_data.odom.orientation.w).yaw - 1.5708); // Assuming orientation is in radians
      console.log(robotPosition.value.yaw);

    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }


  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    isConnected.value = false;
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
    isConnected.value = false;

    reconnectTimeout = window.setTimeout(() => {
      console.log('Attempting to reconnect...');
      connectWebSocket();
    }, 5000);
  };
};

const reconnectWebSocket = () => {
  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  connectWebSocket();
};

// Decompress data if it's compressed (run-length encoded data)
const decompressData = (compressedData: [number, number][]) => {
  const result: number[] = [];

  for (const [value, count] of compressedData) {
    for (let i = 0; i < count; i++) {
      result.push(value);
    }
  }

  return result;
};

const adjustCanvasSize = () => {
  if (!mapData.value) return;

  const aspectRatio = mapData.value.width / mapData.value.height;

  if (aspectRatio > 1) {
    canvasWidth.value = Math.min(800, mapData.value.width * zoomLevel.value);
    canvasHeight.value = canvasWidth.value / aspectRatio;
  } else {
    canvasHeight.value = Math.min(600, mapData.value.height * zoomLevel.value);
    canvasWidth.value = canvasHeight.value * aspectRatio;
  }
};

const zoomIn = () => {
  zoomLevel.value = Math.min(5.0, zoomLevel.value + 0.5);
  adjustCanvasSize();
  drawMap();
};

const zoomOut = () => {
  zoomLevel.value = Math.max(0.5, zoomLevel.value - 0.5);
  adjustCanvasSize();
  drawMap();
};

function quaternionToEuler(x: number, y: number, z: number, w: number) {
  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.asin(Math.max(-1, Math.min(1, sinp)));

  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return { roll, pitch, yaw }; // Return Euler angles in radians
}


const drawMap = () => {
  if (!canvas.value || !mapData.value) return;

  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  const { width, height, data, resolution, origin_x, origin_y } = mapData.value;

  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');

  if (!tempCtx) return;

  const imgData = tempCtx.createImageData(width, height);

  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    let r, g, b;

    if (val === -1) {
      r = g = b = 127; // Unknown space color
    } else if (val === 0) {
      r = g = b = 240; // Free space color
    } else if (val === 100) {
      r = g = b = 0;   // Occupied space color
    } else {
      const intensity = 255 - (val * 2.55);
      r = g = b = intensity; // Gray scale for other values
    }

    // Get the x, y position for the pixel in the image
    const x = i % width;
    const y = Math.floor(i / width);

    // Flip the y-axis (ROS maps are typically with inverted Y)
    const flippedY = height - 1 - y;

    // Set pixel data
    imgData.data[(flippedY * width + x) * 4] = r;
    imgData.data[(flippedY * width + x) * 4 + 1] = g;
    imgData.data[(flippedY * width + x) * 4 + 2] = b;
    imgData.data[(flippedY * width + x) * 4 + 3] = 255; // Alpha channel (opaque)
  }

  // Put the image data onto the temporary canvas
  tempCtx.putImageData(imgData, 0, 0);


  ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, canvas.value.width, canvas.value.height);

  // if (robotPosition.value) {
  //   const scaleX = canvas.value.width / width;
  //   const scaleY = canvas.value.height / height;

  //   const robotX = ((robotPosition.value.x - origin_x) / resolution) * scaleX;
  //   const robotY = (height - (robotPosition.value.y - origin_y) / resolution) * scaleY;

  //   ctx.fillStyle = "red";
  //   ctx.beginPath();
  //   ctx.arc(robotX, robotY, 5 * zoomLevel.value, 0, 2 * Math.PI);
  //   ctx.fill();
  // }

  if (robotPosition.value) {
    const scaleX = canvas.value.width / width;
    const scaleY = canvas.value.height / height;

    const robotX = ((robotPosition.value.x - origin_x) / resolution) * scaleX;
    const robotY = (height - (robotPosition.value.y - origin_y) / resolution) * scaleY;

    const angle = robotPosition.value.yaw;

    // Define the size of the triangle
    const triangleSize = 10 * zoomLevel.value;

    // Calculate the points for the triangle based on the orientation
    const points = [
      { x: robotX, y: robotY - triangleSize }, // top point (nose of the robot)
      { x: robotX - triangleSize / 2, y: robotY + triangleSize / 2 }, // bottom left
      { x: robotX + triangleSize / 2, y: robotY + triangleSize / 2 }, // bottom right
    ];

    // Rotate the points around the robot's center (robotX, robotY) by the angle
    const rotatedPoints = points.map(point => {
      const x = point.x - robotX;
      const y = point.y - robotY;
      const rotatedX = x * Math.cos(angle) - y * Math.sin(angle) + robotX;
      const rotatedY = x * Math.sin(angle) + y * Math.cos(angle) + robotY;
      return { x: rotatedX, y: rotatedY };
    });

    // Draw the triangle
    ctx.fillStyle = "green";
    ctx.beginPath();
    ctx.moveTo(rotatedPoints[0].x, rotatedPoints[0].y);
    ctx.lineTo(rotatedPoints[1].x, rotatedPoints[1].y);
    ctx.lineTo(rotatedPoints[2].x, rotatedPoints[2].y);
    ctx.closePath();
    ctx.fill();

    const circleRadius = Math.min(
      triangleSize * 2, // Circle should not exceed twice the triangle size
      Math.min(canvas.value.width, canvas.value.height) * 0.065 // Ensure circle fits within the canvas (10% of the smaller canvas dimension)
    );

    ctx.fillStyle = "rgba(0, 255, 0, 0.3)"; // Green with 30% opacity
    ctx.beginPath();
    ctx.arc(robotX, robotY, circleRadius, 0, 2 * Math.PI);
    ctx.fill();
  }



};

onMounted(() => {
  connectWebSocket();
  window.addEventListener('resize', adjustCanvasSize);
});

onBeforeUnmount(() => {
  if (ws) {
    ws.close();
  }

  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout);
  }

  window.removeEventListener('resize', adjustCanvasSize);
});
</script>
    
<style scoped>
.map-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  max-width: 100%;
}

.canvas-container {
  border: 1px solid #ccc;
  margin: 10px 0;
  background-color: #f0f0f0;
  overflow: hidden;
}

.status {
  padding: 5px 10px;
  border-radius: 4px;
  margin-bottom: 10px;
  font-weight: bold;
}

.connected {
  background-color: #d4edda;
  color: #155724;
}

.disconnected {
  background-color: #f8d7da;
  color: #721c24;
}

.map-controls {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 800px;
  margin-top: 10px;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

button {
  padding: 5px 10px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

button:hover:not(:disabled) {
  background-color: #45a049;
}
</style>
    