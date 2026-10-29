<template>
  <q-page class="navigator-page">
  <div class="navigator-layout" :class="{ 'panel-hidden': !isPanelVisible }">

    <!-- ===== LEFT PANEL ===== -->
    <div class="nav-left">

      <!-- Header -->
      <div class="nav-header">
        <div class="nav-header-top">
          <q-icon name="explore" size="20px" color="green-5" />
          <span class="nav-title">Navigator</span>
        </div>

        <!-- Current map badge — click to re-open map picker -->
        <div v-if="currentMap" class="current-map-badge" @click="openMapPicker">
          <q-icon name="map" size="12px" />
          <span>{{ currentMap.site }} / {{ currentMap.name }}</span>
          <q-icon name="edit" size="11px" class="badge-edit-icon" />
        </div>
        <div v-else class="no-map-hint">No map selected</div>
      </div>

      <!-- Search box -->
      <div class="nav-search">
        <q-input
          v-model="searchText"
          dense outlined dark
          placeholder="Search sections..."
          class="search-input"
          clearable
        >
          <template #prepend>
            <q-icon name="search" size="16px" color="grey-5" />
          </template>
        </q-input>
      </div>

      <!-- Section list -->
      <div class="section-list" v-if="filteredSections.length">
        <div
          v-for="section in filteredSections"
          :key="section.section_lable"
          class="section-item"
          :class="{ 'section-item--highlighted': hoveredSection === section.section_lable }"
          @mouseenter="hoveredSection = section.section_lable"
          @mouseleave="hoveredSection = null"
        >
          <div class="section-info">
            <span class="section-dot" :style="{ background: section.section_color || '#1ecf61' }" />
            <div class="section-text">
              <span class="section-label">{{ section.section_lable }}</span>
              <span class="section-meta">
                {{ section.section_marker.length }} point{{ section.section_marker.length !== 1 ? 's' : '' }}
              </span>
            </div>
          </div>
          <q-btn
            unelevated dense label="GO" color="green-8" class="go-btn"
            :disable="section.section_marker.length === 0"
            @click="openGoDialog(section)"
          >
            <q-tooltip v-if="section.section_marker.length === 0">No points in this section</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- Empty states -->
      <div v-else-if="loadingProfile || loading" class="empty-state">
        <q-spinner color="green-5" size="32px" />
        <p>Loading...</p>
      </div>
      <div v-else-if="!currentMap" class="empty-state">
        <q-icon name="map" size="44px" color="grey-7" />
        <p>No map selected</p>
        <q-btn unelevated label="Select a Map" color="green-8" @click="openMapPicker" />
      </div>
      <div v-else-if="searchText && !filteredSections.length" class="empty-state">
        <q-icon name="search_off" size="36px" color="grey-7" />
        <p>No sections match "{{ searchText }}"</p>
      </div>
      <div v-else class="empty-state">
        <q-icon name="grid_view" size="40px" color="grey-7" />
        <p>No navigation sections found.<br>Add sections in the map editor.</p>
      </div>

    </div>

    <!-- ===== RIGHT PANEL — MAP VIEW ===== -->
    <div class="nav-map">
      <!-- Floating toolbar: panel toggle + manual control -->
      <div class="panel-toggle-wrap">
        <q-btn
          unelevated round
          :icon="isPanelVisible ? 'chevron_left' : 'menu'"
          color="black" text-color="white"
          class="floating-toggle"
          @click="isPanelVisible = !isPanelVisible"
        />
        <q-btn
          v-if="isConnected"
          unelevated round
          icon="gamepad"
          :color="showJoystick ? 'green-8' : 'black'"
          text-color="white"
          class="floating-toggle"
          @click="toggleJoystick"
        >
          <q-tooltip>Manual Control</q-tooltip>
        </q-btn>
      </div>

      <!-- Floating Joystick Overlay -->
      <transition name="joystick-slide">
        <div v-if="showJoystick && isConnected" class="joystick-overlay">
          <JoystickAsset :size="240" @updateVelocity="handleVelocity" />
        </div>
      </transition>
      <MapAsset
        v-if="currentMap"
        :key="`${currentMap.site}/${currentMap.name}`"
        class="embedded-map-asset"
        :mapName="currentMap.name"
        :mapSite="currentMap.site"
        mode="dashboard"
        :recording="false"
      />

      <div v-if="!currentMap && !loadingProfile" class="map-placeholder">
        <q-icon name="map" size="64px" color="grey-8" />
        <p class="map-placeholder-text">Select a map to begin</p>
        <q-btn unelevated label="Select Map" color="green-8" @click="openMapPicker" />
      </div>
      <div v-else-if="loading || loadingProfile" class="map-placeholder">
        <q-spinner color="green-5" size="48px" />
      </div>

      <!-- ── Navigation HUD (Google Maps style top-center) ── -->
      <transition name="hud-slide">
        <div v-if="navigatingTo" class="nav-hud">
          <div class="hud-inner">
            <!-- Destination label -->
            <div class="hud-dest">
              <q-icon name="navigation" size="14px" color="green-4" />
              <span class="hud-dest-name">{{ navigatingTo }}</span>
            </div>

            <!-- Stats row -->
            <div class="hud-stats">
              <div class="hud-stat">
                <span class="hud-stat-val">{{ navHud.distRemaining }}</span>
                <span class="hud-stat-lbl">remaining</span>
              </div>
              <div class="hud-divider" />
              <div class="hud-stat">
                <span class="hud-stat-val">{{ navHud.distTotal }}</span>
                <span class="hud-stat-lbl">total</span>
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

            <!-- Cancel button -->
            <q-btn
              flat dense no-caps
              label="Cancel"
              icon="close"
              color="red-4"
              class="hud-cancel-btn"
              @click="cancelNavigation"
            />
          </div>
        </div>
      </transition>

      <!-- Map info bar -->
      <div v-if="currentMap" class="map-info-bar">
        <span>{{ currentMap.site }} / {{ currentMap.name }}</span>
        <span class="map-info-sep">•</span>
        <span>{{ navSections.filter(s => s.type !== 'restrict').length }} section{{ navSections.filter(s=>s.type!=='restrict').length !== 1 ? 's' : '' }}</span>
        <span class="map-info-sep">•</span>
        <span :class="isConnected ? 'text-green-5' : 'text-red-4'">
          {{ isConnected ? 'Live' : 'Offline' }}
        </span>
      </div>
      
      <!-- Robot Status Bar -->
      <div v-if="isConnected && robotStatusInfo.currentGoalIdx >= 0" 
           class="dashboard-status-bar" 
           :class="{'status-waiting': robotStatusInfo.waitingForSignal, 'status-executing': !robotStatusInfo.waitingForSignal}">
        <q-icon :name="robotStatusInfo.waitingForSignal ? 'hourglass_empty' : 'settings_overscan'" size="16px" />
        <span>{{ robotStatusText }}</span>
      </div>
    </div>

    <!-- ===== MAP SELECTION DIALOG ===== -->
    <q-dialog v-model="mapPickerOpen" persistent>
      <q-card class="picker-card" dark>

        <q-card-section class="picker-header">
          <div class="picker-title-row">
            <q-icon name="map" size="20px" color="green-5" />
            <span class="picker-title">Select a Map</span>
          </div>
          <!-- Always allow closing the map picker so users don't get stuck -->
          <q-btn flat round dense icon="close" color="grey-5"
            @click="mapPickerOpen = false" />
        </q-card-section>

        <q-separator dark />

        <!-- Search inside picker -->
        <div class="picker-search">
          <q-input v-model="pickerSearch" dense outlined dark placeholder="Search maps..." clearable>
            <template #prepend><q-icon name="search" size="15px" color="grey-5" /></template>
          </q-input>
        </div>

        <q-card-section class="picker-body">
          <div v-if="loadingMaps" class="picker-loading">
            <q-spinner color="green-5" size="36px" />
            <p>Loading maps...</p>
          </div>

          <div v-else-if="!filteredMapList.length" class="picker-empty">
            <q-icon name="map" size="40px" color="grey-7" />
            <p v-if="pickerSearch">No maps match "{{ pickerSearch }}"</p>
            <p v-else>No maps available.<br>Record a map first.</p>
          </div>

          <!-- Map list grouped by site -->
          <div v-else class="picker-list">
            <template v-for="group in filteredMapList" :key="group.site">
              <div class="picker-site-label">{{ group.site }}</div>
              <div
                v-for="map in group.maps"
                :key="map.map_name"
                class="picker-map-item"
                :class="{
                  'picker-map-item--selected': currentMap?.site === group.site && currentMap?.name === map.map_name,
                  'picker-map-item--disabled': map.map_status === 0
                }"
                @click="map.map_status !== 0 && selectMap(group.site, map.map_name)"
              >
                <div class="picker-map-info">
                  <span class="picker-map-name">{{ map.map_name }}</span>
                  <span class="picker-map-status" :class="statusClass(map.map_status)">
                    {{ statusLabel(map.map_status) }}
                  </span>
                </div>
                <q-icon
                  v-if="currentMap?.site === group.site && currentMap?.name === map.map_name"
                  name="check_circle" color="green-5" size="18px"
                />
                <q-icon v-else-if="map.map_status === 0" name="hourglass_empty" color="grey-6" size="16px" />
                <q-icon v-else name="chevron_right" color="grey-6" size="18px" />
              </div>
            </template>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="picker-actions" v-if="currentMap">
          <q-btn flat label="Keep current" color="grey-5" @click="mapPickerOpen = false" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ===== GO DIALOG ===== -->
    <q-dialog v-model="goDialog.open" persistent>
      <q-card class="go-dialog-card" dark>
        <q-card-section class="go-dialog-header">
          <div class="dialog-title-row">
            <span class="dialog-color-dot" :style="{ background: goDialog.section?.section_color || '#1ecf61' }" />
            <span class="dialog-title">{{ goDialog.section?.section_lable }}</span>
          </div>
          <q-btn flat round dense icon="close" color="grey-5" @click="goDialog.open = false" />
        </q-card-section>

        <q-separator dark />

        <q-card-section class="go-dialog-body">
          <p class="dialog-subtitle">Choose a destination point:</p>
          <div class="point-list">
            <div
              v-for="marker in goDialog.section?.section_marker ?? []"
              :key="marker.marker_name"
              class="point-item"
              :class="{ 'point-item--navigating': navigatingTo === marker.marker_name }"
            >
              <div class="point-info">
                <span class="point-dot" :style="{ background: marker.marker_color || '#1ecf61' }" />
                <div class="point-text">
                  <span class="point-name">{{ marker.marker_name }}</span>
                  <span class="point-coords">
                    x: {{ marker.marker_position.x.toFixed(2) }}&nbsp;
                    y: {{ marker.marker_position.y.toFixed(2) }}&nbsp;
                    yaw: {{ (marker.marker_position.yaw * 180 / Math.PI).toFixed(0) }}°
                  </span>
                </div>
              </div>
              <q-btn
                unelevated dense
                :label="navigatingTo === marker.marker_name ? 'Navigating...' : 'Go Here'"
                :color="navigatingTo === marker.marker_name ? 'orange-8' : 'green-8'"
                class="navigate-btn"
                :loading="navigatingTo === marker.marker_name"
                @click="navigateToMarker(marker)"
              />
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="go-dialog-actions">
          <q-btn v-if="navigatingTo" flat label="Cancel Navigation" color="red-5" @click="cancelNavigation" />
          <q-btn flat label="Close" color="grey-5" @click="goDialog.open = false" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { server_api_config } from 'src/configs/server'
