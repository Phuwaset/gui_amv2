<template>
  <svg width="0" height="0" style="position:absolute;display:none;">
    <defs>
      <symbol id="icon-loader" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="2" x2="12" y2="6"></line>
        <line x1="12" y1="18" x2="12" y2="22"></line>
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
        <line x1="2" y1="12" x2="6" y2="12"></line>
        <line x1="18" y1="12" x2="22" y2="12"></line>
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
      </symbol>
      <symbol id="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </symbol>
    </defs>
  </svg>

  <div class="recording-header" :class="{ 'is-rec': isRecordingMode }">
    <div class="recording-left">
      <div class="site-info">
        <div class="site-title">{{ mapSiteName || 'MtET Site' }}</div>
        <div class="site-subtitle">{{ mapName || 'MtET Headquarter' }}</div>
      </div>
    </div>

    <div class="recording-center">
      <div v-if="show" class="tool-buttons" role="radiogroup" aria-label="Map tools" @keydown="onRovingKeys">

        <!-- Undo / Redo — always visible, left of all tools -->
        <button class="rec-btn" title="Undo (Ctrl+Z)" @click="$emit('undo')">
          <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7v6h6" /><path d="M3 13C5.33 8.67 9 7 13 7c3.5 0 6.5 1.5 8.5 4.5" />
          </svg>
        </button>
        <button class="rec-btn" title="Redo (Ctrl+Y)" @click="$emit('redo')">
          <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 7v6h-6" /><path d="M21 13C18.67 8.67 15 7 11 7c-3.5 0-6.5 1.5-8.5 4.5" />
          </svg>
        </button>
        <div class="tool-sep"></div>

        <template v-if="!showAllTools">
          <button ref="btnCursor" class="rec-btn tool-btn-style" :class="{ 'is-active': modelValue === 'cursor' }"
            title="Cursor (V)" role="radio" :aria-checked="modelValue === 'cursor'"
            :tabindex="modelValue === 'cursor' ? 0 : -1" @click="setTool('cursor')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
          </button>

          <button ref="btnPtp" class="rec-btn tool-btn-style" :class="{ 'is-active': modelValue === 'ptp' }"
            title="Point to Point (P)" role="radio" :aria-checked="modelValue === 'ptp'"
            :tabindex="modelValue === 'ptp' ? 0 : -1" @click="setTool('ptp')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </button>
        </template>

        <template v-else>
          <button ref="btnCursor" class="rec-btn tool-btn-style" :class="{ 'is-active': modelValue === 'cursor' }"
            title="Cursor (V)" role="radio" :aria-checked="modelValue === 'cursor'"
            :tabindex="modelValue === 'cursor' ? 0 : -1" @click="setTool('cursor')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
          </button>

          <button ref="btnSelect" class="rec-btn tool-btn-style" :class="{ 'is-active': modelValue === 'select' }"
            title="Multi Select (Q)" role="radio" :aria-checked="modelValue === 'select'"
            :tabindex="modelValue === 'select' ? 0 : -1" @click="setTool('select')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path stroke-dasharray="none" d="M9 9l6 6M15 9l-6 6" />
            </svg>
          </button>

          <button ref="btnPtp" class="rec-btn tool-btn-style" :class="{ 'is-active': modelValue === 'ptp' }"
            title="Point to Point (P)" role="radio" :aria-checked="modelValue === 'ptp'"
            :tabindex="modelValue === 'ptp' ? 0 : -1" @click="setTool('ptp')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </button>

          <button ref="btnMptpNav" class="rec-btn tool-btn-style" :class="{ 'is-active': modelValue === 'mptp_nav' }"
            title="Multi Point to Point V2" role="radio" :aria-checked="modelValue === 'mptp_nav'"
            :tabindex="modelValue === 'mptp_nav' ? 0 : -1" @click="setTool('mptp_nav')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
              <path d="M17 8l3-3m0 0l-3-3m3 3H14" />
            </svg>
          </button>

          <button ref="btnArea" class="rec-btn tool-btn-style" :class="{ 'is-active': modelValue === 'area' }"
            title="Area (A)" role="radio" :aria-checked="modelValue === 'area'"
            :tabindex="modelValue === 'area' ? 0 : -1" @click="setTool('area')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </button>

          <button ref="btnEditor" class="rec-btn tool-btn-style" :class="{ 'is-active': modelValue === 'editor' }"
            title="Map Editor (E)" role="radio" :aria-checked="modelValue === 'editor'"
            :tabindex="modelValue === 'editor' ? 0 : -1" @click="setTool('editor')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>

          <button ref="btnEditorErase" class="rec-btn tool-btn-style"
            :class="{ 'is-active': modelValue === 'editor_erase' }" title="Map Editor Erase" role="radio"
            :aria-checked="modelValue === 'editor_erase'" :tabindex="modelValue === 'editor_erase' ? 0 : -1"
            @click="setTool('editor_erase')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 20H7L3 16l7-7 7 7-3 4z" />
              <path d="M6 11l7-7 7 7" />
            </svg>
          </button>

          <button ref="btnEditorBrushErase" class="rec-btn tool-btn-style"
            :class="{ 'is-active': modelValue === 'editor_brush_erase' }" title="Map Editor Brush Erase" role="radio"
            :aria-checked="modelValue === 'editor_brush_erase'" :tabindex="modelValue === 'editor_brush_erase' ? 0 : -1"
            @click="setTool('editor_brush_erase')">
            <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
              <path
                d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
            </svg>
          </button>
        </template>
      </div>
    </div>

    <div class="recording-right">
      <button v-show="!showAllTools" class="rec-btn record-toggle"
        :class="{ active: (isRecording && !recordingState), disabled: recordingState }" @click="toggleRecording"
        title="Toggle Recording">
        <div v-if="!isRecording" class="rec-dot" :class="{ pulse: isRecording }"></div>
        <span>{{ isRecording ? formattedTime : `${recordingState ? "Saving" : "Rec"}` }}</span>
      </button>

      <button v-if="!showAllTools" class="rec-btn save-draft" @click="$emit('save-draft')" title="Save sections & markers">
        <q-icon name="save" />
      </button>

      <!-- <button class="rec-btn import" title="Import" @click="$emit('import')">
        <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button> -->

      <button class="rec-btn" :aria-expanded="showAllTools" :title="showAllTools ? 'Hide tools' : 'Show all tools'"
        @click="showAllTools = !showAllTools">
        <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline :points="showAllTools ? '18 15 12 9 6 15' : '6 9 12 15 18 9'" />
        </svg>
      </button>

      <button class="rec-btn inspect-toggle" :class="{ active: showInspection }" @click="$emit('toggle-inspection')"
        title="Toggle Inspection Panel">
        <svg class="rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>

      <button class="rec-btn go-back" @click="goBack" title="Go Back">
        <q-icon name="arrow_back_ios" />
      </button>
    </div>
  </div>

  <!-- Status Dialog -->
  <div v-if="showStatusDialog" class="dialog-overlay" @click.self="handleCancelStatusCheck">
    <div class="status-dialog-box">
      <h2>Recording Status</h2>
      <ul class="status-list">
        <li class="status-item">
          <div class="status-icon">
            <svg v-if="!statusOdometry" class="icon-loader">
              <use href="#icon-loader" />
            </svg>
            <svg v-else class="icon-check">
              <use href="#icon-check" />
            </svg>
          </div>
          <span>Robot Odometry</span>
        </li>
        <li class="status-item">
          <div class="status-icon">
            <svg v-if="!statusMapping" class="icon-loader">
              <use href="#icon-loader" />
            </svg>
            <svg v-else class="icon-check">
              <use href="#icon-check" />
            </svg>
          </div>
          <span>Robot Mapping</span>
        </li>
        <li class="status-item">
          <div class="status-icon">
            <svg v-if="!statusConnection" class="icon-loader">
              <use href="#icon-loader" />
            </svg>
            <svg v-else class="icon-check">
              <use href="#icon-check" />
            </svg>
          </div>
          <span>Robot Connection</span>
        </li>
      </ul>
      <div class="dialog-actions">
        <button class="dialog-btn btn-cancel" @click="handleCancelStatusCheck">Cancel</button>
        <button class="dialog-btn btn-save" @click="startActualRecording" :disabled="!allChecksComplete">
          {{ allChecksComplete ? 'Start Recording' : 'Checking...' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Save Dialog -->
  <div v-if="showSaveDialog" class="dialog-overlay" @click.self="handleCancelSave">
    <div class="dialog-box">
      <h2>Save Recorded</h2>
      <div class="dialog-content">
        <div class="form-group">
          <label for="fileName">FileName</label>
          <input id="fileName" type="text" v-model="saveFileName" />
        </div>
        <div class="form-group">
          <label for="fileLocation">FileLocation</label>
          <input id="fileLocation" type="text" v-model="defaultLocation" readonly />
        </div>
      </div>
      <div class="dialog-actions">
        <button class="dialog-btn btn-cancel" @click="handleCancelSave">Cancel</button>
        <button class="dialog-btn btn-save" @click="handleSaveRecording">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import './css/ToolBox.css'
import { socketService } from 'src/services/socketService';
import type { INodeStatus } from '../state/mapState';
import { Notify } from 'quasar'
import { server_api_config } from 'src/configs/server';

export type ToolType =
  | 'cursor' | 'select' | 'ptp' | 'mptp' | 'mptp_nav'
  | 'area' | 'editor' | 'editor_erase' | 'editor_brush_erase';

const props = defineProps<{
  modelValue: ToolType;
  show?: boolean;
  orientation?: 'vertical' | 'horizontal' | 'auto';
  enableHotkeys?: boolean;
  // Recording
  nodeStatus: INodeStatus;
  recordingMode?: boolean;
  mapName?: string;
  mapSiteName?: string;
  recording?: boolean;
  showInspection?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: ToolType): void;
  (e: 'modify'): void;
  (e: 'import'): void;
  (e: 'toggle-recording'): void;
  (e: 'save-recording', filename: string, location: string): void;
  (e: 'save-draft'): void;
  (e: 'go-back'): void;
  (e: 'toggle-inspection'): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
}>();

const show = computed(() => props.show ?? true);
const isRecordingMode = computed(() => props.recordingMode ?? false);
const isRecording = ref(props.recording ?? false);
const recordingState = ref(false);

/** Toggle to show ALL tools */
const showAllTools = ref(false);

// --- Timer state ---
const elapsedSeconds = ref(0);
let timerInterval: number | undefined = undefined;
let dataframeFailStreak = 0;  // How many consecutive 1s ticks had bad state
const DATAFRAME_FAIL_THRESHOLD = 5; // Tolerate up to 5s of sensor drop before killing

// --- Save Dialog state ---
const showSaveDialog = ref(false);
const saveFileName = ref(`${props.mapSiteName}_${props.mapName}.pgm`);
const defaultLocation = ref('/var/data/recordings/');

// --- Status Dialog state ---
const showStatusDialog = ref(false);
const statusOdometry = ref(false);
const statusMapping = ref(false);
const statusConnection = ref(false);
const statusTimeouts = ref<number[]>([]);
const allChecksComplete = ref(false);

// --- Polling ของสถานะ ---
let statusPoller: number | undefined = undefined;



async function updateMapStatus(mapSite: string, mapName: string, status: number) {
  try {
    const response = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/map/update`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken') // optional if you use JWT
      },
      body: JSON.stringify({
        mapSite: mapSite,
        mapName: mapName,
        mapStatus: status
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Update failed:', errorData);
      return;
    }

    const data = await response.json();
    console.log('✅ Map updated successfully:', data);
    // Example: show notification if you use Quasar
    // Notify.create({ type: 'positive', message: `Map ${mapName} updated successfully` });

  } catch (error) {
    console.error('Error updating map:', error);
    // Notify.create({ type: 'negative', message: 'Error updating map' });
  }
}


function startStatusPolling(intervalMs = 100) {
  stopStatusPolling();
  statusPoller = window.setInterval(() => {
    if (socketService.isConnected.value) {
      statusMapping.value = !!props.nodeStatus?.map_state;
      statusOdometry.value = !!props.nodeStatus?.odom_state;
      statusConnection.value = true;
    } else {
      statusMapping.value = false;
      statusOdometry.value = false;
      statusConnection.value = false;
    }
    allChecksComplete.value =
      statusOdometry.value && statusMapping.value && statusConnection.value;
    // console.log('still polling')
  }, intervalMs);
}

function stopStatusPolling() {
  if (statusPoller) {
    clearInterval(statusPoller);
    statusPoller = undefined;
  }
}

// --- Computed property to format the time ---
const formattedTime = computed(() => {
  const totalSeconds = elapsedSeconds.value;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
});

function setTool(t: ToolType) {
  emit('update:modelValue', t);
}

// --- Timer control ---
function startTimer() {
  stopTimer();
  elapsedSeconds.value = 0;
  dataframeFailStreak = 0;
  timerInterval = window.setInterval(() => {
    if (props.nodeStatus?.warn_state !== false) {
      elapsedSeconds.value++;
    }

    const healthOk = !!socketService.isConnected.value
      && !!props.nodeStatus?.map_state
      && !!props.nodeStatus?.odom_state;

    if (healthOk) {
      dataframeFailStreak = 0; // reset counter on healthy tick
    } else {
      dataframeFailStreak++;
      console.warn(`[Timer] Dataframe health check failed (streak: ${dataframeFailStreak}/${DATAFRAME_FAIL_THRESHOLD})`);
      if (dataframeFailStreak >= DATAFRAME_FAIL_THRESHOLD) {
        Notify.create({
          type: 'negative',
          message: `Failed can't not load dataframe! (${dataframeFailStreak}s of no data)`
        });
        stopTimer();
        isRecording.value = false;
        showSaveDialog.value = false;
        dataframeFailStreak = 0;
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = undefined;
  }
}

