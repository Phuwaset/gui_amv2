<template>
  <q-page class="mp-page">

    <!-- ── Toolbar ── -->
    <div class="mp-toolbar">
      <div class="mp-search-wrap">
        <svg class="mp-search-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="#888" stroke-width="1.4"/>
          <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="#888" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input
          v-model="search"
          class="mp-search"
          placeholder="Search maps…"
          @input="applyFilter"
        />
        <button v-if="search" class="mp-search-clear" @click="search = ''; applyFilter()">
          <svg viewBox="0 0 12 12" fill="none">
            <line x1="2" y1="2" x2="10" y2="10" stroke="#888" stroke-width="1.4" stroke-linecap="round"/>
            <line x1="10" y1="2" x2="2" y2="10" stroke="#888" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="mp-toolbar-right">
        <button class="mp-icon-btn" :class="{ spinning: refreshing }" @click="handleRefresh" title="Refresh">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <polyline points="8,2.5 11,1 11,4" fill="currentColor"/>
          </svg>
        </button>
        <button class="mp-create-btn" @click="openCreateDialog">
          <svg viewBox="0 0 14 14" fill="none">
            <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          Create
        </button>
      </div>
    </div>

    <!-- ── Table ── -->
    <div class="mp-table">

      <!-- Header -->
      <div class="mp-thead">
        <div class="mp-th mp-col-name">Name</div>
        <div class="mp-th mp-col-site">Site</div>
        <div class="mp-th mp-col-status">Status</div>
        <div class="mp-th mp-col-actions">Actions</div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="mp-empty">
        <svg class="mp-spinner" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#444" stroke-width="2"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#0078d4" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>Loading maps…</span>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredRows.length === 0" class="mp-empty">
        <svg viewBox="0 0 48 48" fill="none" width="40" height="40" style="margin-bottom:10px;opacity:.35">
          <rect x="8" y="12" width="32" height="28" rx="3" stroke="#888" stroke-width="2"/>
          <line x1="8" y1="20" x2="40" y2="20" stroke="#888" stroke-width="1.5"/>
          <line x1="16" y1="28" x2="32" y2="28" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        No maps found
      </div>

      <!-- Rows -->
      <div v-else>
        <div
          v-for="(row, i) in filteredRows"
          :key="i"
          class="mp-row"
        >
          <!-- Name -->
          <div class="mp-col-name">
            <div class="mp-row-name">{{ row.mapName }}</div>
            <div class="mp-row-sub">{{ row.mapDescription || row.mapSize || '—' }}</div>
          </div>

          <!-- Site -->
          <div class="mp-col-site">
            <span class="mp-site-chip">{{ row.siteName }}</span>
          </div>

          <!-- Status -->
          <div class="mp-col-status">
            <span class="mp-badge" :class="badgeClass(row.mapStatus)">
              {{ statusLabel(row.mapStatus) }}
            </span>
          </div>

          <!-- Actions -->
          <div class="mp-col-actions mp-actions-row">
            <button class="mp-act-btn mp-act-record" @click="recordMap(row)" title="Record map">
              <svg viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3"/>
                <circle cx="7" cy="7" r="2.5" fill="currentColor"/>
              </svg>
            </button>
            <button class="mp-act-btn" @click="openEditDialog(row)" title="Edit name & description">
              <svg viewBox="0 0 14 14" fill="none">
                <path d="M9.5 2.5 L11.5 4.5 L5 11 L2.5 11.5 L3 9 Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="mp-act-btn" @click="editMap(row)" title="Open map editor">
              <svg viewBox="0 0 14 14" fill="none">
                <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
                <line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <line x1="7" y1="5" x2="7" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="mp-act-btn" @click="openMap(row)" title="Open map">
              <svg viewBox="0 0 14 14" fill="none">
                <path d="M6 3H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M9 2h3v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="12" y1="2" x2="7" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="mp-act-btn mp-act-select" @click="selectMap(row)" title="Set as active map">
              <svg viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3"/>
                <path d="M4.5 7 L6.5 9 L9.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <div class="mp-act-divider"></div>

            <button class="mp-act-btn mp-act-delete" @click="openRemoveConfirm(row)" title="Delete map">
              <svg viewBox="0 0 14 14" fill="none">
                <path d="M3 4h8M5.5 4V3h3v1M5.5 6.5v4M8.5 6.5v4M3.5 4l.5 7h6l.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Create / Sites panel ── -->
    <q-dialog v-model="createDlg.open" persistent position="right"
      transition-show="slide-left" transition-hide="slide-right">
      <div class="mp-panel">
        <!-- Panel header -->
        <div class="mp-panel-header">
          <button v-if="showSitesSection" class="mp-panel-icon-btn" @click="showSitesSection = false" title="Back">
            <svg viewBox="0 0 14 14" fill="none">
              <polyline points="9,2 4,7 9,12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <span class="mp-panel-title">{{ showSitesSection ? 'Sites' : 'Create map' }}</span>
          <button class="mp-panel-icon-btn mp-panel-close" v-close-popup title="Close">
            <svg viewBox="0 0 14 14" fill="none">
              <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Create form -->
        <div v-if="!showSitesSection" class="mp-panel-body">
          <div class="mp-field">
            <label class="mp-field-label">NAME</label>
            <input v-model="createDlg.name" class="mp-field-input" placeholder="Map name" />
          </div>

          <div class="mp-field">
            <label class="mp-field-label">DESCRIPTION</label>
            <textarea
              v-model="createDlg.description"
              class="mp-field-input mp-field-textarea"
              placeholder="Optional description…"
              rows="3"
            />
          </div>

          <div class="mp-field">
            <label class="mp-field-label">SITE</label>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <select v-model="createDlg.site" class="mp-field-select" style="flex:1">
                <option value="" disabled>Select site…</option>
                <option v-for="s in siteOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
              <button class="mp-icon-btn" @click="showSitesSection = true" title="Manage sites" style="flex-shrink:0">
                <svg viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3"/>
                  <line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <p v-if="siteOptions.length === 0" class="mp-field-hint" style="color:#555">
              No sites yet — click + to create one.
            </p>
          </div>
        </div>

        <!-- Sites manager -->
        <div v-else class="mp-panel-body" style="padding:0;display:flex;flex-direction:column;height:100%">
          <div style="padding:14px 16px;border-bottom:1px solid #2a2a2a">
            <p class="mp-panel-desc" style="margin:0">A site groups maps for the same facility. Maps in the same site can connect via portals.</p>
          </div>

          <!-- Add site row -->
          <div style="padding:12px 16px;border-bottom:1px solid #2a2a2a">
            <label class="mp-field-label">ADD SITE</label>
            <div style="display:flex;gap:8px">
              <input
                v-model="newSiteName"
                class="mp-field-input"
                placeholder="Site name…"
                @keyup.enter="addSite"
                style="flex:1"
              />
              <button class="mp-create-btn mp-create-btn--sm" @click="addSite">Add</button>
            </div>
          </div>

          <!-- Site list -->
          <div style="flex:1;overflow-y:auto">
            <div v-if="siteOptions.length === 0" class="mp-empty" style="height:160px">
              <svg viewBox="0 0 32 32" fill="none" width="32" height="32" style="opacity:.3">
                <rect x="4" y="8" width="24" height="18" rx="2" stroke="#888" stroke-width="1.5"/>
                <line x1="4" y1="14" x2="28" y2="14" stroke="#888" stroke-width="1.2"/>
              </svg>
              <span style="font-size:12px">No sites yet</span>
            </div>
            <div
              v-for="(s, i) in siteOptions"
              :key="i"
              class="mp-site-row"
              :class="{ 'mp-site-row--active': createDlg.site === s.value }"
              @click="createDlg.site = s.value"
            >
              <svg viewBox="0 0 14 14" fill="none" class="mp-site-row-icon">
                <rect x="2" y="4" width="10" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/>
                <path d="M5 4V3a2 2 0 0 1 4 0v1" stroke="currentColor" stroke-width="1.2"/>
              </svg>
              <span class="mp-site-row-name">{{ s.label }}</span>
              <button class="mp-site-row-del" @click.stop="removeSite(i)" title="Remove site">
                <svg viewBox="0 0 12 12" fill="none">
                  <path d="M3 3h6M4.5 3V2.5h3V3M4.5 5v3.5M7.5 5v3.5M3.5 3l.4 5.5h4.2l.4-5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Panel footer -->
        <div class="mp-panel-footer">
          <button
            v-if="!showSitesSection"
            class="mp-create-btn mp-create-btn--full"
            :disabled="!canCreate || createDlg.loading"
            @click="submitCreate"
          >
            <svg v-if="createDlg.loading" class="mp-spinner mp-spinner--sm" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.2)" stroke-width="2"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
            {{ createDlg.loading ? 'Creating…' : 'CREATE' }}
          </button>
          <button v-else class="mp-outline-btn" @click="showSitesSection = false">Close</button>
        </div>
      </div>
    </q-dialog>

    <!-- ── Edit map dialog ── -->
    <q-dialog v-model="editDlg.open" persistent dark>
      <div class="mp-confirm mp-edit-panel">
        <div class="mp-confirm-header">
          <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
            <path d="M9.5 2.5 L11.5 4.5 L5 11 L2.5 11.5 L3 9 Z" stroke="#1ecf61" stroke-width="1.3" stroke-linejoin="round"/>
          </svg>
          <span>Edit map</span>
          <button class="mp-panel-icon-btn" style="margin-left:auto" v-close-popup>
            <svg viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>

        <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
          <div class="mp-field">
            <label class="mp-field-label">NAME</label>
            <input v-model="editDlg.name" class="mp-field-input" placeholder="Map name" />
          </div>
          <div class="mp-field">
            <label class="mp-field-label">DESCRIPTION</label>
            <textarea
              v-model="editDlg.description"
              class="mp-field-input mp-field-textarea"
              placeholder="Add a description…"
              rows="3"
            />
          </div>
        </div>

        <div class="mp-confirm-actions">
          <button class="mp-outline-btn" v-close-popup>Cancel</button>
          <button
            class="mp-create-btn"
            style="height:34px;padding:0 16px;font-size:13px"
            :disabled="editDlg.saving || !editDlg.name.trim()"
            @click="submitEdit"
          >
            {{ editDlg.saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </q-dialog>

    <!-- ── Delete confirm ── -->
    <q-dialog v-model="confirmRemoveDialog" persistent dark>
      <div class="mp-confirm">
        <div class="mp-confirm-header">
          <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
            <path d="M10 3 L18 17 H2 Z" stroke="#e05252" stroke-width="1.4" stroke-linejoin="round"/>
            <line x1="10" y1="9" x2="10" y2="13" stroke="#e05252" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="10" cy="15.5" r=".8" fill="#e05252"/>
          </svg>
          <span>Delete map</span>
        </div>
        <p class="mp-confirm-body">
          Are you sure you want to delete
          <strong>{{ mapToRemove?.mapName || 'this map' }}</strong>?
          This action cannot be undone.
        </p>
        <div class="mp-confirm-actions">
          <button class="mp-outline-btn" v-close-popup>Cancel</button>
          <button class="mp-danger-btn" :disabled="isRemoving" @click="executeRemove">
            {{ isRemoving ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </q-dialog>

  </q-page>
</template>

<script setup lang="ts">
import { server_api_config } from 'src/configs/server'
import { socketService } from 'src/services/socketService';
import { ref, reactive, computed, onMounted } from 'vue'
import { Notify } from 'quasar'
import { useRouter } from 'vue-router'

type ApiMapItem = {
  map_name: string
  map_size?: string
  status?: string
  map_status?: number
  locate?: string
  author?: string
  map_description?: string
}

type ApiDoc = {
  map_sites: { site_name: string; map: ApiMapItem[] }
  id: string
  createdAt: string
}

type Row = {
  mapName: string
  siteName: string
  mapSize?: string
  mapStatus: number
  mapDescription?: string
  status?: string
  raw: ApiDoc
}

const router = useRouter()
const loading = ref(true)
const refreshing = ref(false)
const rows = ref<Row[]>([])
const search = ref('')
const showSitesSection = ref(false)
const newSiteName = ref('')

const createDlg = reactive({ open: false, name: '', description: '', site: '' as string | null, loading: false })
const siteOptions = reactive<{ label: string; value: string }[]>([])
const confirmRemoveDialog = ref(false)
const mapToRemove = ref<Row | null>(null)
const isRemoving = ref(false)

const editDlg = reactive({ open: false, row: null as Row | null, name: '', description: '', saving: false })

const filteredRows = computed(() => {
  if (!search.value) return rows.value
  const q = search.value.toLowerCase()
  return rows.value.filter(r => r.mapName.toLowerCase().includes(q) || r.siteName.toLowerCase().includes(q))
})

const canCreate = computed(() => createDlg.name.trim().length > 0 && !!createDlg.site)

function statusLabel(n: number) {
  if (n === 0) return 'Pending'
  if (n === 1) return 'Ready'
  if (n === 2) return 'Warning'
  return 'Error'
}

function badgeClass(n: number) {
  if (n === 0) return 'mp-badge--pending'
  if (n === 1) return 'mp-badge--ready'
  if (n === 2) return 'mp-badge--warn'
  return 'mp-badge--error'
}

function getAuthHeader() {
  const token = localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchMaps() {
  loading.value = true
  try {
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/maps/list`, {
      headers: { ...getAuthHeader() }
    })
    if (res.status === 401) { Notify.create({ type: 'negative', message: 'Authentication failed.' }); return }
    const data: ApiDoc[] = await res.json()
    const out: Row[] = []
    for (const doc of data) {
      const site = doc.map_sites?.site_name ?? ''
      const maps: ApiMapItem[] = Array.isArray(doc.map_sites?.map) ? doc.map_sites.map : []
      for (const m of maps) {
        out.push({ mapName: m.map_name, siteName: site, mapSize: m.map_size ?? '—', mapStatus: typeof m.map_status === 'number' ? m.map_status : 0, status: m.status ?? 'Ready', mapDescription: m.map_description ?? '', raw: doc })
      }
    }
    rows.value = out
    const unique = Array.from(new Set(rows.value.map(r => r.siteName).filter(Boolean)))
    siteOptions.splice(0, siteOptions.length, ...unique.map(s => ({ label: s, value: s })))
  } catch {
    Notify.create({ type: 'negative', message: 'Failed to load maps.' })
  } finally {
    loading.value = false
  }
}

async function handleRefresh() {
  refreshing.value = true
  await fetchMaps()
  refreshing.value = false
}

function openCreateDialog() { createDlg.open = true; showSitesSection.value = false }

function addSite() {
  const name = newSiteName.value.trim()
  if (!name) return
  if (!siteOptions.find(s => s.value === name)) siteOptions.push({ label: name, value: name })
  createDlg.site = name
  newSiteName.value = ''
}

function removeSite(index: number) { siteOptions.splice(index, 1) }

async function submitCreate() {
  if (!createDlg.site || !createDlg.name.trim()) return
  createDlg.loading = true
  const payload = { map_sites: { mapSites: createDlg.site, map: [{ mapName: createDlg.name.trim(), mapDescription: createDlg.description.trim(), mapLocate: '', mapStatus: 0 }] } }
  try {
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/map/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload)
    })
    if (res.status === 401) { Notify.create({ type: 'negative', message: 'Authentication failed.' }); return }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const result = await res.json()
    let createdName = ''
    if (Array.isArray(result?.map_sites?.map) && result.map_sites.map.length) {
      const first = result.map_sites.map[0]
      createdName = first.mapName || first.map_name || createDlg.name.trim()
    } else if (result?.map?.map_name) {
      createdName = result.map.map_name
    } else {
      createdName = createDlg.name.trim()
    }
    Notify.create({ type: 'positive', message: `Map "${createdName}" created.` })
    await fetchMaps()
  } catch (err: unknown) {
    Notify.create({ type: 'negative', message: `Failed to create map${err instanceof Error ? ': ' + err.message : ''}` })
  } finally {
    createDlg.loading = false; createDlg.open = false; createDlg.name = ''; createDlg.description = ''; createDlg.site = null; showSitesSection.value = false
  }
}

async function selectMap(r: Row) {
  socketService.sendSetMapCommand({ mapSite: r.siteName, mapName: r.mapName, mapMode: 'modify' })
  try {
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/user/select-map`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ mapSite: r.siteName, mapName: r.mapName })
    })
    if (!res.ok) console.warn('[selectMap] Profile save failed:', res.status)
  } catch (e) { console.warn('[selectMap]', e) }
}

async function openMap(r: Row) {
  try {
    await router.push({ name: 'MapView', params: { siteName: r.siteName, mapName: r.mapName }, query: { mode: 'visualize' } })
  } catch { Notify.create({ type: 'negative', message: 'Failed to open map.' }) }
}

async function editMap(r: Row) {
  try {
    await router.push({ name: 'MapEdit', params: { siteName: r.siteName, mapName: r.mapName } })
  } catch { Notify.create({ type: 'negative', message: 'Failed to open map editor.' }) }
}

async function recordMap(r: Row) {
  try {
    await router.push({ name: 'MapRecord', params: { siteName: r.siteName, mapName: r.mapName, recording: false } })
  } catch { Notify.create({ type: 'negative', message: 'Failed to start recording.' }) }
}

function openEditDialog(row: Row) {
  editDlg.row = row
  editDlg.name = row.mapName
  editDlg.description = row.mapDescription ?? ''
  editDlg.saving = false
  editDlg.open = true
}

async function submitEdit() {
  if (!editDlg.row || !editDlg.name.trim()) return
  editDlg.saving = true
  const oldName = editDlg.row.mapName
  const newName = editDlg.name.trim()
  const desc = editDlg.description.trim()

  const payload: Record<string, unknown> = {
    mapSite: editDlg.row.siteName,
    mapName: oldName,
    mapDescription: desc,
  }
  if (newName !== oldName) payload.newMapName = newName

  try {
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/map/update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    Notify.create({ type: 'positive', message: `Map updated.` })
    editDlg.open = false
    await fetchMaps()
  } catch (err: unknown) {
    Notify.create({ type: 'negative', message: `Failed to update: ${err instanceof Error ? err.message : 'Unknown error'}` })
  } finally {
    editDlg.saving = false
  }
}

function openRemoveConfirm(row: Row) { mapToRemove.value = row; confirmRemoveDialog.value = true }

async function executeRemove() {
  if (!mapToRemove.value) return
  const mapName = mapToRemove.value.mapName
  isRemoving.value = true
  try {
    const res = await fetch(`http://${server_api_config.ip}:${server_api_config.port}/api/map/remove`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ mapName })
    })
    if (res.status === 401) { Notify.create({ type: 'negative', message: 'Unauthorized.' }); return }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      Notify.create({ type: res.status === 404 ? 'warning' : 'negative', message: errData.Message || `Failed with status ${res.status}` })
    } else {
      await res.json().catch(() => ({}))
      Notify.create({ type: 'positive', message: `Map "${mapName}" removed.` })
      confirmRemoveDialog.value = false
      await fetchMaps()
    }
  } catch (err: unknown) {
    Notify.create({ type: 'negative', message: `Failed to remove: ${err instanceof Error ? err.message : 'Unknown error'}` })
  } finally {
    isRemoving.value = false; mapToRemove.value = null
  }
}