import { socketService } from 'src/services/socketService'
import type { IPosition } from 'src/interfaces/robot_interfaces'
import MapAsset from 'components/assets/map/MapAsset.vue'
import JoystickAsset from 'components/assets/joystick/JoystickAsset.vue'

const $q = useQuasar()

// ── Types ─────────────────────────────────────────────────────────────────────
interface MarkerPosition { x: number; y: number; yaw: number }
interface ExportedMarker {
  marker_name: string; marker_type: string
  marker_position: MarkerPosition; marker_color?: string
}
interface SectionPosition { x: number; y: number; idx: number }
interface ExportedSection {
  section_lable: string; section_color: string
  section_position: SectionPosition[]
  section_position_centroid: { x: number; y: number }
  section_marker: ExportedMarker[]; type?: string
}
interface MapData { map_section: ExportedSection[] }
interface ApiMapItem { map_name: string; map_status?: number }
interface ApiDoc {
  map_sites: { site_name: string; map: ApiMapItem[] }
}
interface MapGroup { site: string; maps: ApiMapItem[] }

// ── Refs ──────────────────────────────────────────────────────────────────────
const searchText     = ref('')
const pickerSearch   = ref('')
const hoveredSection = ref<string | null>(null)
const loading        = ref(false)
const loadingProfile = ref(true)
const loadingMaps    = ref(false)
const isConnected    = ref(false)
const navigatingTo   = ref<string | null>(null)
const mapPickerOpen  = ref(false)
const showJoystick   = ref(false)
const isPanelVisible = ref(true)

