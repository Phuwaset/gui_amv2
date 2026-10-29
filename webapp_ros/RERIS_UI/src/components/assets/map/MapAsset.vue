<template>
  <div class="main-container">
    <!-- Props Debug Panel (remove after testing) -->
    <div v-if="showPropsDebug" class="props-debug-panel">
      <div class="debug-header">桃 MapAsset Props</div>
      <div class="debug-row">Map: <strong>{{ props.mapName || 'N/A' }}</strong></div>
      <div class="debug-row">Site: <strong>{{ props.mapSite || 'N/A' }}</strong></div>
      <div class="debug-row">Mode: <strong>{{ props.mode }}</strong></div>
      <div class="debug-row">Recording: <strong>{{ props.recording ? 'Yes' : 'No' }}</strong></div>
      <q-btn dense flat size="xs" label="Hide" @click="showPropsDebug = false" class="q-mt-xs" />
    </div>

    <div class="map-container">
      <!-- Show status message when NOT showing toolbox -->
      <div v-if="!showStatusState" class="status"
        :class="{ connected: socketService.isConnected.value, disconnected: !socketService.isConnected.value }">
        {{ socketService.isConnected.value ? 'Connected' : 'Disconnected (Try again ?)' }}
      </div>

   <!-- Show toolbox when connected and after initial delay (hide in dashboard mode) -->
      <div v-if="props.mode !== 'dashboard' && props.mapName?.length && props.mapSite?.length">
        <ToolboxComponent
          v-model="activeTool"
          :enableHotkeys="true"
          :show="true"
          orientation="horizontal"
          :recordingMode="props.mode === 'record'"
          :mapName="props.mapName"
          :mapSiteName="props.mapSite"
          :recording="props.recording"
          :showInspection="!isInspectionPanelCollapsed"
          :node-status="state.nodeStatus.value"
          @modify="handleModify"
          @import="handleImport"
          @toggle-recording="handleToggleRecording"
          @go-back="handleGoBack"
          @save-recording="handleSaveRecording"
          @save-draft="handleSaveDraft"
          @toggle-inspection="isInspectionPanelCollapsed = !isInspectionPanelCollapsed"
          @undo="mapEngine.undo()"
          @redo="mapEngine.redo()"
        />
      </div>

      <div class="canvas-container" ref="canvasContainer" @wheel="eventHandlers.handleWheel"
        @touchstart="eventHandlers.handleTouchStart" @touchmove="eventHandlers.handleTouchMove"
        @touchend="eventHandlers.handleTouchEnd" @mousedown="eventHandlers.handleMouseDown"
        @mousemove="eventHandlers.handleMouseMove" @mouseup="eventHandlers.handleMouseUp"
        @mouseleave="eventHandlers.handleMouseUp">

        <canvas ref="canvas" :width="canvasWidth" :height="canvasHeight" class="main-canvas"
          :style="{ cursor: (activeTool === 'ptp' || activeTool === 'mptp') ? 'crosshair' : (activeTool === 'cursor' ? 'pointer' : 'default') }">
        </canvas>

      <div class="map-loading-overlay" v-if="socketService.isConnected.value && !state.mapData.value">
          <div class="radar-spinner"></div>
          <p>Waiting for Map stream...</p>
        </div>

        <div class="map-disconnected-badge" v-if="!socketService.isConnected.value">
          Disconnected
        </div>

        <div class="layer-controls" v-if="showDebugControls">
          <label>
            <input type="checkbox" v-model="layerVisibility.map" @change="mapEngine.forceRedraw()"> Map
          </label>
          <label>
            <input type="checkbox" v-model="layerVisibility.robot" @change="mapEngine.forceRedraw()"> Robot
          </label>
          <label>
            <input type="checkbox" v-model="layerVisibility.target" @change="mapEngine.forceRedraw()"> Target
          </label>
        </div>
      </div>

      <!-- ── Navigation HUD (shown when navigation is executing) ── -->
      <transition name="hud-slide">
        <div v-if="isNavigating && props.mode !== 'dashboard'" class="map-nav-hud">
          <div class="hud-inner">
            <div class="hud-dest">
              <q-icon name="navigation" size="14px" color="green-4" />
              <span class="hud-dest-name">Navigating</span>
            </div>
            <div class="hud-stats">
              <div class="hud-stat">
                <span class="hud-stat-val">{{ navHud.distRemaining }}</span>
                <span class="hud-stat-lbl">remaining</span>
              </div>
              <div class="hud-divider" />
              <div class="hud-stat">
                <span class="hud-stat-val">{{ navHud.speed }}</span>
                <span class="hud-stat-lbl">m/s</span>
              </div>
              <div class="hud-divider" />
              <div class="hud-stat">
                <span class="hud-stat-val hud-status-text" :class="navStatusClass">{{ navHud.statusLabel }}</span>
                <span class="hud-stat-lbl">status</span>
              </div>
            </div>
            <q-btn flat dense no-caps label="Cancel" icon="close" color="red-4" class="hud-cancel-btn" @click="cancelNavigation" />
          </div>
        </div>
      </transition>

      <!-- Multi-select action bar — outside canvas-container so mousedown doesn't clear selection -->
      <div
        v-if="activeTool === 'select' && (state.multiSelection.value.markerIndices.length || state.multiSelection.value.areaIds.length)"
        class="selection-action-bar"
      >
        <span class="sel-count">
          {{ state.multiSelection.value.markerIndices.length + state.multiSelection.value.areaIds.length }} selected
        </span>
        <button class="sel-btn sel-btn--dup" @click="handleDuplicateSelection" title="Duplicate (Ctrl+D)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Duplicate
        </button>
        <button class="sel-btn sel-btn--del" @click="handleDeleteSelection" title="Delete (Del)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
          Delete
        </button>
      </div>

      <ToolInspection v-if="props.mode !== 'dashboard'" :state="state" :mapEngine="mapEngine" :zoomLevel="zoomLevel" :minZoom="minZoom" :maxZoom="maxZoom"
        :showPerformanceInfo="showPerformanceInfo" :currentFPS="currentFPS" 
        :isCollapsed="isInspectionPanelCollapsed"
        @exportJson="handleExportJson"
        @exportToMap="handleExportMap" @ExecuteGoal="handleExecuteGoal" @ExecuteCancelGoal="handleExecuteCancelGoal"
        @update:isCollapsed="val => isInspectionPanelCollapsed = val" 
      />
    </div>

    <div class="joystick-container" :style="{ bottom: joystickBottomPosition + 'px' }" v-if="socketService.isConnected.value && props.mode !== 'dashboard'">
      <JoystickComponent @updateVelocity="handleVelocity" />
    </div>
  </div>