// --- Toggle Recording ---
function toggleRecording() {
  if (recordingState.value == false) {
    if (isRecording.value) {
      // ถ้ากำลังอัด -> เปิดหน้า Save
      showSaveDialog.value = true;
    } else {
      // ยังไม่อัด -> เปิดเช็คสถานะ
      runStatusChecks();
    }
  }
}

// --- Status Check functions (ใช้ polling) ---
function clearStatusTimeouts() {
  statusTimeouts.value.forEach(clearTimeout);
  statusTimeouts.value = [];
}

function runStatusChecks() {
  statusOdometry.value = false;
  statusMapping.value = false;
  statusConnection.value = false;
  allChecksComplete.value =
    statusOdometry.value && statusMapping.value && statusConnection.value;

  showStatusDialog.value = true;
  clearStatusTimeouts();
  startStatusPolling(100);
}

function startActualRecording() {
  if (!allChecksComplete.value) return; // กันกดก่อนครบ
  stopStatusPolling();
  showStatusDialog.value = false;
  isRecording.value = true;
  socketService.sendRecord(1, { mapSite: props.mapSiteName, mapName: props.mapName });
  startTimer();
  emit('toggle-recording');
}

function handleCancelStatusCheck() {
  stopStatusPolling();
  clearStatusTimeouts();
  showStatusDialog.value = false;
  allChecksComplete.value = false;
}