const currentMap   = ref<{ site: string; name: string } | null>(null)
const navSections  = ref<ExportedSection[]>([])
const allMaps      = ref<MapGroup[]>([])

const goDialog = ref<{ open: boolean; section: ExportedSection | null }>({ open: false, section: null })

const robotStatusInfo = ref({
  currentGoalIdx: -1,
  waitingForSignal: false,
  navigationStatus: 0
})

// ── Navigation HUD state ───────────────────────────────────────────────────────
const robotPos   = ref({ x: 0, y: 0 })
const robotSpeed = ref(0)
const navTarget  = ref<{ x: number; y: number } | null>(null)
const navTotalDist = ref(0)

const NAV_STATUS_LABELS: Record<number, string> = {
  0: 'Idle', 1: 'Executing', 2: 'Succeeded', 3: 'Failed', 4: 'Canceled'
}

function fmtDist(m: number): string {
  return m >= 10 ? `${m.toFixed(1)} m` : `${m.toFixed(2)} m`
}

const navHud = computed(() => {
  const dist = navTarget.value
    ? Math.sqrt((robotPos.value.x - navTarget.value.x) ** 2 + (robotPos.value.y - navTarget.value.y) ** 2)
    : 0
  return {
    distRemaining: fmtDist(dist),
    distTotal: fmtDist(navTotalDist.value),
    speed: robotSpeed.value.toFixed(2),
    statusLabel: NAV_STATUS_LABELS[robotStatusInfo.value.navigationStatus] ?? 'Unknown'
  }
})