</template>

<script setup lang="ts">

import JoystickComponent from 'components/assets/joystick/JoystickAsset.vue';
import ToolboxComponent from '../map/toolbox/ToolBox.vue';
import ToolInspection from './toolbox/ToolInspection.vue';

import './css/MapAsset.css';
import { onMounted, onBeforeUnmount, computed, nextTick, watch, ref ,  } from 'vue';

// Modular imports
// import type { ExportedMap } from './state/mapState';
import {useRouter} from 'vue-router';
import  { createMapState } from './state/mapState';
import { MapEngine } from './engine/MapEngine';
import { EventHandlers } from './engine/eventHandlers';
import { ResizeManager } from './engine/resizeManager';
import { optimizeForMobile, preventDoubleZoom, cleanupMobile } from './engine/mobileUtils';
import { socketService, type RerisWebSocketMessage } from 'src/services/socketService';
import { pack, ClientMode } from 'src/services/reris-protocol';
import { server_api_config } from 'src/configs/server';
import { Notify } from 'quasar';


const router = useRouter();

/** ===== PROPS DEFINITION ===== */
type MapMode = 'visualize' | 'edit' | 'record' | 'dashboard'

const props = withDefaults(defineProps<{
  mapName?: string
  mapSite?: string
  mode?: MapMode
  recording?: boolean
}>(), {
  mapName: '',
  mapSite: '',
  mode: 'visualize',
  recording: false
})

// Debug panel control
const showPropsDebug = ref(false)

// ── Navigation HUD ────────────────────────────────────────────────────────────
const hudNavStatus   = ref(0)   // 0=Idle 1=Executing 2=Succeeded 3=Failed 4=Canceled
const hudRobotPos    = ref({ x: 0, y: 0 })
const hudRobotSpeed  = ref(0)
const hudNavTarget   = ref<{ x: number; y: number } | null>(null)
const hudTotalDist   = ref(0)