// === New: ตรวจผลบันทึกหลังหยุดอัดแบบหน่วง 1000ms ===
let saveResultTimeout: number | undefined = undefined;

function evaluateSaveResultAfterDelay(delayMs = 10000) {
  // If already waiting for a save result, debounce — do NOT show a premature error
  if (saveResultTimeout) {
    console.warn('[ToolBox] evaluateSaveResultAfterDelay called while already pending — debouncing');
    return;
  }

  saveResultTimeout = window.setTimeout(() => {
    void (async () => {
      saveResultTimeout = undefined;
      const ok = props.nodeStatus?.warn_state === true;

      if (ok) {
        emit('save-recording', saveFileName.value, defaultLocation.value);
        Notify.create({ type: 'positive', message: 'Map saved successfully!' });

        try {
          await updateMapStatus(props.mapSiteName || '', props.mapName || '', 1);
          console.log('[ToolBox] Map status updated to 1');
        } catch (error) {
          console.error('[ToolBox] Failed to update map status:', error);
          Notify.create({ type: 'warning', message: 'Map saved but status update failed' });
        }
      } else {
        Notify.create({ type: 'negative', message: 'Failed to save map — backend did not confirm success.' });
      }

      recordingState.value = false;
      console.log('[ToolBox] Save result ok:', ok);
    })();
  }, delayMs);
}