const navStatusClass = computed(() => {
  const s = robotStatusInfo.value.navigationStatus
  if (s === 1) return 'hud-status-executing'
  if (s === 2) return 'hud-status-succeeded'
  if (s === 3 || s === 4) return 'hud-status-failed'
  return ''
})

// ── Computed ──────────────────────────────────────────────────────────────────
const filteredSections = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  const secs = navSections.value.filter(s => s.type !== 'restrict')
  if (!q) return secs
  return secs.filter(s => s.section_lable.toLowerCase().includes(q))
})

const filteredMapList = computed((): MapGroup[] => {
  const q = pickerSearch.value.trim().toLowerCase()
  if (!q) return allMaps.value
  return allMaps.value
    .map(g => ({ ...g, maps: g.maps.filter(m => m.map_name.toLowerCase().includes(q) || g.site.toLowerCase().includes(q)) }))
    .filter(g => g.maps.length > 0)
})

const robotStatusText = computed(() => {
  if (robotStatusInfo.value.currentGoalIdx >= 0) {
    if (robotStatusInfo.value.waitingForSignal) {
      return `Waiting for Signal (Point ${robotStatusInfo.value.currentGoalIdx + 1})`
    }
    return `Executing Routine (Point ${robotStatusInfo.value.currentGoalIdx + 1})`
  }
  return 'Idle'
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function statusLabel(s?: number) {
  if (s === 0) return 'Not ready'
  if (s === 1) return 'Ready'
  return 'Unknown'
}
function statusClass(s?: number) {
  if (s === 1) return 'status-ready'
  return 'status-pending'
}

// ── Load user profile ─────────────────────────────────────────────────────────
async function loadProfile() {
  loadingProfile.value = true
  try {
    const res = await fetch(
      `http://${server_api_config.ip}:${server_api_config.port}/api/auth/profile`,
      { method: 'POST', headers: getAuthHeader() }
    )
    if (!res.ok) { void openMapPicker(); return }
    const data = await res.json()
    console.log('[Navigator] Profile API response:', JSON.stringify(data))

    // Handle both PascalCase (SelectedMapSite) and camelCase (selectedMapSite) from API
    const mapSite = data.SelectedMapSite || data.selectedMapSite
    const mapName = data.SelectedMapName || data.selectedMapName

    if (mapSite && mapName) {
      currentMap.value = { site: mapSite, name: mapName }
      
      // Tell the robot to load the saved map!
      socketService.sendSetMapCommand({
        mapSite: mapSite,
        mapName: mapName,
        mapMode: 'modify'
      });
      
      await loadMapData(mapSite, mapName)
    } else {
      // No map saved in profile — force the picker
      void openMapPicker()
    }
  } catch (e) {
    console.warn('[Navigator] Profile fetch failed:', e)
    void openMapPicker()
  } finally {
    loadingProfile.value = false
  }
}

async function loadMapData(site: string, name: string) {
  loading.value = true
  navSections.value = []
  try {
    const res = await fetch(
      `http://${server_api_config.ip}:${server_api_config.port}/api/map/data?site=${encodeURIComponent(site)}&name=${encodeURIComponent(name)}`,
      { headers: getAuthHeader() }
    )
    if (!res.ok) return
    const result = await res.json()
    if (result.mapData) {
      const parsed: MapData = JSON.parse(result.mapData)
      navSections.value = parsed.map_section ?? []
    }
  } catch (e) {
    console.warn('[Navigator] Map data fetch failed:', e)
  } finally {
    loading.value = false
  }
}

// ── Map picker ────────────────────────────────────────────────────────────────
async function openMapPicker() {
  pickerSearch.value = ''
  mapPickerOpen.value = true
  await fetchMapList()
}

async function fetchMapList() {
  loadingMaps.value = true
  try {
    const res = await fetch(
      `http://${server_api_config.ip}:${server_api_config.port}/api/maps/list`,
      { headers: getAuthHeader() }
    )
    if (!res.ok) return
    const docs: ApiDoc[] = await res.json()
    allMaps.value = docs.map(d => ({
      site: d.map_sites.site_name,
      maps: d.map_sites.map
    }))
  } catch (e) {
    console.warn('[Navigator] Map list fetch failed:', e)
  } finally {
    loadingMaps.value = false
  }
}

async function selectMap(site: string, name: string) {
  // Tell the robot to load this map (switch .pgm/.yaml immediately)
  socketService.sendSetMapCommand({ mapSite: site, mapName: name, mapMode: 'modify' });

  // Save to user profile in MongoDB
  try {
    await fetch(
      `http://${server_api_config.ip}:${server_api_config.port}/api/user/select-map`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ mapSite: site, mapName: name })
      }
    )
  } catch (e) {
    console.warn('[Navigator] select-map save failed:', e)
  }

  currentMap.value = { site, name }
  mapPickerOpen.value = false
  await loadMapData(site, name)
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
let unsubscribeConn: (() => void) | null = null
let unsubscribeMsg: (() => void) | null = null