const NAV_STATUS_LABELS: Record<number, string> = {
  0: 'Idle', 1: 'Executing', 2: 'Succeeded', 3: 'Failed', 4: 'Canceled'
}
function fmtDist(m: number) {
  return m >= 10 ? `${m.toFixed(1)} m` : `${m.toFixed(2)} m`
}
const isNavigating = computed(() => hudNavStatus.value === 1)
const navHud = computed(() => {
  const dist = hudNavTarget.value
    ? Math.sqrt((hudRobotPos.value.x - hudNavTarget.value.x) ** 2 + (hudRobotPos.value.y - hudNavTarget.value.y) ** 2)
    : 0
  return {
    distRemaining: fmtDist(dist),
    distTotal: fmtDist(hudTotalDist.value),
    speed: hudRobotSpeed.value.toFixed(2),
    statusLabel: NAV_STATUS_LABELS[hudNavStatus.value] ?? 'Unknown'
  }
})
const navStatusClass = computed(() => {
  if (hudNavStatus.value === 1) return 'hud-status-executing'
  if (hudNavStatus.value === 2) return 'hud-status-succeeded'
  if (hudNavStatus.value === 3 || hudNavStatus.value === 4) return 'hud-status-failed'
  return ''
})
function cancelNavigation() { socketService.sendCancelMultiGoal() }

/** ===== STATE INITIALIZATION ===== */
const state = createMapState();

// NEW state for inspection panel
const isInspectionPanelCollapsed = ref(true); // Default collapsed/hidden

// Destructure reactive refs for template access
const {
  canvas,
  canvasContainer,
  canvasWidth,
  canvasHeight,
  activeTool,
  showConnected,
  showStatusState,
  zoomLevel,
  minZoom,
  maxZoom,
  Vx,
  Vy,
  showDebugControls,
  showPerformanceInfo,
  currentFPS,
  layerVisibility,
  multiGoal,
} = state;

// Sample JSON data for testing
// const jsonData: ExportedMap = {
//   map_section: [
//     {
//       section_lable: "MAP",
//       section_color: "#22c55e",
//       section_position: [
//         { x: -0.33, y: -1.48, idx: 0 },
//         { x: 1.72, y: -1.48, idx: 1 },
//         { x: 1.72, y: 0.34, idx: 2 },
//         { x: -0.33, y: 0.34, idx: 3 }
//       ],
//       section_position_centroid: { x: 0.7, y: -0.57 },
//       section_marker: [
//         { marker_name: "B", marker_type: "point", marker_position: { x: 1.25, y: -1.25, yaw: 0 } },
//         { marker_name: "C", marker_type: "point", marker_position: { x: 0, y: -1.25, yaw: -0.02 } },
//         { marker_name: "A", marker_type: "point", marker_position: { x: 1.25, y: 0, yaw: 0 } },
//         { marker_name: "D", marker_type: "point", marker_position: { x: 0, y: 0, yaw: 0 } }
//       ]
//     }
//   ],
//   map_size: { width: 0, height: 0 }
// }

/** ===== COMPUTED PROPERTIES ===== */
const joystickBottomPosition = computed(() => 20);

/** ===== ENGINE INITIALIZATION ===== */
const mapEngine = new MapEngine(state);
const eventHandlers = new EventHandlers(state, mapEngine, socketService);
const resizeManager = new ResizeManager(state, mapEngine);

function loadRobotImage() {
  const url = `http://${server_api_config.ip}:${server_api_config.port}/api/system/robot-image`
  const img = new Image()
  img.onload  = () => { mapEngine.setRobotImage(img) }
  img.onerror = () => { mapEngine.setRobotImage(null) }
  img.src = url
}

