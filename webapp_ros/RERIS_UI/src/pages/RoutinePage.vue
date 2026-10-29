<template>
  <q-page class="routine-page">
    <div class="ipad-layout" :class="{ 'panel-hidden': !isPanelVisible }">
      
      <!-- ── SIDE PANEL (Sidebar + Builder combined for iPad) ── -->
      <div class="ipad-panel">
        
        <!-- MODE 1: SEQUENCE LIST -->
        <template v-if="panelMode === 'list'">
          <div class="panel-header">
            <span class="panel-title">SEQUENCES</span>
            <q-btn flat round dense icon="add" size="sm" color="green-4" @click="createNewProfile" :disable="!isAdmin" />
          </div>
          
          <div class="panel-content scroll-area">
            <div v-if="!savedRoutines.length" class="empty-text q-pa-md">No sequences found.</div>
            <div 
              v-for="r in savedRoutines" 
              :key="r.routineId" 
              class="nav-item"
              :class="{ 'active': currentRoutineId === r.routineId }"
              @click="loadAndOpenBuilder(r)"
            >
              <q-icon name="folder" size="18px" class="q-mr-sm" :color="currentRoutineId === r.routineId ? 'green-4' : 'grey-7'" />
              <span class="text-truncate">{{ r.name || r.routineId }}</span>
              <q-btn v-if="isAdmin" flat round dense icon="delete" size="xs" color="grey-9" class="q-ml-auto" @click.stop="deleteRoutine(r.routineId)" />
            </div>
          </div>
        </template>

        <!-- MODE 2: ACTIVE BUILDER -->
        <template v-else-if="panelMode === 'builder' && currentRoutineId">
          <div class="panel-header builder-header-bg">
            <q-btn flat round dense icon="arrow_back" size="sm" @click="panelMode = 'list'" />
            <div class="header-info q-ml-sm" @click="isAdmin ? openSaveDialog() : null">
              <div class="text-overline text-green-4" style="line-height:1">ACTIVE</div>
              <div class="text-weight-bold text-white text-truncate" style="font-size: 14px">{{ currentRoutineName }}</div>
            </div>
            <q-space />
            <q-btn v-if="isAdmin" flat round dense icon="save" color="blue-4" size="sm" @click="commitSaveRoutine" />
          </div>

          <!-- Quick Settings -->
          <div class="builder-quick-tools">
            <q-toggle v-model="loopMode" label="Loop" dense dark color="orange-5" class="tool-toggle" />
            <q-toggle v-model="startupMode" label="Start" dense dark color="blue-5" class="tool-toggle" />
            <q-btn flat dense icon="settings_input_antenna" size="xs" color="grey-6" class="q-ml-auto">
              <q-menu dark class="q-pa-md" style="width: 240px">
                <q-input v-model="triggerTopic" label="Trigger Topic" dense dark outlined stack-label class="q-mb-sm" />
                <q-input v-model="triggerMapRaw" label="Trigger Map (JSON)" dense dark outlined type="textarea" stack-label rows="3" />
              </q-menu>
            </q-btn>
          </div>

          <!-- Markers List -->
          <div class="panel-content scroll-area">
            <div class="section-label-row">
              <span>WAYPOINTS</span>
              <q-btn flat round dense icon="add_location" size="xs" color="green-4" @click="openMarkerPicker" />
            </div>

            <div v-if="!routineItems.length" class="empty-placeholder q-ma-md">
              Tap + to add markers
            </div>
            
            <div class="marker-container q-px-sm">
              <div
                v-for="(item, idx) in routineItems"
                :key="item.id"
                class="marker-row"
                :class="{ 'active': isRunning && activeIdx === idx }"
              >
                <div class="m-nav">
                  <q-btn flat dense icon="expand_less" size="xs" @click="moveItem(idx, -1)" :disable="idx === 0" />
                  <div class="m-num">{{ idx + 1 }}</div>
                  <q-btn flat dense icon="expand_more" size="xs" @click="moveItem(idx, 1)" :disable="idx === routineItems.length - 1" />
                </div>
                
                <div class="m-core">
                  <div class="m-title">{{ item.name }}</div>
                  <div class="m-meta">{{ item.delayMs }}ms • ±{{ item.circleError }}m • {{ item.pubTopic || 'No signal' }}</div>
                </div>

                <div class="m-ops">
                  <q-btn flat round dense icon="sensors" size="xs" color="blue-4" @click="openMarkerSettings(idx)" />
                  <q-btn flat round dense icon="close" size="xs" color="red-4" @click="removeItem(idx)" />
                </div>
              </div>
            </div>
          </div>

          <!-- Execution Foot -->
          <div class="panel-footer">
            <div class="footer-row">
              <div class="live-status-inline" v-if="isRunning">
                POINT {{ activeIdx + 1 }} / {{ routineItems.length }}
              </div>
              <div v-else class="live-status-inline" style="color:#444">READY</div>
              <q-btn
                v-if="!isRunning"
                flat round
                icon="play_arrow"
                color="green-5"
                size="md"
                :disable="routineItems.length === 0 || !isConnected"
                @click="runRoutine"
              >
                <q-tooltip>Start Routine</q-tooltip>
              </q-btn>
              <q-btn
                v-else
                flat round
                icon="stop"
                color="red-5"
                size="md"
                @click="stopRoutine"
              >
                <q-tooltip>Stop</q-tooltip>
              </q-btn>
            </div>
          </div>
        </template>
      </div>

      <!-- ── VIEWPORT ── -->
      <div class="ipad-viewport">
        <!-- Floating Panel Toggle -->
        <div class="panel-toggle-wrap">
          <q-btn 
            unelevated 
            round 
            :icon="isPanelVisible ? 'chevron_left' : 'menu'" 
            color="black" 
            text-color="white"
            class="floating-toggle"
            @click="isPanelVisible = !isPanelVisible"
          />
        </div>

        <MapAsset
          v-if="currentMap"
          class="full-map"
          :mapName="currentMap.name"
          :mapSite="currentMap.site"
          mode="dashboard"
          :recording="false"
        />
        <div v-else class="viewport-placeholder">
          <q-icon name="map" size="64px" color="grey-10" />
          <div class="q-mt-md">Map not loaded</div>
        </div>
      </div>

    </div>

    <!-- ===== DIALOGS ===== -->
    <q-dialog v-model="markerSettingsOpen">
      <q-card dark style="width: 320px; border-radius: 12px;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1">Marker Signaling</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section class="q-gutter-y-sm">
          <div class="row q-col-gutter-sm">
            <q-input v-model.number="markerSettings.circleError" label="Dist Error (m)" type="number" step="0.01" dense dark outlined stack-label class="col" />
            <q-input v-model.number="markerSettings.yawError" label="Yaw Error (°)" type="number" step="0.5" dense dark outlined stack-label class="col" />
          </div>
          <q-input v-model="markerSettings.pubTopic" label="ROS Topic" dense dark outlined stack-label placeholder="/topic" />
          <div class="row q-col-gutter-sm">
            <q-input v-model.number="markerSettings.valIn" label="In" type="number" dense dark outlined class="col" />
            <q-input v-model.number="markerSettings.valPassed" label="Pass" type="number" dense dark outlined class="col" />
            <q-input v-model.number="markerSettings.valFailed" label="Fail" type="number" dense dark outlined class="col" />
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Apply" color="green-4" @click="applyMarkerSettings" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="pickerOpen">
      <q-card dark style="width: 450px; max-width: 90vw; border-radius: 16px;">
        <q-card-section class="row items-center">
          <div class="text-h6">Select Waypoint</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-input v-model="pickerSearch" dense dark outlined placeholder="Search markers..." class="q-mb-sm">
            <template #prepend><q-icon name="search" /></template>
          </q-input>
          <div class="picker-scroll">
            <template v-for="section in filteredMarkers" :key="section.label">
              <div class="picker-section-label">{{ section.label }}</div>
              <div v-for="marker in section.markers" :key="marker.marker_name" class="picker-row" @click="addMarkerToRoutine(section.label, marker); pickerOpen = false">
                <div class="picker-dot" :style="{ background: marker.marker_color || '#1ecf61' }" />
                <div class="picker-name">{{ marker.marker_name }}</div>
                <q-icon name="add" size="16px" color="green-4" />
              </div>
            </template>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="saveDialogOpen">
      <q-card dark style="min-width: 300px;">
        <q-card-section>
          <div class="text-h6">Sequence Name</div>
          <q-input v-model="routineNameInput" outlined dark dense autofocus @keyup.enter="commitSaveRoutine" class="q-mt-md" />
        </q-card-section>
        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Cancel" color="grey-6" v-close-popup />
          <q-btn unelevated label="Apply" color="green-6" @click="commitSaveRoutine" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { server_api_config } from 'src/configs/server'