function connectSocket() {
  let navStateChecked = false

  unsubscribeConn = socketService.onConnectionChange((connected: boolean) => {
    isConnected.value = connected
  })
  unsubscribeMsg = socketService.onMessage((msg) => {
    if (msg.odom) {
      robotPos.value = { x: msg.odom.position.x, y: msg.odom.position.y }
      const vx = msg.odom.velocity.linear.x
      const vy = msg.odom.velocity.linear.y
      robotSpeed.value = Math.sqrt(vx * vx + vy * vy)
    }
    if (msg.nodesStatus) {
      robotStatusInfo.value.currentGoalIdx = msg.nodesStatus.current_goal_idx
      robotStatusInfo.value.waitingForSignal = msg.nodesStatus.waiting_for_signal || false

      // On first status message after (re)load, restore HUD only if robot is still executing
      if (!navStateChecked) {
        navStateChecked = true
        if (msg.nodesStatus.navigation_status === 1) {
          restoreNavState()
        } else {
          clearNavState()
        }
      }

      const newNavStatus = msg.nodesStatus.navigation_status
      if (newNavStatus !== robotStatusInfo.value.navigationStatus) {
        console.log(`[Navigator] Nav status changed: ${robotStatusInfo.value.navigationStatus} -> ${newNavStatus}`)
        robotStatusInfo.value.navigationStatus = newNavStatus

        // Navigation failed — show alert
        if (newNavStatus === 3 && navigatingTo.value) {
          $q.notify({
            type: 'negative',
            icon: 'error',
            message: `Navigation failed`,
            caption: `Could not reach "${navigatingTo.value}"`,
            position: 'top',
            timeout: 6000,
            actions: [{ label: 'Dismiss', color: 'white', flat: true }]
          })
        }

        // Clear HUD when goal finishes
        if (newNavStatus === 0 || newNavStatus >= 2) {
          navigatingTo.value = null
          navTarget.value = null
          clearNavState()
        }
      }
    }
  })
}