function applyEngineConfigFromStorage() {
  try {
    const raw = localStorage.getItem('mapEngineConfig');
    if (!raw) return;
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    // Zoom limits
    if (typeof cfg['minZoom'] === 'number') state.minZoom = cfg['minZoom'];
    if (typeof cfg['maxZoom'] === 'number') state.maxZoom = cfg['maxZoom'];
    // Layer visibility
    const lv = cfg['layerVisibility'] as Record<string, boolean> | undefined;
    if (lv) state.layerVisibility.value = { ...state.layerVisibility.value, ...lv };
    // Visual config (robot, nav path, LUT)
    mapEngine.setVisualConfig({
      robotColor:   typeof cfg['robotColor']   === 'string' ? cfg['robotColor']   : undefined,
      robotRadius:  typeof cfg['robotRadius']  === 'number' ? cfg['robotRadius']  : undefined,
      navPathColor: typeof cfg['navPathColor'] === 'string' ? cfg['navPathColor'] : undefined,
      navPathWidth: typeof cfg['navPathWidth'] === 'number' ? cfg['navPathWidth'] : undefined,
      lutFree:      typeof cfg['lutFree']      === 'number' ? cfg['lutFree']      : undefined,
      lutOccupied:  typeof cfg['lutOccupied']  === 'number' ? cfg['lutOccupied']  : undefined,
      lutUnknown:   typeof cfg['lutUnknown']   === 'number' ? cfg['lutUnknown']   : undefined,
    });
  } catch (e) {
    console.warn('[MapAsset] applyEngineConfig failed', e);
  }
}

// WebSocket subscription references
let unsubscribeMessages: (() => void) | null = null;
let unsubscribeConnection: (() => void) | null = null;

/** ===== WASD KEYBOARD DRIVE ===== */
const wasdKeys = new Set<string>();
let wasdLoopId: ReturnType<typeof setInterval> | null = null;
const WASD_LINEAR  = 0.5;  // m/s  (W/S)
const WASD_ANGULAR = 1.0;  // rad/s (A/D)

function startWasdLoop() {
  if (wasdLoopId !== null) return;
  wasdLoopId = setInterval(() => {
    if (!socketService.isConnected.value || wasdKeys.size === 0) {
      stopWasdLoop();
      return;
    }
    const vx = (wasdKeys.has('w') ? WASD_LINEAR : 0) - (wasdKeys.has('s') ? WASD_LINEAR : 0);
    const wz = (wasdKeys.has('a') ? WASD_ANGULAR : 0) - (wasdKeys.has('d') ? WASD_ANGULAR : 0);
    socketService.sendVelocityCommand(vx, wz);
  }, 50); // 20 Hz
}

function stopWasdLoop() {
  if (wasdLoopId !== null) {
    clearInterval(wasdLoopId);
    wasdLoopId = null;
  }
  // Send a stop command so the robot doesn't coast
  if (socketService.isConnected.value) {
    socketService.sendVelocityCommand(0, 0);
  }
}

function onWasdKeyDown(e: KeyboardEvent) {
  const tg = e.target as HTMLElement | null;
  if (tg && /input|textarea|select/i.test(tg.tagName)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!socketService.isConnected.value) return;
  if (props.mode === 'dashboard') return;

  const k = e.key.toLowerCase();
  if (!['w', 'a', 's', 'd'].includes(k)) return;

  e.preventDefault();
  if (!wasdKeys.has(k)) {
    wasdKeys.add(k);
    startWasdLoop();
  }
}

function onWasdKeyUp(e: KeyboardEvent) {
  const k = e.key.toLowerCase();
  if (!['w', 'a', 's', 'd'].includes(k)) return;
  wasdKeys.delete(k);
  if (wasdKeys.size === 0) stopWasdLoop();
}

function onWasdBlur() {
  // Stop robot if window loses focus while keys are held
  if (wasdKeys.size > 0) {
    wasdKeys.clear();
    stopWasdLoop();
  }
}
let mapAckSent = false; // Tracks if MAP_RECEIVED_ACK has been sent for this connection

// Sync mode to map state immediately
watch(() => props.mode, (newMode) => {
  if (newMode) state.mode.value = newMode;
}, { immediate: true })