function applyFilter() { /* handled by computed */ }

onMounted(fetchMaps)
</script>

<style scoped>
/* ── Page ── */
.mp-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Arial, sans-serif;
  color: #e0e0e0;
  background: transparent;
}

/* ── Toolbar ── */
.mp-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.mp-search-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.mp-search-icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  pointer-events: none;
}

.mp-search {
  width: 100%;
  height: 36px;
  padding: 0 32px 0 32px;
  background: #1e1e1e;
  border: 1px solid #313131;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 13px;
  outline: none;
  transition: border-color .15s;
}

.mp-search::placeholder { color: #666; }
.mp-search:focus { border-color: #1ecf61; }

.mp-search-clear {
  position: absolute;
  right: 8px;
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: .6;
}
.mp-search-clear:hover { opacity: 1; }

.mp-toolbar-right { display: flex; align-items: center; gap: 8px; }

.mp-icon-btn {
  width: 36px;
  height: 36px;
  background: #1e1e1e;
  border: 1px solid #313131;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  transition: background .15s, color .15s;
}
.mp-icon-btn svg { width: 15px; height: 15px; }
.mp-icon-btn:hover { background: #2a2a2a; color: #e0e0e0; }
.mp-icon-btn.spinning svg { animation: spin .7s linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

.mp-create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  background: #1ecf61;
  border: none;
  border-radius: 6px;
  color: #0d1f12;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s;
  white-space: nowrap;
}
.mp-create-btn svg { width: 12px; height: 12px; }
.mp-create-btn:hover:not(:disabled) { background: #1bdb6a; }
.mp-create-btn:disabled { opacity: .45; cursor: not-allowed; }
.mp-create-btn--full { width: 100%; justify-content: center; }
.mp-create-btn--sm { height: 32px; padding: 0 12px; font-size: 12px; }

/* ── Table ── */
.mp-table {
  background: #1e1e1e;
  border: 1px solid #2e2e2e;
  border-radius: 8px;
  overflow: hidden;
}

.mp-thead {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 16px;
  background: #252525;
  border-bottom: 1px solid #2e2e2e;
}

.mp-th {
  font-size: 11px;
  font-weight: 700;
  color: #666;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.mp-col-name   { flex: 3; }
.mp-col-site   { flex: 2; }
.mp-col-status { flex: 1.5; }
.mp-col-actions { flex: 2; display: flex; align-items: center; justify-content: flex-end; }

.mp-row {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 58px;
  border-bottom: 1px solid #262626;
  transition: background .12s;
}
.mp-row:last-child { border-bottom: none; }
.mp-row:hover { background: rgba(255,255,255,.03); }

.mp-row-name {
  font-size: 13.5px;
  font-weight: 600;
  color: #e8e8e8;
  line-height: 1.2;
}
.mp-row-sub {
  font-size: 11px;
  color: #5a5a5a;
  margin-top: 2px;
}

.mp-site-chip {
  display: inline-block;
  padding: 3px 9px;
  background: #292929;
  border: 1px solid #353535;
  border-radius: 4px;
  font-size: 12px;
  color: #9a9a9a;
  letter-spacing: .02em;
}

/* ── Status badge ── */
.mp-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.mp-badge--ready   { background: rgba(30,207,97,.12);  border-color: rgba(30,207,97,.3);  color: #1ecf61; }
.mp-badge--pending { background: rgba(255,170,0,.1);   border-color: rgba(255,170,0,.3);  color: #ffaa00; }
.mp-badge--warn    { background: rgba(255,120,0,.1);   border-color: rgba(255,120,0,.3);  color: #ff7800; }
.mp-badge--error   { background: rgba(224,82,82,.1);   border-color: rgba(224,82,82,.3);  color: #e05252; }

/* ── Action buttons ── */
.mp-actions-row { display: flex; align-items: center; gap: 2px; }

.mp-act-btn {
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  transition: background .12s, color .12s;
}
.mp-act-btn svg { width: 13px; height: 13px; }
.mp-act-btn:hover { background: rgba(255,255,255,.07); color: #ccc; }
.mp-act-record { color: #5a5a5a; }
.mp-act-record:hover { color: #e05252; background: rgba(224,82,82,.1); }
.mp-act-select:hover { color: #1ecf61; background: rgba(30,207,97,.1); }
.mp-act-delete:hover { color: #e05252; background: rgba(224,82,82,.1); }

.mp-act-divider {
  width: 1px;
  height: 18px;
  background: #333;
  margin: 0 4px;
}

/* ── Empty / Loading ── */
.mp-empty {
  height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 13px;
  gap: 8px;
}

/* ── Spinner ── */
.mp-spinner { animation: spin .8s linear infinite; width: 24px; height: 24px; }
.mp-spinner--sm { width: 14px; height: 14px; margin-right: 4px; }

/* override spinner arc color to green */
.mp-spinner path { stroke: #1ecf61; }

/* ── Create panel ── */
.mp-panel {
  width: 380px;
  max-width: 380px;
  height: 100vh;
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #2e2e2e;
}

.mp-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid #2e2e2e;
  background: #252525;
}

.mp-panel-title {
  flex: 1;
  font-size: 14px;
  font-weight: 700;
  color: #e0e0e0;
}

.mp-panel-icon-btn {
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #777;
  transition: background .12s, color .12s;
}
.mp-panel-icon-btn svg { width: 13px; height: 13px; }
.mp-panel-icon-btn:hover { background: rgba(255,255,255,.07); color: #ccc; }

.mp-panel-close { margin-left: auto; }

.mp-panel-body {
  flex: 1;
  padding: 18px 16px;
  overflow-y: auto;
}

.mp-panel-desc {
  font-size: 12px;
  color: #666;
  line-height: 1.55;
  margin: 0 0 18px;
}

.mp-panel-footer {
  padding: 14px 16px;
  border-top: 1px solid #2e2e2e;
  background: #1e1e1e;
}

/* ── Form fields ── */
.mp-field { margin-bottom: 16px; }

.mp-field-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .07em;
  color: #666;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.mp-field-hint {
  font-size: 11px;
  color: #555;
  margin: 0 0 8px;
  line-height: 1.4;
}

.mp-field-input,
.mp-field-select {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  background: #161616;
  border: 1px solid #333;
  border-radius: 5px;
  color: #e0e0e0;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color .15s;
  appearance: none;
}
.mp-field-input:focus,
.mp-field-select:focus { border-color: #1ecf61; box-shadow: 0 0 0 2px rgba(30,207,97,.12); }
.mp-field-input::placeholder { color: #444; }
.mp-field-select { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpolyline points='1,1 5,5 9,1' stroke='%23666' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px; }

.mp-outline-btn {
  width: 100%;
  height: 34px;
  background: none;
  border: 1px solid #333;
  border-radius: 5px;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
  transition: background .12s, color .12s, border-color .12s;
}
.mp-outline-btn:hover { background: rgba(30,207,97,.07); border-color: #1ecf61; color: #1ecf61; }

/* ── Site list rows ── */
.mp-site-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 44px;
  border-bottom: 1px solid #262626;
  cursor: pointer;
  transition: background .12s;
}
.mp-site-row:last-child { border-bottom: none; }
.mp-site-row:hover { background: rgba(255,255,255,.04); }
.mp-site-row--active { background: rgba(30,207,97,.07); }
.mp-site-row--active .mp-site-row-icon { color: #1ecf61; }
.mp-site-row--active .mp-site-row-name { color: #1ecf61; }

.mp-site-row-icon { width: 13px; height: 13px; color: #555; flex-shrink: 0; }
.mp-site-row-name { flex: 1; font-size: 13px; color: #ccc; }

.mp-site-row-del {
  width: 26px;
  height: 26px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  padding: 0;
  transition: background .12s, color .12s;
  flex-shrink: 0;
}
.mp-site-row-del svg { width: 11px; height: 11px; }
.mp-site-row-del:hover { background: rgba(224,82,82,.12); color: #e05252; }

/* ── Delete confirm ── */
.mp-field-textarea {
  height: auto;
  resize: vertical;
  padding: 8px 10px;
  font-family: inherit;
  line-height: 1.5;
}

.mp-edit-panel { width: 400px; }

.mp-confirm {
  width: 360px;
  background: #1e1e1e;
  border: 1px solid #2e2e2e;
  border-radius: 8px;
  overflow: hidden;
}

.mp-confirm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid #2a2a2a;
  font-size: 14px;
  font-weight: 700;
  color: #e0e0e0;
}

.mp-confirm-body {
  padding: 16px;
  font-size: 13px;
  color: #9a9a9a;
  line-height: 1.55;
  margin: 0;
}
.mp-confirm-body strong { color: #e0e0e0; }

.mp-confirm-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #2a2a2a;
  justify-content: flex-end;
}

.mp-confirm-actions .mp-outline-btn {
  width: auto;
  padding: 0 16px;
}

.mp-danger-btn {
  height: 34px;
  padding: 0 16px;
  background: #c42b2b;
  border: none;
  border-radius: 5px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s;
}
.mp-danger-btn:hover:not(:disabled) { background: #d93333; }
.mp-danger-btn:disabled { opacity: .45; cursor: not-allowed; }

@media (max-width: 420px) {
  .mp-panel { width: 100vw; max-width: 100vw; }
}
</style>