// --- Save Dialog handlers ---
function handleSaveRecording() {
  // หยุดตัวจับเวลา "ระยะเวลาการอัด"
  stopTimer();

  isRecording.value = false;
  showSaveDialog.value = false;

  // แจ้งไป parent และสั่งให้ฝั่ง robot/ROS save map

  emit('toggle-recording');
  saveFileName.value = `${props.mapSiteName}_${props.mapName}.pgm`;
  socketService.sendRecord(0, { mapSite: props.mapSiteName, mapName: props.mapName });
  recordingState.value = true;

  // หน่วง 1000ms แล้วค่อยตรวจ warn_state: true = success, false = failed
  evaluateSaveResultAfterDelay(10000);
}

function handleCancelSave() {
  showSaveDialog.value = false;
}

function goBack() {
  emit('go-back');
}

/* Hotkeys */
function onKey(e: KeyboardEvent) {
  const tg = e.target as HTMLElement | null;
  if (tg && /input|textarea|select/i.test(tg.tagName)) return;
  if (!props.enableHotkeys) return;

  // Undo / Redo
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); emit('undo'); return; }
    if (e.key === 'y') { e.preventDefault(); emit('redo'); return; }
    // Ctrl+Shift+Z → redo (macOS convention)
    if (e.key === 'Z') { e.preventDefault(); emit('redo'); return; }
  }

  const k = e.key.toLowerCase();

  if (!showAllTools.value) {
    if (k === 'v') setTool('cursor');
    if (k === 'p') setTool('ptp');
    return;
  }

  if (k === 'v') setTool('cursor');
  if (k === 'q') setTool('select');
  if (k === 'p') setTool('ptp');
  if (k === 'm') setTool('mptp');
  // 'a' is reserved for WASD robot movement
  if (k === 'e') setTool('editor');
}