/** ===== WATCHERS ===== */
// Watch socket connection status
watch(() => socketService.isConnected.value, (val) => {
  state.isConnected.value = val;

  if (val) {
    // When connected, clear stale map so the loading spinner shows until the new map arrives
    state.mapData.value = null;
    showConnected.value = true;
    showStatusState.value = false;
    setTimeout(() => {
      // After 2 seconds, hide the status message and show the toolbox
      showConnected.value = false;
      if (socketService.isConnected.value) {
        showStatusState.value = true;
      }
    }, 2000);
  } else {
    // When disconnected, hide toolbox and reset ACK flag so we re-ACK on next connection
    showStatusState.value = false;
    mapAckSent = false;
    // Keep mapData so the canvas stays rendered and pannable while offline.
    // The loading overlay uses (isConnected && !mapData), so it still shows
    // correctly on reconnect once mapData is cleared when the new map arrives.
  }
});

// Watch multiGoal changes
watch(multiGoal, () => {
  state.multiGoalUpdate.value = true;
}, { deep: true });

// Auto-open inspection panel when multi-selection is made
watch(state.multiSelection, (sel) => {
  if ((sel.markerIndices.length || sel.areaIds.length) && isInspectionPanelCollapsed.value) {
    isInspectionPanelCollapsed.value = false;
  }
}, { deep: true });

// Watch props changes
watch(() => props, (newProps) => {
  console.log('売 MapAsset props changed:', newProps);
  // Here you can react to prop changes, e.g., load different map data
  // based on mapName and mapSite
}, { deep: true });

// Watch mode changes
watch(() => props.mode, (newMode) => {
  console.log('式 Mode changed to:', newMode);
  // You can adjust UI or behavior based on mode
  if (newMode === 'edit') {
    // Enable edit features
  } else if (newMode === 'record') {
    // Enable recording features
  } else {
    // Default visualize mode
  }
});

/** ===== EVENT HANDLERS ===== */
const handleModify = () => {
  console.log('Modify clicked');
  // Add your modify logic here
}

const handleImport = () => {
  console.log('Import clicked');
  // Add your import logic here
}

const handleSaveRecording = async () => {
  console.log("Saving map data...");
  try {
    // NOTE: sendRecord(0) is intentionally NOT called here.
    // ToolBox.vue already calls socketService.sendRecord(0) when the user clicks Save.
    // Calling it again here would reset recordingSuccessStatus to False on the backend
    // before it has a chance to report success, causing the "Failed to save map" error.

    // 1. Export PGM/YAML binary and send to robot
    const buffer = mapEngine.buildMapExportBuffer(props.mapSite || '', props.mapName || '');
    if (buffer) {
      socketService.sendRawBinary(buffer);
    } else {
      Notify.create({ type: 'negative', message: 'Failed to build map buffer' });
      return;
    }

    // 2. Export JSON user data (Markers & Restricted Areas) and save to MongoDB
    const userData = mapEngine.export_to_json(state.multiGoal.value, state.areaRects.value);
    
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/map/update`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        mapSite: props.mapSite,
        mapName: props.mapName,
        mapStatus: 1, // Ready
        mapData: JSON.stringify(userData)
      })
    });

    if (!res.ok) throw new Error(`API Error: ${res.status}`);

    Notify.create({ type: 'positive', message: 'Map data exported to robot and database!' });
    
    setTimeout(() => {
      void router.push({ name: 'MapsList' });
    }, 1500);

  } catch (err) {
    console.error('Failed to save map fully:', err);
    Notify.create({ type: 'negative', message: 'Failed to save map details to database.' });
  }
}


const handleSaveDraft = async () => {
  try {
    const userData = mapEngine.export_to_json(state.multiGoal.value, state.areaRects.value);
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/map/update`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        mapSite: props.mapSite,
        mapName: props.mapName,
        mapStatus: props.mode === 'record' ? 0 : 1, // Keep it ready if not actively recording
        mapData: JSON.stringify(userData)
      })
    });

    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    Notify.create({ type: 'positive', message: 'Sections & markers saved!', timeout: 1500 });
  } catch (err) {
    console.error('[MapAsset] Draft save failed:', err);
    Notify.create({ type: 'negative', message: 'Failed to save draft.' });
  }
}

const handleToggleRecording = () => {
  console.log('Toggle recording state changed');
}

const handleGoBack = async () => {
  console.log('Go back clicked');
  // Navigate back to maps list
  await router.push({ name: 'MapsList' });
}