// ── Dialog actions ────────────────────────────────────────────────────────────
function openGoDialog(section: ExportedSection) {
  goDialog.value = { open: true, section }
}

const NAV_PERSIST_KEY = 'reris_nav_active'

function saveNavState(name: string, target: { x: number; y: number }, total: number) {
  localStorage.setItem(NAV_PERSIST_KEY, JSON.stringify({ name, target, total }))
}

function clearNavState() {
  localStorage.removeItem(NAV_PERSIST_KEY)
}

function restoreNavState() {
  try {
    const raw = localStorage.getItem(NAV_PERSIST_KEY)
    if (!raw) return
    const { name, target, total } = JSON.parse(raw) as { name: string; target: { x: number; y: number }; total: number }
    navigatingTo.value = name
    navTarget.value = target
    navTotalDist.value = total
  } catch { /* ignore */ }
}

function navigateToMarker(marker: ExportedMarker) {
  console.log(`[Navigator] Navigating to marker: ${marker.marker_name}`, marker.marker_position)
  navigatingTo.value = marker.marker_name
  navTarget.value = { x: marker.marker_position.x, y: marker.marker_position.y }
  navTotalDist.value = Math.sqrt(
    (robotPos.value.x - marker.marker_position.x) ** 2 +
    (robotPos.value.y - marker.marker_position.y) ** 2
  )
  saveNavState(marker.marker_name, navTarget.value, navTotalDist.value)
  const goal: IPosition = {
    id: marker.marker_name, label: marker.marker_name, action: 'move',
    x: marker.marker_position.x, y: marker.marker_position.y, yaw: marker.marker_position.yaw,
    color: marker.marker_color
  }
  socketService.sendGoalCommand(goal)
  goDialog.value.open = false
}

function cancelNavigation() {
  socketService.sendCancelMultiGoal()
  navigatingTo.value = null
  navTarget.value = null
  clearNavState()
}

function toggleJoystick() {
  showJoystick.value = !showJoystick.value
}

function handleVelocity(velocity: { Vx: number; Vy: number; heartbeat: boolean }) {
  socketService.sendVelocityCommand(velocity.Vx, velocity.Vy, velocity.heartbeat)
}

// ── Watchers ──────────────────────────────────────────────────────────────────
// watch(hoveredSection, () => scheduleRender())

onMounted(async () => {
  connectSocket()
  await loadProfile()
})

onUnmounted(() => {
  unsubscribeConn?.()
  unsubscribeMsg?.()
})
</script>

<style scoped>
.navigator-page {
  padding: 0 !important;
  overflow: hidden;
}

.navigator-layout {
  position: fixed;
  top: 50px; /* matches .toolbar-modern height in MainLayout */
  left: 68px; /* matches mini-drawer width */
  right: 0;
  bottom: 0;
  display: flex;
  background: #111;
  overflow: hidden;
}

/* ── Left panel ── */
.nav-left {
  width: 300px; min-width: 260px; max-width: 320px;
  display: flex; flex-direction: column;
  background: #1a1a1a;
  border-right: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
  transition: width 0.3s ease, min-width 0.3s ease;
  flex-shrink: 0;
}
.navigator-layout.panel-hidden .nav-left {
  width: 0;
  min-width: 0;
}