import { socketService } from 'src/services/socketService'
import type { IRoutine, IRoutineWaypoint } from 'src/interfaces/robot_interfaces'
import MapAsset from 'components/assets/map/MapAsset.vue'

// ── Types ──────────────────────────────────────────────────────────────────────
interface MarkerPos { x: number; y: number; yaw: number }
interface ExportedMarker {
  marker_name: string; marker_type: string
  marker_position: MarkerPos; marker_color?: string
}
interface ExportedSection {
  section_lable: string; section_color: string
  section_position: { x: number; y: number; idx: number }[]
  section_marker: ExportedMarker[]; type?: string
}
interface MapData { map_section: ExportedSection[] }

interface RoutineItem {
  id: string; name: string; sectionName: string
  x: number; y: number; yaw: number; color: string; delayMs: number
  circleError: number; yawError: number
  pubTopic: string; valIn: number; valPassed: number; valFailed: number
}

// ── UI State ───────────────────────────────────────────────────────────────────
const isPanelVisible = ref(true)
const panelMode      = ref<'list' | 'builder'>('list')

// ── Logic State ────────────────────────────────────────────────────────────────
const isConnected    = ref(false)
const isRunning      = ref(false)
const routineStartGrace = ref(false)
const loopMode       = ref(false)
const startupMode    = ref(false)
const triggerTopic   = ref('')
const triggerMapRaw  = ref('')
const loopCount      = ref(0)
const activeIdx      = ref(-1)
const routineItems   = ref<RoutineItem[]>([])
const currentRoutineId = ref<string | null>(null)
const currentRoutineName = ref('')