/** ===== DATA LOADING ===== */
const fetchSavedMapData = async () => {
  if (!props.mapSite || !props.mapName) return;
  
  try {
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `http://${server_api_config.ip}:${server_api_config.port}/api/map/data?site=${encodeURIComponent(props.mapSite)}&name=${encodeURIComponent(props.mapName)}`;
    const res = await fetch(url, { headers });
    
    if (res.ok) {
      const result = await res.json();
      if (result.mapData) {
        console.log('[MapAsset] Loaded saved map data from MongoDB');
        mapEngine.import_from_json(result.mapData, state);
      }
    } else if (res.status !== 404) {
      console.warn('[MapAsset] Failed to fetch map data:', res.status);
    }
  } catch (err) {
    console.error('[MapAsset] Error fetching map data:', err);
  }
}


// Velocity handler
const handleVelocity = (velocity: { Vx: number; Vy: number; heartbeat: boolean }) => {
  Vx.value = velocity.Vx;
  Vy.value = velocity.Vy;
  socketService.sendVelocityCommand(Vx.value, Vy.value, velocity.heartbeat);
};

// Export handlers
const handleExportJson = (onclick: boolean) => {
  mapEngine.export_to_json(state.multiGoal.value, state.areaRects.value);
  console.log('Export JSON clicked:', onclick);
}

const handleExportMap = () => {
  mapEngine.exportAsPGM('map.pgm');
  console.log('Save edit mapper');
}

// Goal handlers
const handleExecuteGoal = () => {
  console.log('Execute goal');
  socketService.sendExecMultiGoal();
}

const handleExecuteCancelGoal = () => {
  console.log('Cancel goal');
  socketService.sendCancelMultiGoal();
}

// Clear multi-point goals
const clearMultiPoint = () => {
  multiGoal.value = [];
};

// ── Multi-selection action bar handlers ──────────────────────────────────────
const handleDuplicateSelection = () => eventHandlers.duplicateMultiSelection();
const handleDeleteSelection    = () => eventHandlers.deleteMultiSelection();

function onSelectionKey(e: KeyboardEvent) {
  const tg = e.target as HTMLElement | null;
  if (tg && /input|textarea|select/i.test(tg.tagName)) return;
  if (activeTool.value !== 'select') return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    eventHandlers.deleteMultiSelection();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    eventHandlers.duplicateMultiSelection();
  }
}

/** ===== UTILITY FUNCTIONS ===== */
// Quaternion to Euler conversion
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