onMounted(() => {
  if (props.enableHotkeys) {
    window.addEventListener('keydown', onKey);
  }
});

onBeforeUnmount(() => {
  if (props.enableHotkeys) {
    window.removeEventListener('keydown', onKey);
  }
  stopTimer();
  stopStatusPolling();
  clearStatusTimeouts();

  if (saveResultTimeout) {
    clearTimeout(saveResultTimeout);
    saveResultTimeout = undefined;
  }
});

/* Roving tabindex */
const btnCursor = ref<HTMLButtonElement | null>(null);
const btnSelect = ref<HTMLButtonElement | null>(null);
const btnPtp = ref<HTMLButtonElement | null>(null);
const btnMptp = ref<HTMLButtonElement | null>(null);
const btnMptpNav = ref<HTMLButtonElement | null>(null);
const btnArea = ref<HTMLButtonElement | null>(null);
const btnEditor = ref<HTMLButtonElement | null>(null);
const btnEditorErase = ref<HTMLButtonElement | null>(null);
const btnEditorBrushErase = ref<HTMLButtonElement | null>(null);

const order: Record<ToolType, () => HTMLButtonElement | null> = {
  cursor: () => btnCursor.value,
  select: () => btnSelect.value,
  ptp: () => btnPtp.value,
  mptp: () => btnMptp.value,
  mptp_nav: () => btnMptpNav.value,
  area: () => btnArea.value,
  editor: () => btnEditor.value,
  editor_erase: () => btnEditorErase.value,
  editor_brush_erase: () => btnEditorBrushErase.value,
};