const pickerOpen     = ref(false)
const pickerSearch   = ref('')
const loadingMarkers = ref(false)
const allSections    = ref<ExportedSection[]>([])

const isAdmin            = ref(false)
const savedRoutines      = ref<IRoutine[]>([])
const saveDialogOpen     = ref(false)
const routineNameInput   = ref('')
const isCreatingNew      = ref(false)

const markerSettingsOpen = ref(false)
const editingMarkerIdx   = ref(-1)
const markerSettings     = ref({ pubTopic: '', valIn: 1, valPassed: 2, valFailed: 0, circleError: 0.10, yawError: 5.0 })

const currentMap = ref<{ site: string; name: string } | null>(null)

// ── Helpers ────────────────────────────────────────────────────────────────────
function moveItem(idx: number, dir: number) {
  if (!isAdmin.value || isRunning.value) return
  const newIdx = idx + dir
  if (newIdx < 0 || newIdx >= routineItems.value.length) return
  const items = [...routineItems.value]
  const temp = items[idx]
  items[idx] = items[newIdx]
  items[newIdx] = temp
  routineItems.value = items
}

function openMarkerSettings(idx: number) {
  editingMarkerIdx.value = idx
  const item = routineItems.value[idx]
  markerSettings.value = {
    pubTopic: item.pubTopic || '',
    valIn: item.valIn ?? 1,
    valPassed: item.valPassed ?? 2,
    valFailed: item.valFailed ?? 0,
    circleError: item.circleError ?? 0.10,
    yawError: item.yawError ?? 5.0
  }
  markerSettingsOpen.value = true
}