/* ── Panel toggle + manual control buttons ── */
.panel-toggle-wrap {
  position: absolute; top: 16px; left: 16px; z-index: 20;
  display: flex; flex-direction: column; gap: 8px;
}
.floating-toggle {
  width: 44px; height: 44px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.5);
  border: 1px solid #333;
}

/* ── Joystick overlay ── */
.joystick-overlay {
  position: absolute;
  bottom: 60px;
  left: 16px;
  z-index: 25;
  background: rgba(10,10,10,0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.joystick-slide-enter-active, .joystick-slide-leave-active { transition: all 0.25s ease; }
.joystick-slide-enter-from, .joystick-slide-leave-to { opacity: 0; transform: translateY(20px); }
.nav-header {
  padding: 16px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.nav-header-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.nav-title { font-size: 15px; font-weight: 600; color: #f0f0f0; }

.current-map-badge {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: #1ecf61;
  background: rgba(30,207,97,0.1);
  border: 1px solid rgba(30,207,97,0.25);
  border-radius: 4px; padding: 3px 8px;
  width: fit-content; cursor: pointer;
  transition: background 0.15s;
}
.current-map-badge:hover { background: rgba(30,207,97,0.18); }
.badge-edit-icon { opacity: 0.6; margin-left: 2px; }
.no-map-hint { font-size: 11px; color: #666; font-style: italic; }

.nav-search { padding: 10px 12px 8px; }
.search-input :deep(.q-field__control) { background: #111; border-radius: 8px; }

/* Section list */
.section-list {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 4px 8px 12px;
}
.section-list::-webkit-scrollbar { width: 4px; }
.section-list::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }

.section-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px; border-radius: 8px; margin-bottom: 4px;
  cursor: default; transition: background 0.15s;
}
.section-item--highlighted { background: rgba(255,255,255,0.05); }
.section-info { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.section-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.section-text { display: flex; flex-direction: column; min-width: 0; }
.section-label { font-size: 13px; font-weight: 500; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.section-meta { font-size: 10px; color: #777; }
.go-btn { font-size: 11px; font-weight: 700; padding: 2px 12px; border-radius: 6px; letter-spacing: .05em; flex-shrink: 0; }

/* Empty state */
.empty-state {
  flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px; padding: 32px 16px;
  color: #555; font-size: 13px; text-align: center; overflow: hidden;
}
.empty-state p { margin: 0; line-height: 1.5; }


/* ── Right map ── */
.nav-map { flex: 1; position: relative; background: #0d0d0d; overflow: hidden; }
.map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.map-placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px;
}
.map-placeholder-text { font-size: 14px; color: #555; margin: 0; }
.map-info-bar {
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px;
  background: rgba(0,0,0,0.72); backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 20px;
  padding: 4px 14px; font-size: 11px; color: #aaa; pointer-events: none;
}
.map-info-sep { color: #444; }

/* Dashboard Status Bar */
.dashboard-status-bar {
  position: absolute; bottom: 44px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px;
  backdrop-filter: blur(6px);
  border-radius: 8px;
  padding: 6px 16px; font-size: 13px; font-weight: 600; pointer-events: none;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.status-executing {
  color: #f0f0f0; border: 1px solid rgba(30,207,97,0.4); background: rgba(30,207,97,0.15); box-shadow: 0 0 10px rgba(30,207,97,0.2);
}
.status-waiting {
  color: #f0f0f0; border: 1px solid rgba(255,165,0,0.4); background: rgba(255,165,0,0.15); box-shadow: 0 0 10px rgba(255,165,0,0.2);
}

/* ── Map picker dialog ── */
.picker-card {
  width: 460px; max-width: 95vw;
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  max-height: 85vh;
  display: flex; flex-direction: column;
}
.picker-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 12px;
}
.picker-title-row { display: flex; align-items: center; gap: 10px; }
.picker-title { font-size: 16px; font-weight: 600; color: #f0f0f0; }
.picker-search { padding: 10px 16px 4px; }
.picker-body { flex: 1; overflow-y: auto; padding: 6px 16px 8px; }
.picker-body::-webkit-scrollbar { width: 4px; }
.picker-body::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }

.picker-loading, .picker-empty {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 40px 0;
  color: #555; font-size: 13px; text-align: center;
}
.picker-empty p { margin: 0; line-height: 1.5; }

.picker-list { display: flex; flex-direction: column; gap: 2px; }

.picker-site-label {
  font-size: 10px; font-weight: 700; letter-spacing: .1em;
  color: #666; text-transform: uppercase;
  padding: 10px 4px 4px; margin-top: 4px;
}
.picker-site-label:first-child { padding-top: 4px; margin-top: 0; }

.picker-map-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 12px; border-radius: 8px;
  cursor: pointer; transition: background 0.15s;
  border: 1px solid transparent;
}
.picker-map-item:hover:not(.picker-map-item--disabled) {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.07);
}
.picker-map-item--selected {
  background: rgba(30,207,97,0.1) !important;
  border-color: rgba(30,207,97,0.3) !important;
}
.picker-map-item--disabled { opacity: 0.45; cursor: not-allowed; }

.picker-map-info { display: flex; flex-direction: column; gap: 2px; }
.picker-map-name { font-size: 13px; font-weight: 500; color: #e8e8e8; }
.picker-map-status { font-size: 10px; font-weight: 600; }
.status-ready { color: #1ecf61; }
.status-pending { color: #888; }

.picker-actions { padding: 8px 16px 14px; }

/* ── Go dialog ── */
.go-dialog-card {
  width: 420px; max-width: 95vw;
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
}
.go-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 12px;
}
.dialog-title-row { display: flex; align-items: center; gap: 10px; }
.dialog-color-dot { width: 12px; height: 12px; border-radius: 50%; }
.dialog-title { font-size: 16px; font-weight: 600; color: #f0f0f0; }
.go-dialog-body { padding: 8px 16px 4px; }
.dialog-subtitle { font-size: 12px; color: #888; margin: 0 0 10px; }

.point-list {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 340px; overflow-y: auto;
}
.point-list::-webkit-scrollbar { width: 4px; }
.point-list::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }

.point-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px; transition: background 0.15s;
}
.point-item--navigating {
  background: rgba(30,207,97,0.08);
  border-color: rgba(30,207,97,0.2);
}
.point-item:hover { background: rgba(255,255,255,0.07); }
.point-info { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.point-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.point-text { display: flex; flex-direction: column; }
.point-name { font-size: 13px; font-weight: 500; color: #eee; }
.point-coords { font-size: 10px; color: #666; font-family: monospace; }
.navigate-btn { font-size: 11px; font-weight: 600; padding: 2px 12px; border-radius: 6px; flex-shrink: 0; }
.go-dialog-actions { padding: 8px 16px 14px; }

/* ── Navigation HUD ── */
.nav-hud {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  z-index: 30; pointer-events: none;
}
.hud-inner {
  pointer-events: auto;
  display: flex; align-items: center; gap: 12px;
  background: rgba(10,10,10,0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 10px 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  width: max-content;
}
.hud-dest {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700; color: #e8e8e8;
  max-width: 140px; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 0;
}
.hud-dest-name { overflow: hidden; text-overflow: ellipsis; }
.hud-stats {
  display: flex; align-items: center; gap: 10px;
  flex: 1;
}
.hud-stat {
  display: flex; flex-direction: column; align-items: center;
  min-width: 56px;
}
.hud-stat-val { font-size: 14px; font-weight: 800; color: #fff; line-height: 1.2; }
.hud-stat-lbl { font-size: 9px; color: #666; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.hud-divider { width: 1px; height: 28px; background: rgba(255,255,255,0.1); flex-shrink: 0; }
.hud-status-text { font-size: 12px; }
.hud-status-executing { color: #1ecf61; }
.hud-status-succeeded { color: #1ecf61; }
.hud-status-failed { color: #f44336; }
.hud-cancel-btn { flex-shrink: 0; border-radius: 8px; font-size: 11px; font-weight: 700; }

/* HUD slide-down transition */
.hud-slide-enter-active, .hud-slide-leave-active { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
.hud-slide-enter-from, .hud-slide-leave-to { opacity: 0; transform: translateX(-50%) translateY(-16px); }
</style>