function onRovingKeys(e: KeyboardEvent) {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'];
  if (!keys.includes(e.key)) return;

  e.preventDefault();

  const seq: ToolType[] = !showAllTools.value
    ? ['cursor', 'ptp']
    : ['cursor', 'select', 'ptp', 'mptp', 'mptp_nav', 'area', 'editor', 'editor_erase', 'editor_brush_erase'];

  const i = seq.indexOf(props.modelValue);
  if (i === -1) {
    setTool(seq[0]);
    order[seq[0]]()?.focus();
    return;
  }

  let next = i;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % seq.length;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + seq.length) % seq.length;

  const nextTool = seq[next];
  setTool(nextTool);
  const el = order[nextTool]();
  requestAnimationFrame(() => el?.focus());
}
</script>


<style scoped>
/* --- Dark Theme --- */

/* Tool separator between undo/redo and tool buttons */
.tool-sep {
  width: 1px;
  height: 24px;
  background: rgba(255,255,255,0.15);
  margin: 0 4px;
  flex-shrink: 0;
}

/* Header */
.recording-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: rgba(42, 42, 46, 0.75);
  /* backdrop-filter: blur(10px); */
  /* -webkit-backdrop-filter: blur(10px); */
  border-bottom: 1px solid #4a4a4f;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  z-index: 100;
}

.recording-header.is-rec {
  background: rgba(25, 25, 25, 0.75);
}

.recording-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.site-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.site-title {
  font-size: 20px;
  font-weight: 700;
  color: #f5f5f5;
  line-height: 1.2;
}

.site-subtitle {
  font-size: 14px;
  font-weight: 500;
  color: #ff8800;
  line-height: 1.2;
}

.recording-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}


/* Right controls */
.recording-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rec-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  padding: 0 16px;
  background: #353535;
  border: 1px solid #5c5c62;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  cursor: pointer;
  transition: all .2s ease;
  white-space: nowrap;
  max-width: 90px;
}

.rec-btn:hover {
  background: #4a4a4f;
  border-color: #6a6a70;
  transform: translateY(-1px);
}

.rec-btn:active {
  transform: translateY(0);
}

.rec-btn.modify,
.rec-btn.import {
  min-width: 30px;
}

.rec-btn .rec-icon {
  width: 18px;
  height: 18px;
}

/* Record button */
.rec-btn.record-toggle {
  background: #353535;
  border-color: #5c5c62;
  color: #e0e0e0;
  min-width: 80px;
  font-family: monospace;
  width: 110px;
  justify-content: center;
}

.rec-btn.record-toggle.active {
  background: #5a2a2a;
  border-color: #a94a4a;
  color: #f4a2a2;
}

.rec-btn.record-toggle.active:hover {
  background: #6e3a3a;
}

.rec-dot {
  width: 12px;
  height: 12px;
  background: #a0a0a5;
  border-radius: 50%;
  transition: all .2s ease;
}

.rec-btn.record-toggle.active .rec-dot {
  background: #ef4444;
}

.rec-dot.pulse {
  animation: pulse-red 1.5s ease-in-out infinite;
}

@keyframes pulse-red {

  0%,
  100% {
    opacity: 1;
    transform: scale(1)
  }

  50% {
    opacity: .7;
    transform: scale(1.1)
  }
}

/* Go back */
.rec-btn.go-back {
  background: #10b981;
  border-color: #059669;
  color: #fff;
  font-weight: 700;
  min-width: 50px;
  box-shadow: 0 2px 8px rgba(16, 185, 129, .3);
}