function applyMarkerSettings() {
  if (editingMarkerIdx.value === -1) return
  const item = routineItems.value[editingMarkerIdx.value]
  item.pubTopic = markerSettings.value.pubTopic
  item.valIn = markerSettings.value.valIn
  item.valPassed = markerSettings.value.valPassed
  item.valFailed = markerSettings.value.valFailed
  item.circleError = markerSettings.value.circleError
  item.yawError = markerSettings.value.yawError
  markerSettingsOpen.value = false
}

function openSaveDialog() {
  isCreatingNew.value = false
  routineNameInput.value = currentRoutineName.value
  saveDialogOpen.value = true
}

// ── Routine CRUD ───────────────────────────────────────────────────────────────
async function refreshRoutines() {
  const token = localStorage.getItem('authToken')
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  try {
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/routine/list`, { headers })
    if (res.ok) {
      savedRoutines.value = await res.json()
    }
  } catch (e) { console.warn('[Routine] Fetch list failed:', e) }
}

function createNewProfile() {
  isCreatingNew.value = true
  routineNameInput.value = 'New Sequence'
  saveDialogOpen.value = true
}

function loadAndOpenBuilder(r: IRoutine) {
  loadRoutine(r)
  panelMode.value = 'builder'
}

function loadRoutine(r: IRoutine) {
  currentRoutineId.value = r.routineId || null
  currentRoutineName.value = r.name || r.routineId || ''
  routineItems.value = (r.waypoints || []).map((wp: IRoutineWaypoint, i: number) => {
    const siny_cosp = 2 * (wp.qw * wp.qz)
    const rosy_cosp = 1 - 2 * (wp.qz * wp.qz)
    const yaw = Math.atan2(siny_cosp, rosy_cosp)
    return {
      id: `${Date.now()}_${i}`,
      name: wp.point_name || `Point ${i+1}`,
      sectionName: 'Marker',
      x: wp.x, y: wp.y, yaw: yaw,
      color: '#1ecf61',
      delayMs: wp.delay_ms || 1000,
      circleError: wp.circle_error ?? 0.10,
      yawError: wp.yaw_error ?? 5.0,
      pubTopic: wp.pub_topic || '',
      valIn: wp.val_in ?? 1,
      valPassed: wp.val_passed ?? 2,
      valFailed: wp.val_failed ?? 0
    }
  })
  loopMode.value = (r.loop !== undefined && r.loop > 1)
  startupMode.value = !!r.startup
  triggerTopic.value = r.trigger_topic || ''
  triggerMapRaw.value = JSON.stringify(r.trigger_map || {}, null, 2)
}

async function commitSaveRoutine() {
  if (!isAdmin.value) return
  const name = routineNameInput.value.trim() || 'Untitled'
  
  if (isCreatingNew.value) {
    currentRoutineId.value = `rtn_${Date.now()}`
    routineItems.value = []
    loopMode.value = false
    startupMode.value = false
    triggerTopic.value = ''
    triggerMapRaw.value = '{}'
    panelMode.value = 'builder'
  }

  if (!currentRoutineId.value) return
  currentRoutineName.value = name
  
  let tMap = {}
  try { tMap = JSON.parse(triggerMapRaw.value) } catch { tMap = {} }

  const routineData = {
    routineId: currentRoutineId.value,
    name: name,
    loop: loopMode.value ? 9999 : 1,
    timeout_s: 300.0,
    startup: startupMode.value,
    trigger_topic: triggerTopic.value,
    trigger_map: tMap,
    waypoints: routineItems.value.map(item => ({
      point_name: item.name,
      x: item.x, y: item.y, z: 0,
      qx: 0, qy: 0, qz: Math.sin(item.yaw/2), qw: Math.cos(item.yaw/2),
      circle_error: item.circleError ?? 0.10,
      yaw_error: item.yawError ?? 5.0,
      delay_ms: item.delayMs,
      pub_topic: item.pubTopic,
      val_in: item.valIn,
      val_passed: item.valPassed,
      val_failed: item.valFailed,
      point_behavior: 'delay'
    }))
  }

  const token = localStorage.getItem('authToken')
  try {
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/routine/save`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(routineData)
    })
    if (res.ok) {
      await refreshRoutines()
    }
  } catch (e) { console.warn('[Routine] Save failed:', e) }

  saveDialogOpen.value = false
  isCreatingNew.value = false
}