/** ===== WEBSOCKET MESSAGE HANDLER ===== */
const handleWebSocketMessage = (message: RerisWebSocketMessage) => {
  const { map, odom, nodesStatus, navPath } = message;

  let mapChanged = false;
  let robotChanged = false;
  if(nodesStatus){
    const prevIdx = state.nodeStatus.value?.current_goal_idx ?? -1;
    state.nodeStatus.value = nodesStatus;

    // Clear planned path when the robot is no longer actively navigating
    if (nodesStatus.current_goal_idx === -1 && prevIdx !== -1) {
      mapEngine.setNavPath([]);
    }

    // Feed navigation HUD
    hudNavStatus.value = nodesStatus.navigation_status ?? 0;
    if (nodesStatus.current_goal_pos) {
      hudNavTarget.value = { x: nodesStatus.current_goal_pos.x, y: nodesStatus.current_goal_pos.y };
    } else if ((nodesStatus.navigation_status ?? 0) === 0) {
      hudNavTarget.value = null;
    }
  }
  // Handle map data
  if (map?.width && map?.height && map?.data) {
    const newMapData = {
      ...map,
      resolution: map.resolution || 0.05,
      origin_x: map.origin_x ?? 0,
      origin_y: map.origin_y ?? 0,
      data: map.data,
      downsampled: map.downsampled || false,
      originalDimensions: map.originalDimensions || { width: map.width, height: map.height },
    };

    const newMapHash = `${newMapData.width}-${newMapData.height}-${newMapData.data.length}`;
    // Process the map if content changed OR if mapData hasn't been set yet (initial load)
    if (state.renderState.lastMapHash !== newMapHash || !state.mapData.value) {
      state.mapData.value = newMapData;
      void mapEngine.updateMapTexture(newMapData);
      mapChanged = true;

      // Send MAP_RECEIVED_ACK only after we've actually set mapData in Vue state
      // (sending from socketService.ts was too early — before onMounted registered this callback)
      if (!mapAckSent) {
        mapAckSent = true;
        try {
          const ack = pack(ClientMode.MAP_RECEIVED_ACK);
          socketService.sendRawBinary(ack);
          console.log('[MapAsset] MAP_RECEIVED_ACK sent — backend will switch to update-only mode');
        } catch (e) {
          console.warn('[MapAsset] Failed to send MAP_RECEIVED_ACK:', e);
        }
      }
    }
  }

  // Handle robot position
  if (odom?.position && odom?.orientation) {
    hudRobotPos.value = { x: odom.position.x, y: odom.position.y };
    if (odom.velocity?.linear) {
      const vx = odom.velocity.linear.x, vy = odom.velocity.linear.y
      hudRobotSpeed.value = Math.sqrt(vx * vx + vy * vy)
    }
    const newRobotPosition = {
      x: odom.position.x,
      y: odom.position.y,
      yaw: -(
        quaternionToEuler(
          odom.orientation.x,
          odom.orientation.y,
          odom.orientation.z,
          odom.orientation.w
        ).yaw - 1.5708
      ),
    };

    const newRobotHash = `${newRobotPosition.x.toFixed(3)}-${newRobotPosition.y.toFixed(3)}-${newRobotPosition.yaw.toFixed(3)}`;
    if (state.renderState.lastRobotState.hash !== newRobotHash) {
      state.robotPosition.value = newRobotPosition;
      state.renderState.lastRobotState = { ...newRobotPosition, hash: newRobotHash };
      robotChanged = true;
    }
  }

  // Handle nav path
  if (navPath !== undefined) {
    mapEngine.setNavPath(navPath);
  }

  // Schedule render if needed
  if (mapChanged || robotChanged) {
    mapEngine.forceRedraw();
  }
};

/** ===== MAP READY & RECTS UPDATE ===== */
const didFitMap = ref(false);

// Wait until map + canvas ready, then call autoFitMap ONCE
function waitForMapReady() {
  if (state.mapData.value && canvasWidth.value > 0 && canvasHeight.value > 0) {
    if (!didFitMap.value) {
      setTimeout(() => {
        mapEngine.autoFitMap();
        didFitMap.value = true;
      }, 100);
    }
  } else {
    requestAnimationFrame(waitForMapReady);
  }
}

// Update areaRects when multiGoal changes (requestAnimationFrame batched)
let rafId = 0;
let dirty = false;

function scheduleRectsUpdate() {
  if (dirty) return;
  dirty = true;
  rafId = requestAnimationFrame(() => {
    dirty = false;
    const updated = mapEngine.assignMarkersToRects(
      state.multiGoal.value,
      state.areaRects.value
    );
    state.areaRects.value = updated;
  });
}