.rec-btn.go-back:hover {
  background: #059669;
  border-color: #047857;
  box-shadow: 0 4px 12px rgba(16, 185, 129, .4);
}

/* Inspect button states */
.rec-btn.inspect-toggle {
  background: #353535;
  border-color: #5c5c62;
  color: #e0e0e0;
}

.rec-btn.inspect-toggle.active {
  background: #3b3a5f;
  border-color: #5a5d9a;
  color: #c7d2fe;
}

.rec-btn.inspect-toggle.active:hover {
  background: #4e4c7a;
}

/* === Tools: forced horizontal row === */
.tool-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}

/* Tool chip style (match right buttons) */
.tool-btn-style {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 14px;
  background: #353535;
  border: 1px solid #5c5c62;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  cursor: pointer;
  transition: all .2s ease;
  white-space: nowrap;
}

.tool-btn-style:hover {
  background: #4a4a4f;
  border-color: #6a6a70;
  transform: translateY(-1px);
}

/* Active tool color */
.tool-btn-style.is-active {
  background: #1c4a36;
  border-color: #2c855e;
  color: #6ee7b7;
}

.tool-btn-style .rec-icon {
  width: 18px;
  height: 18px;
}

/* Responsive */
@media (max-width: 768px) {
  .recording-header {
    height: auto;
    min-height: 70px;
    flex-direction: column;
    padding: 12px 16px;
    gap: 12px;
  }

  .recording-center {
    position: static;
    left: auto;
    top: auto;
    transform: none;
    width: 100%;
  }

  .tool-buttons {
    flex-wrap: wrap;
    justify-content: center;
  }

  .recording-left,
  .recording-right {
    width: 100%;
  }

  .recording-right {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .rec-btn {
    font-size: 8px;
    height: 40px;
    padding: 0 12px;
  }

  .rec-btn span {
    display: none;
  }

  .rec-btn.record-toggle span {
    display: inline;
  }

  .rec-btn.go-back span {
    display: inline;
  }
}


/* --- Dark Theme Dialog Styles --- */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.dialog-box {
  background: #2d2d2d;
  border-radius: 12px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 400px;
  padding: 24px;
}

.dialog-box h2 {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 600;
  color: #f5f5f5;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #c0c0c0;
}

.form-group input {
  font-size: 14px;
  padding: 10px 12px;
  border: 1px solid #555;
  border-radius: 8px;
  transition: border-color .2s, box-shadow .2s;
  background: #3a3a3a;
  color: #f0f0f0;
}

.form-group input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.form-group input:read-only {
  background: #2a2a2a;
  color: #888;
  border-color: #444;
}

.dialog-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.dialog-btn {
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s ease;
}

.dialog-btn.btn-cancel {
  background: #4a4a4f;
  color: #e0e0e0;
  border: 1px solid #6a6a70;
}

.dialog-btn.btn-cancel:hover {
  background: #5c5c62;
}

.dialog-btn.btn-save {
  background: #10b981;
  color: #fff;
  min-width: 120px;
}

.dialog-btn.btn-save:hover {
  background: #059669;
}

/* --- Disabled state --- */
.dialog-btn:disabled {
  background: #3a3a3a;
  color: #777;
  cursor: not-allowed;
  transform: none;
  border: 1px solid #555;
}

.dialog-btn:disabled:hover {
  background: #3a3a3a;
  color: #777;
  border: 1px solid #555;
}


/* --- Status Dialog Styles --- */
.status-dialog-box {
  background: #2d2d2d;
  border-radius: 12px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 320px;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.status-dialog-box h2 {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 600;
  color: #f5f5f5;
  text-align: center;
}

.status-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  font-size: 16px;
  color: #e0e0e0;
}

.status-icon {
  width: 20px;
  height: 20px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-loader {
  width: 20px;
  height: 20px;
  color: #888;
  animation: spin 1.5s linear infinite;
}

.icon-check {
  width: 20px;
  height: 20px;
  color: #10b981;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