async function deleteRoutine(id: string) {
  if (confirm("Delete sequence?")) {
    const token = localStorage.getItem('authToken')
    try {
      const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/routine/delete?routineId=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        await refreshRoutines()
        if (currentRoutineId.value === id) {
          currentRoutineId.value = null
          routineItems.value = []
          panelMode.value = 'list'
        }
      }
    } catch (e) { console.warn('[Routine] Delete failed:', e) }
  }
}

// ── Map/Marker Loading ──
async function loadMap() {
  const token = localStorage.getItem('authToken')
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  try {
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/auth/profile`, { method: 'POST', headers })
    if (!res.ok) return
    const data = await res.json()
    isAdmin.value = data.role === 'admin'
    const site = data.SelectedMapSite || data.selectedMapSite
    const name = data.SelectedMapName || data.selectedMapName
    if (site && name) {
      currentMap.value = { site, name }
      await loadMarkers(site, name)
    }
  } catch (e) { console.warn(e) }
}

async function loadMarkers(site: string, name: string) {
  loadingMarkers.value = true
  try {
    const token = localStorage.getItem('authToken')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/map/data?site=${encodeURIComponent(site)}&name=${encodeURIComponent(name)}`, { headers })
    if (!res.ok) return
    const result = await res.json()
    if (result.mapData) {
      const parsed: MapData = JSON.parse(result.mapData)
      allSections.value = (parsed.map_section ?? []).filter(s => s.type !== 'restrict')
    }
  } catch (e) { console.warn(e) } finally { loadingMarkers.value = false }
}

const filteredMarkers = computed(() => {
  const q = pickerSearch.value.trim().toLowerCase()
  return allSections.value.map(s => ({
    label: s.section_lable,
    markers: (s.section_marker || []).filter(m => !q || m.marker_name.toLowerCase().includes(q))
  })).filter(s => s.markers.length > 0)
})

function openMarkerPicker() { pickerSearch.value = ''; pickerOpen.value = true }
function addMarkerToRoutine(sectionName: string, marker: ExportedMarker) {
  if (!isAdmin.value) return;
  routineItems.value.push({
    id: `${Date.now()}_${Math.random()}`,
    name: marker.marker_name,
    sectionName,
    x: marker.marker_position.x, y: marker.marker_position.y, yaw: marker.marker_position.yaw,
    color: marker.marker_color || '#1ecf61',
    delayMs: 1000, circleError: 0.10, yawError: 5.0,
    pubTopic: '', valIn: 1, valPassed: 2, valFailed: 0
  })
}
function removeItem(idx: number) { if (!isAdmin.value) return; routineItems.value.splice(idx, 1) }

// ── Execution ──
async function runRoutine() {
  if (!currentRoutineId.value || !routineItems.value.length) return
  await commitSaveRoutine()
  isRunning.value = true
  routineStartGrace.value = true
  activeIdx.value = 0
  loopCount.value = 0
  socketService.sendRoutineStart(currentRoutineId.value, "")
  setTimeout(() => { routineStartGrace.value = false }, 2000)
}
function stopRoutine() { socketService.sendCancelMultiGoal(); isRunning.value = false; activeIdx.value = -1 }

let unsubMsg: (() => void) | null = null
let unsubConn: (() => void) | null = null