/** ===== LIFECYCLE HOOKS ===== */
onMounted(async () => {
  await nextTick();

  // Log props on mount for debugging
  console.log('MapAsset mounted with props:', {
    mapName: props.mapName,
    mapSite: props.mapSite,
    mode: props.mode,
    recording: props.recording
  });

  // Auto-hide debug panel after 4 seconds
  setTimeout(() => {
    showPropsDebug.value = false;
  }, 4000);

  // Apply saved map engine config (visual overrides, zoom, layers)
  applyEngineConfigFromStorage();

  // Load custom robot image (replaces triangle if uploaded)
  loadRobotImage();

  // Clear all multiple points
  clearMultiPoint();

  // Mobile optimizations
  const isMobile = optimizeForMobile();

  // Initialize canvas
  resizeManager.handleResize();

  // Prevent double-zoom on mobile
  if (canvas.value && isMobile) {
    preventDoubleZoom(canvas.value);
  }

  // Set up event listeners
  window.addEventListener('resize', resizeManager.debouncedResize);
  window.addEventListener('keydown', onWasdKeyDown);
  window.addEventListener('keyup', onWasdKeyUp);
  window.addEventListener('blur', onWasdBlur);
  window.addEventListener('keydown', onSelectionKey);

  // Mobile-specific event listeners
  if (isMobile) {
    window.addEventListener('orientationchange', resizeManager.handleOrientationChange);

    const handleViewportChange = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      resizeManager.debouncedResize();
    };

    window.addEventListener('resize', handleViewportChange);
  }

  // Subscribe to WebSocket messages
  unsubscribeMessages = socketService.onMessage(handleWebSocketMessage);

  // Subscribe to connection status
  unsubscribeConnection = socketService.onConnectionChange((connected) => {
    state.isConnected.value = connected;
  });

  // If already connected but no map data (e.g. page navigation), request a fresh map
  if (socketService.isConnected.value && !state.mapData.value) {
    try {
      const req = pack(ClientMode.REQUEST_MAP);
      socketService.sendRawBinary(req);
      console.log('[MapAsset] REQUEST_MAP sent — already connected, asking backend to re-send map');
    } catch (e) {
      console.warn('[MapAsset] Failed to send REQUEST_MAP:', e);
    }
  }

  // Initialize map and rects
  waitForMapReady();
  await fetchSavedMapData();
  scheduleRectsUpdate();

  // Watch for multiGoal and areaRects changes
  watch(() => [state.multiGoal.value, state.areaRects.value], scheduleRectsUpdate, { deep: true });

  watch(() => state.multiGoal.value, () => {
    console.log('Multi-goal updated');
    eventHandlers.sendPositionGoal('cursor', true);
  });

  // Show connection status
  showConnected.value = true;
  showStatusState.value = false;
  setTimeout(() => {
    showConnected.value = false;
    if (socketService.isConnected.value) {
      showStatusState.value = true;
    }
  }, 2000);
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);

  // Unsubscribe from WebSocket
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeConnection) unsubscribeConnection();

  // Cleanup
  resizeManager.cleanup();

  if (state.renderState.animationFrameId) {
    cancelAnimationFrame(state.renderState.animationFrameId);
  }

  // Remove event listeners
  window.removeEventListener('resize', resizeManager.debouncedResize);
  window.removeEventListener('keydown', onWasdKeyDown);
  window.removeEventListener('keyup', onWasdKeyUp);
  window.removeEventListener('blur', onWasdBlur);
  window.removeEventListener('keydown', onSelectionKey);
  stopWasdLoop();

  // Mobile cleanup
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    window.removeEventListener('orientationchange', resizeManager.handleOrientationChange);
    cleanupMobile();
  }
});
</script>

<style scoped>
/* Props Debug Panel */
.props-debug-panel {
  position: absolute;
  top: 70px;
  right: 16px;
  background: rgba(0, 0, 0, 0.92);
  color: #fff;
  padding: 14px;
  border-radius: 8px;
  font-size: 12px;
  z-index: 9998;
  min-width: 220px;
  border: 2px solid #6366f1;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
}

.debug-header {
  font-size: 13px;
  font-weight: 700;
  color: #6366f1;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(99, 102, 241, 0.3);
}

.debug-row {
  margin-bottom: 5px;
  color: #ddd;
}

.debug-row strong {
  color: #6366f1;
  font-weight: 600;
}

/* ── Multi-select action bar ───────────────────────────────────────────────── */
.selection-action-bar {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(28, 28, 32, 0.92);
  border: 1px solid rgba(66, 133, 244, 0.5);
  border-radius: 12px;
  padding: 8px 14px;
  z-index: 500;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
.sel-count {
  font-size: 13px;
  color: #9ca3af;
  margin-right: 4px;
}
.sel-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  min-height: 36px;
}
.sel-btn svg { width: 15px; height: 15px; }
.sel-btn--dup {
  background: rgba(66, 133, 244, 0.2);
  color: #4285F4;
  border: 1px solid rgba(66, 133, 244, 0.4);
}
.sel-btn--dup:hover { background: rgba(66, 133, 244, 0.35); }
.sel-btn--del {
  background: rgba(220, 50, 50, 0.15);
  color: #f87171;
  border: 1px solid rgba(220, 50, 50, 0.35);
}
.sel-btn--del:hover { background: rgba(220, 50, 50, 0.3); }

/* Joystick fixed overlay (only when used inside MapAsset) */
.joystick-container {
  position: fixed;
  bottom: 20px;
  left: 2vw;
  z-index: 2000;
}
</style>