onMounted(async () => {
  unsubConn = socketService.onConnectionChange((c: boolean) => { isConnected.value = c })
  unsubMsg = socketService.onMessage((msg) => {
    if (msg.nodesStatus) {
      const idx = msg.nodesStatus.current_goal_idx
      if (idx >= 0 && isRunning.value) {
        routineStartGrace.value = false 
        activeIdx.value = idx % routineItems.value.length
        loopCount.value = Math.floor(idx / routineItems.value.length)
      } else if (idx === -1 && isRunning.value && !loopMode.value && !routineStartGrace.value) {
        isRunning.value = false
        activeIdx.value = -1
      }
    }
  })
  await loadMap()
  await refreshRoutines()
})

onUnmounted(() => { unsubMsg?.(); unsubConn?.() })
</script>

<style scoped>
.routine-page { background: #000; padding: 0 !important; overflow: hidden; }

/* ── LAYOUT ── */
.ipad-layout {
  position: fixed;
  top: 50px; /* matches .toolbar-modern height in MainLayout */
  left: 68px; /* matches mini-drawer width */
  right: 0;
  bottom: 0;
  display: flex;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.ipad-panel {
  width: 320px;
  background: #111;
  border-right: 1px solid #222;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  transition: transform 0.3s ease;
  z-index: 10;
}

.ipad-layout.panel-hidden .ipad-panel {
  transform: translateX(-320px);
  margin-right: -320px;
}

.ipad-viewport {
  flex: 1;
  position: relative;
  background: #000;
  min-width: 0;
}

/* ── PANEL COMPONENTS ── */
.panel-header {
  padding: 18px 16px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #222;
}
.panel-title { font-size: 11px; font-weight: 800; color: #555; letter-spacing: 1.5px; }

.builder-header-bg { background: #1a1a1a; }

.scroll-area { flex: 1; min-height: 0; overflow-y: auto; }

.nav-item {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  color: #999;
  font-size: 14px;
  border-bottom: 1px solid #181818;
  cursor: pointer;
}
.nav-item:active { background: #222; }
.nav-item.active { background: #181818; color: #1ecf61; border-left: 3px solid #1ecf61; }

.builder-quick-tools {
  display: flex; padding: 10px 12px; gap: 8px; align-items: center; background: #151515; border-bottom: 1px solid #222;
}
.tool-toggle { font-size: 10px; color: #777; }

.section-label-row {
  padding: 16px 16px 8px 16px;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 10px; font-weight: 800; color: #444; letter-spacing: 1px;
}

.marker-row {
  background: #1a1a1a;
  border-radius: 10px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  padding: 8px;
  gap: 8px;
  border: 1px solid #252525;
}
.marker-row.active { border-color: #1ecf61; background: #152018; }

.m-nav { display: flex; flex-direction: column; align-items: center; line-height: 1; min-width: 32px; }
.m-num { font-size: 10px; font-weight: 900; color: #333; margin: -2px 0; }

.m-core { flex: 1; min-width: 0; }
.m-title { font-size: 13px; font-weight: 700; color: #eee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-meta { font-size: 10px; color: #555; }

.m-ops { display: flex; gap: 4px; }

.panel-footer { padding: 8px 12px; background: #111; border-top: 1px solid #222; }
.footer-row { display: flex; align-items: center; justify-content: space-between; }
.live-status-inline { font-size: 11px; font-weight: 800; color: #1ecf61; letter-spacing: 1px; }

/* ── VIEWPORT UTILS ── */
.panel-toggle-wrap {
  position: absolute; top: 16px; left: 16px; z-index: 20;
}
.floating-toggle {
  width: 44px; height: 44px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 1px solid #333;
}

.full-map { width: 100%; height: 100%; }
.viewport-placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #333; font-weight: 800; font-size: 12px; text-transform: uppercase; }

/* ── Common ── */
.text-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker-section-label { font-size: 11px; font-weight: 800; color: #555; padding: 12px 8px 4px 8px; border-bottom: 1px solid #222; margin-bottom: 4px; }
.picker-row { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 8px; cursor: pointer; }
.picker-row:active { background: #222; }
.picker-dot { width: 10px; height: 10px; border-radius: 50%; }

::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-thumb { background: #333; }
</style>
