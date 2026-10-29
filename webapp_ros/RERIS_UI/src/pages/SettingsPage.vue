<template>
  <q-page class="settings-page" :style-fn="(offset) => ({ height: `calc(100vh - ${offset}px)`, overflow: 'hidden', display: 'flex', flexDirection: 'column' })">
    <div class="settings-layout">

      <!-- ===== LEFT — Sidebar ===== -->
      <div class="settings-sidebar">
        <div class="settings-brand">
          <q-icon name="settings" size="22px" color="blue-5" />
          <span>System Settings</span>
        </div>

        <div class="settings-nav">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="nav-item"
            :class="{ 'nav-item--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <q-icon :name="tab.icon" size="18px" />
            <span>{{ tab.label }}</span>
            <q-icon v-if="tab.adminOnly && isReadOnly" name="lock" size="13px" class="q-ml-auto lock-icon" />
          </div>
        </div>

        <div class="settings-footer">
          <button
            class="save-all-btn"
            :disabled="isReadOnly || savingAll"
            @click="saveAllSettings"
          >
            <svg v-if="savingAll" class="save-spinner" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,.2)" stroke-width="2"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <svg v-else viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M3 13h10M8 3v7M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ savingAll ? 'Saving…' : 'Save All' }}
          </button>
          <div v-if="isReadOnly" class="admin-hint">Admin access required to save</div>
        </div>
      </div>

      <!-- ===== RIGHT — Content ===== -->
      <div class="settings-content">

        <!-- ── Map Configuration ── -->
        <div v-if="activeTab === 'mapconfig'" class="tab-section">
          <div class="section-header">
            <q-icon name="map" size="22px" class="section-icon" />
            <span class="section-title">Map Configuration</span>
          </div>

          <div class="card-block">
            <div class="block-title" style="display:flex;align-items:center;gap:8px;">
              Default Map
              <span v-if="savingMapSelection" style="font-size:11px;color:#888;font-weight:400;">saving…</span>
              <span v-else-if="mapSelectionMsg" :style="{ fontSize:'11px', fontWeight:'400', color: mapSelectionMsg==='Saved' ? '#1ecf61' : '#e05252' }">{{ mapSelectionMsg }}</span>
            </div>

            <!-- Default Site combobox -->
            <div class="form-row">
              <label class="form-label">Default Site</label>
              <q-select
                v-model="settings.defaultMapSite"
                :options="mapSiteOptions"
                dense dark outlined
                clearable
                use-input
                input-debounce="0"
                :placeholder="settings.defaultMapSite ? '' : 'Select or type a site'"
                class="form-input"
                :loading="loadingMaps"
                @filter="filterSites"
                @update:model-value="settings.defaultMapName = null"
              >
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey">No sites found</q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

            <!-- Default Map combobox — filtered by selected site -->
            <div class="form-row">
              <label class="form-label">Default Map</label>
              <q-select
                v-model="settings.defaultMapName"
                :options="mapNameOptions"
                dense dark outlined
                clearable
                use-input
                input-debounce="0"
                :placeholder="settings.defaultMapName ? '' : 'Select or type a map'"
                class="form-input"
                :disable="!settings.defaultMapSite"
                :loading="loadingMaps"
                @filter="filterMaps"
              >
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey">
                      {{ settings.defaultMapSite ? 'No maps in this site' : 'Select a site first' }}
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
          </div>

          <div class="card-block q-mt-md">
            <div class="block-title">Display Options</div>
            <div class="form-row">
              <label class="form-label">Map Resolution</label>
              <div class="slider-row">
                <q-slider
                  v-model="settings.mapResolution"
                  :min="0.01" :max="0.5" :step="0.01"
                  dark color="blue-7"
                  class="flex-1"
                />
                <span class="slider-value">{{ settings.mapResolution.toFixed(2) }} m/px</span>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">Show Grid</label>
              <div class="toggle-row">
                <q-toggle v-model="settings.showGrid" color="blue-7" dark dense />
                <span class="toggle-label">{{ settings.showGrid ? 'Enabled' : 'Disabled' }}</span>
              </div>
            </div>
          </div>

          <!-- Robot Marker Image -->
          <div class="card-block q-mt-md">
            <div class="block-title">Robot Marker Image</div>
            <div class="robot-img-row">
              <div class="robot-img-preview" @click="triggerRobotImagePick">
                <img v-if="robotImgPreview || robotImgUrl" :src="robotImgPreview || robotImgUrl || ''" class="robot-img-thumb" />
                <div v-else class="robot-img-placeholder">
                  <q-icon name="smart_toy" size="28px" color="grey-6" />
                </div>
                <div class="robot-img-overlay"><q-icon name="photo_camera" size="14px" /></div>
              </div>
              <div class="robot-img-info">
                <div class="robot-img-hint">PNG only · max 128×128 px · max 200 KB<br>Replaces the green triangle on all map pages.</div>
                <div class="row q-mt-sm q-gutter-sm">
                  <q-btn unelevated dense no-caps icon="upload" label="Choose PNG" color="blue-8" size="sm" @click="triggerRobotImagePick" />
                  <q-btn v-if="robotImgFile" unelevated dense no-caps icon="check" label="Upload" color="green-8" size="sm" :loading="uploadingRobotImg" @click="uploadRobotImage" />
                  <q-btn v-if="robotImgUrl && !robotImgFile" flat dense no-caps icon="delete" label="Remove" color="red-5" size="sm" @click="removeRobotImage" />
                </div>
                <div v-if="robotImgMsg" class="robot-img-msg" :class="robotImgMsgType === 'ok' ? 'robot-msg-ok' : 'robot-msg-err'">{{ robotImgMsg }}</div>
              </div>
            </div>
            <input ref="robotImgInput" type="file" accept="image/png" class="hidden-file-input" @change="onRobotImagePicked" />
          </div>

          <!-- Advanced Map Engine Settings (collapsible) -->
          <q-expansion-item
            icon="tune"
            label="Advanced Map Engine Settings"
            header-class="adv-expansion-header"
            class="adv-expansion q-mt-md"
          >
            <div class="adv-body">

              <!-- Zoom Limits -->
              <div class="adv-group-title">Zoom Limits</div>
              <div class="form-row">
                <label class="form-label">Min Zoom</label>
                <div class="slider-row">
                  <q-slider v-model="settings.mapEngineConfig.minZoom" :min="0.05" :max="2.0" :step="0.05" dark color="blue-7" class="flex-1" />
                  <span class="slider-value">{{ settings.mapEngineConfig.minZoom.toFixed(2) }}×</span>
                </div>
              </div>
              <div class="form-row">
                <label class="form-label">Max Zoom</label>
                <div class="slider-row">
                  <q-slider v-model="settings.mapEngineConfig.maxZoom" :min="2.0" :max="30.0" :step="0.5" dark color="blue-7" class="flex-1" />
                  <span class="slider-value">{{ settings.mapEngineConfig.maxZoom.toFixed(1) }}×</span>
                </div>
              </div>

              <!-- Default Layer Visibility -->
              <div class="adv-group-title q-mt-sm">Default Layer Visibility</div>
              <div class="adv-toggles-grid">
                <div class="adv-toggle-item">
                  <q-toggle v-model="settings.mapEngineConfig.layerVisibility.map" color="blue-7" dark dense />
                  <span class="toggle-label">Map</span>
                </div>
                <div class="adv-toggle-item">
                  <q-toggle v-model="settings.mapEngineConfig.layerVisibility.robot" color="green-7" dark dense />
                  <span class="toggle-label">Robot</span>
                </div>
                <div class="adv-toggle-item">
                  <q-toggle v-model="settings.mapEngineConfig.layerVisibility.target" color="orange-7" dark dense />
                  <span class="toggle-label">Targets</span>
                </div>
                <div class="adv-toggle-item">
                  <q-toggle v-model="settings.mapEngineConfig.layerVisibility.navPath" color="purple-7" dark dense />
                  <span class="toggle-label">Nav Path</span>
                </div>
              </div>

              <!-- Robot Visualization -->
              <div class="adv-group-title q-mt-sm">Robot Visualization</div>
              <div class="form-row">
                <label class="form-label">Body Color</label>
                <div class="color-picker-row">
                  <input type="color" v-model="settings.mapEngineConfig.robotColor" class="color-swatch" />
                  <span class="color-hex">{{ settings.mapEngineConfig.robotColor }}</span>
                </div>
              </div>
              <div class="form-row">
                <label class="form-label">Radius (m)</label>
                <div class="slider-row">
                  <q-slider v-model="settings.mapEngineConfig.robotRadius" :min="0.1" :max="2.0" :step="0.05" dark color="green-7" class="flex-1" />
                  <span class="slider-value">{{ settings.mapEngineConfig.robotRadius.toFixed(2) }} m</span>
                </div>
              </div>

              <!-- Navigation Path -->
              <div class="adv-group-title q-mt-sm">Navigation Path</div>
              <div class="form-row">
                <label class="form-label">Path Color</label>
                <div class="color-picker-row">
                  <input type="color" v-model="settings.mapEngineConfig.navPathColor" class="color-swatch" />
                  <span class="color-hex">{{ settings.mapEngineConfig.navPathColor }}</span>
                </div>
              </div>
              <div class="form-row">
                <label class="form-label">Line Width</label>
                <div class="slider-row">
                  <q-slider v-model="settings.mapEngineConfig.navPathWidth" :min="1" :max="30" :step="1" dark color="purple-7" class="flex-1" />
                  <span class="slider-value">{{ settings.mapEngineConfig.navPathWidth }} px</span>
                </div>
              </div>

              <!-- Map Color Mapping (LUT) -->
              <div class="adv-group-title q-mt-sm">Map Color Mapping (LUT)</div>
              <div class="adv-lut-hint">Controls grayscale brightness of each cell type (0 = black, 255 = white)</div>
              <div class="form-row">
                <label class="form-label">Free Space</label>
                <div class="slider-row">
                  <q-slider v-model="settings.mapEngineConfig.lutFree" :min="0" :max="255" :step="1" dark color="grey-5" class="flex-1" />
                  <span class="slider-value">{{ settings.mapEngineConfig.lutFree }}</span>
                </div>
              </div>
              <div class="form-row">
                <label class="form-label">Occupied</label>
                <div class="slider-row">
                  <q-slider v-model="settings.mapEngineConfig.lutOccupied" :min="0" :max="255" :step="1" dark color="grey-5" class="flex-1" />
                  <span class="slider-value">{{ settings.mapEngineConfig.lutOccupied }}</span>
                </div>
              </div>
              <div class="form-row">
                <label class="form-label">Unknown</label>
                <div class="slider-row">
                  <q-slider v-model="settings.mapEngineConfig.lutUnknown" :min="0" :max="255" :step="1" dark color="grey-5" class="flex-1" />
                  <span class="slider-value">{{ settings.mapEngineConfig.lutUnknown }}</span>
                </div>
              </div>

              <!-- LUT Preview -->
              <div class="adv-lut-preview">
                <div class="adv-lut-swatch" :style="{ background: `rgb(${settings.mapEngineConfig.lutFree},${settings.mapEngineConfig.lutFree},${settings.mapEngineConfig.lutFree})` }">
                  <span>Free</span>
                </div>
                <div class="adv-lut-swatch" :style="{ background: `rgb(${settings.mapEngineConfig.lutOccupied},${settings.mapEngineConfig.lutOccupied},${settings.mapEngineConfig.lutOccupied})` }">
                  <span :style="{ color: settings.mapEngineConfig.lutOccupied < 128 ? '#fff' : '#000' }">Occupied</span>
                </div>
                <div class="adv-lut-swatch" :style="{ background: `rgb(${settings.mapEngineConfig.lutUnknown},${settings.mapEngineConfig.lutUnknown},${settings.mapEngineConfig.lutUnknown})` }">
                  <span :style="{ color: settings.mapEngineConfig.lutUnknown < 128 ? '#fff' : '#000' }">Unknown</span>
                </div>
              </div>

              <!-- Reset button -->
              <div class="q-mt-md">
                <q-btn flat dense no-caps icon="restore" label="Reset to Defaults" color="grey-5" size="sm" @click="resetEngineConfig" />
              </div>
            </div>
          </q-expansion-item>

          <div class="info-card q-mt-md">
            <q-icon name="info" size="16px" color="blue-5" />
            <p>Map configuration changes apply to the Navigator and Routine Planner pages after reload.<br>
               The <code>reris_controller</code> side is configured separately via the Topics tab.</p>
          </div>
        </div>

        <!-- ── Joystick ── -->
        <div v-else-if="activeTab === 'joystick'" class="tab-section">
          <div class="section-header">
            <q-icon name="sports_esports" size="22px" class="section-icon" color="green-5" />
            <span class="section-title">Joystick Configuration</span>
          </div>

          <div class="card-block">
            <div class="block-title">Drive Mode</div>
            <div class="form-row">
              <label class="form-label">Kinematics</label>
              <div style="display:flex;gap:10px;flex:1;">
                <button
                  v-for="mode in ['omni', 'differential']"
                  :key="mode"
                  class="mode-btn"
                  :class="{ 'mode-btn--active': settings.joystickConfig.mode === mode }"
                  :disabled="isReadOnly"
                  @click="settings.joystickConfig.mode = mode as 'omni' | 'differential'"
                >
                  <q-icon :name="mode === 'omni' ? 'open_with' : 'import_export'" size="18px" />
                  {{ mode === 'omni' ? 'Omni-Directional' : 'Differential Drive' }}
                </button>
              </div>
            </div>
            <div class="info-card q-mt-sm" style="margin-top:8px;">
              <q-icon name="info" size="16px" color="blue-5" />
              <p v-if="settings.joystickConfig.mode === 'omni'">
                <strong>Omni:</strong> Left joystick controls VX/VY (strafe). Right joystick controls angular (omega).
              </p>
              <p v-else>
                <strong>Differential:</strong> Single left joystick — up/down = linear velocity, left/right = angular velocity.
              </p>
            </div>
          </div>

          <div class="card-block q-mt-md">
            <div class="block-title">Velocity Limits</div>
            <div class="form-row">
              <label class="form-label">Max Linear (m/s)</label>
              <div class="slider-row">
                <q-slider v-model="settings.joystickConfig.maxLinear" :min="0.05" :max="2.0" :step="0.05" dark color="green-7" class="flex-1" :disable="isReadOnly" />
                <span class="slider-value">{{ settings.joystickConfig.maxLinear.toFixed(2) }} m/s</span>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">Max Angular (rad/s)</label>
              <div class="slider-row">
                <q-slider v-model="settings.joystickConfig.maxAngular" :min="0.05" :max="3.14" :step="0.05" dark color="orange-7" class="flex-1" :disable="isReadOnly" />
                <span class="slider-value">{{ settings.joystickConfig.maxAngular.toFixed(2) }} rad/s</span>
              </div>
            </div>
          </div>

          <div class="info-card q-mt-md">
            <q-icon name="info" size="16px" color="blue-5" />
            <p>These limits are applied by <code>reris_engine</code> when scaling joystick input to <code>cmd_vel</code>. Click <strong>Save All</strong> to persist and then restart <code>reris_controller</code> to apply.</p>
          </div>
        </div>

        <!-- ── Connections ── -->
        <div v-else-if="activeTab === 'connections'" class="tab-section">
          <div class="section-header">
            <q-icon name="cable" size="22px" class="section-icon" color="green-5" />
            <span class="section-title">Connections</span>
            <q-btn flat dense round icon="refresh" color="grey-5" @click="checkConnections" class="q-ml-auto">
              <q-tooltip>Refresh</q-tooltip>
            </q-btn>
          </div>

          <!-- Connection status table -->
          <div class="card-block">
            <div class="block-title">Service Status</div>
            <div class="conn-table-header">
              <span>Service</span>
              <span>Endpoint</span>
              <span>Status</span>
              <span class="col-right">Latency</span>
            </div>

            <div v-for="conn in connections" :key="conn.name" class="conn-row">
              <div class="conn-name-cell">
                <div class="conn-dot" :class="`conn-dot--${conn.status}`"></div>
                <div class="conn-info">
                  <span class="conn-service">{{ conn.name }}</span>
                  <span class="conn-desc">{{ conn.description }}</span>
                </div>
              </div>
              <span class="conn-endpoint">{{ conn.endpoint }}</span>
              <span class="conn-status-cell">
                <q-chip
                  dense
                  :color="conn.status === 'online' ? 'green-9' : conn.status === 'checking' ? 'orange-9' : 'red-9'"
                  text-color="white"
                  size="sm"
                >
                  <q-spinner v-if="conn.status === 'checking'" size="10px" class="q-mr-xs" />
                  {{ conn.status === 'online' ? 'Online' : conn.status === 'checking' ? 'Checking…' : 'Offline' }}
                </q-chip>
              </span>
              <div class="conn-latency col-right">
                <span v-if="conn.latencyMs !== null" :class="conn.latencyMs < 50 ? 'latency-good' : 'latency-slow'">
                  {{ conn.latencyMs }} ms
                </span>
                <span v-else class="latency-na">—</span>
              </div>
            </div>
          </div>

          <!-- Editable endpoints — admin only -->
          <div class="card-block q-mt-md">
            <div class="block-title-row">
              <span class="block-title" style="margin-bottom:0">Endpoint Configuration</span>
              <div v-if="isReadOnly" class="admin-badge"><q-icon name="lock" size="13px" />Admin Only</div>
            </div>
            <div class="q-mt-md">
              <div class="form-row">
                <label class="form-label">API Endpoint</label>
                <q-input v-model="settings.apiEndpoint" dense dark outlined class="form-input"
                  placeholder="http://localhost:5184" :disable="isReadOnly" />
              </div>
              <div class="form-row">
                <label class="form-label">WebSocket</label>
                <q-input v-model="settings.wsEndpoint" dense dark outlined class="form-input"
                  placeholder="ws://localhost:8441" :disable="isReadOnly" />
              </div>
              <div class="form-row">
                <label class="form-label">MongoDB URI</label>
                <q-input v-model="settings.mongodbUri" dense dark outlined class="form-input"
                  placeholder="mongodb://127.0.0.1:27017" :disable="isReadOnly" />
              </div>
            </div>
          </div>
        </div>

        <!-- ── Topics ── -->
        <div v-else-if="activeTab === 'topics'" class="tab-section">
          <div class="section-header">
            <q-icon name="device_hub" size="22px" class="section-icon" color="purple-5" />
            <span class="section-title">ROS 2 Topic Configuration</span>
            <div v-if="isReadOnly" class="admin-badge q-ml-auto"><q-icon name="lock" size="13px" />Admin Only</div>
          </div>

          <div class="info-card q-mb-md">
            <q-icon name="info" size="16px" color="blue-5" />
            <p>Topic names are saved to MongoDB and written to <code>config/configuration.yaml</code>. Clicking Save signals all <code>reris_controller</code> nodes to reload topics instantly — no restart needed.
               Shared topics (arrow notation <code>PUB → SUB</code>) must match across all nodes.</p>
          </div>

          <!-- Core Robot Topics -->
          <div class="card-block">
            <div class="block-title">Core Robot Topics</div>
            <div class="topic-table-header">
              <span>Label</span>
              <span>Topic Name</span>
              <span>Msg Type</span>
              <span>Used By</span>
            </div>
            <div v-for="row in CORE_TOPIC_ROWS" :key="row.key" class="topic-row">
              <div class="topic-label-cell">
                <q-badge :color="dirColor(row.dirs)" class="dir-badge">{{ row.dirs }}</q-badge>
                <span class="topic-label">{{ row.label }}</span>
              </div>
              <q-input
                :model-value="topicVal(row.key)"
                dense dark outlined
                class="topic-input"
                :placeholder="row.default"
                :disable="isReadOnly"
                @update:model-value="v => setTopicVal(row.key, String(v))"
              />
              <span class="topic-type">{{ row.type }}</span>
              <span class="topic-used">{{ row.usedBy }}</span>
            </div>
          </div>

          <!-- RERIS Internal Topics -->
          <div class="card-block q-mt-md">
            <div class="block-title">RERIS Internal Topics</div>
            <div class="topic-table-header">
              <span>Label</span>
              <span>Topic Name</span>
              <span>Msg Type</span>
              <span>Used By</span>
            </div>
            <div v-for="row in INTERNAL_TOPIC_ROWS" :key="row.key" class="topic-row">
              <div class="topic-label-cell">
                <q-badge :color="dirColor(row.dirs)" class="dir-badge">{{ row.dirs }}</q-badge>
                <span class="topic-label">{{ row.label }}</span>
              </div>
              <q-input
                v-model="settings.topicConfig[row.key]"
                dense dark outlined
                class="topic-input"
                :placeholder="row.default"
                :disable="isReadOnly"
              />
              <span class="topic-type">{{ row.type }}</span>
              <span class="topic-used">{{ row.usedBy }}</span>
            </div>
          </div>
        </div>

        <!-- ── Ban ── -->
        <div v-else-if="activeTab === 'ban'" class="tab-section">
          <div class="section-header">
            <q-icon name="block" size="22px" class="section-icon" color="red-5" />
            <span class="section-title">IP Bans</span>
            <div v-if="isReadOnly" class="admin-badge q-ml-sm"><q-icon name="lock" size="13px" />Admin Only</div>
          </div>

          <div class="card-block">
            <div class="block-title">Banned IP Addresses</div>

            <div v-if="settings.bannedIps.length === 0" class="table-empty">
              <q-icon name="shield_moon" size="36px" color="green-7" />
              <p>No IP bans configured. System is open to all network sources.</p>
            </div>

            <div v-else class="ip-list">
              <div
                v-for="(ip, idx) in settings.bannedIps"
                :key="idx"
                class="ip-row"
              >
                <q-icon name="block" size="16px" color="red-5" />
                <span class="ip-text">{{ ip }}</span>
                <q-btn
                  flat round dense
                  icon="close"
                  size="xs"
                  color="grey-6"
                  :disable="isReadOnly"
                  @click="removeIp(idx)"
                />
              </div>
            </div>

            <q-separator dark class="q-my-md" />

            <div class="ban-input-row">
              <q-input
                v-model="newBanIp"
                dense dark outlined
                placeholder="e.g. 192.168.1.100 or 10.0.0.0/24"
                class="form-input"
                :disable="isReadOnly"
                @keyup.enter="addIp"
              />
              <q-btn
                unelevated label="Add Ban"
                icon="add"
                color="red-8"
                class="ban-btn"
                :disable="isReadOnly || !newBanIp.trim()"
                @click="addIp"
              />
            </div>
          </div>
        </div>

        <!-- ── Security ── -->
        <div v-else-if="activeTab === 'security'" class="tab-section">
          <div class="section-header">
            <q-icon name="security" size="22px" class="section-icon" color="orange-5" />
            <span class="section-title">Security Settings</span>
            <div v-if="isReadOnly" class="admin-badge q-ml-auto"><q-icon name="lock" size="13px" />Admin Only</div>
          </div>

          <div class="card-block">
            <div class="block-title">Access Control</div>
            <div class="form-row">
              <label class="form-label">CORS Origins</label>
              <div class="cors-col">
                <div v-for="(origin, idx) in settings.corsOrigins" :key="idx" class="cors-row">
                  <q-input
                    v-model="settings.corsOrigins[idx]"
                    dense dark outlined
                    placeholder="https://example.com"
                    class="form-input"
                    :disable="isReadOnly"
                  />
                  <q-btn
                    flat round dense icon="close"
                    size="xs" color="grey-6"
                    :disable="isReadOnly"
                    @click="removeCors(idx)"
                  />
                </div>
                <q-btn
                  flat dense
                  label="Add Origin"
                  icon="add"
                  color="blue-5"
                  size="sm"
                  :disable="isReadOnly"
                  @click="addCors"
                />
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">JWT Expiry</label>
              <div class="slider-row">
                <q-slider
                  v-model="settings.jwtExpiryHours"
                  :min="1" :max="720" :step="1"
                  dark color="orange-7"
                  class="flex-1"
                  :disable="isReadOnly"
                />
                <span class="slider-value">{{ settings.jwtExpiryHours }}h</span>
              </div>
            </div>
          </div>

          <div class="card-block q-mt-md">
            <div class="block-title">System Info</div>
            <div class="sys-info-row">
              <span class="sys-key">API Version</span>
              <span class="sys-val">rebot-api v1.0</span>
            </div>
            <div class="sys-info-row">
              <span class="sys-key">MongoDB</span>
              <span class="sys-val">{{ settings.mongodbUri }}</span>
            </div>
            <div class="sys-info-row">
              <span class="sys-key">Auth Method</span>
              <span class="sys-val">Bearer Token (SHA-256 + GUID)</span>
            </div>
            <div class="sys-info-row">
              <span class="sys-key">Last Updated</span>
              <span class="sys-val">{{ settingsUpdatedAt }}</span>
            </div>
          </div>

          <div class="info-card q-mt-md">
            <q-icon name="warning" size="16px" color="orange-5" />
            <p>Changing JWT expiry or CORS settings requires restarting <code>rebot-api</code> to take effect.</p>
          </div>
        </div>

      </div><!-- /settings-content -->
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import axios from 'axios'
import { server_api_config, server_websocket_config } from 'src/configs/server'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TopicConfig {
  mapTopic: string
  odomTopic: string
  planTopic: string
  cmdVelTopic: string
  poseWithActionArrayTopic: string
  plannerInfoTopic: string
  selectedMapPathsTopic: string
  plannerCurrentGoalTopic: string
  routinesPlanTopic: string
}

interface MapEngineLayerVisibility {
  map: boolean; robot: boolean; target: boolean; navPath: boolean
}
interface MapEngineConfig {
  minZoom: number; maxZoom: number
  layerVisibility: MapEngineLayerVisibility
  robotColor: string; robotRadius: number
  navPathColor: string; navPathWidth: number
  lutFree: number; lutOccupied: number; lutUnknown: number
}

interface JoystickConfig {
  mode: 'omni' | 'differential'
  maxLinear: number
  maxAngular: number
}

interface SettingsModel {
  defaultMapSite: string | null
  defaultMapName: string | null
  mapResolution: number
  showGrid: boolean
  apiEndpoint: string
  wsEndpoint: string
  mongodbUri: string
  corsOrigins: string[]
  jwtExpiryHours: number
  bannedIps: string[]
  topicConfig: TopicConfig
  mapEngineConfig: MapEngineConfig
  joystickConfig: JoystickConfig
  updatedAt?: string
}

interface ConnectionRow {
  name: string
  description: string
  endpoint: string
  status: 'online' | 'offline' | 'checking'
  latencyMs: number | null
}

interface MapListItem {
  map_sites: { site_name: string; map: { map_name: string }[] }
}

// ── Topic table definitions ────────────────────────────────────────────────────
const CORE_TOPIC_ROWS = [
  { key: 'mapTopic',     label: 'Map',              default: '/map',      type: 'OccupancyGrid', dirs: 'SUB',     usedBy: 'engine, manager' },
  { key: 'odomTopic',    label: 'Odometry',         default: '/odom',     type: 'Odometry',      dirs: 'SUB',     usedBy: 'engine, planner' },
  { key: 'planTopic',    label: 'Nav2 Path',        default: '/plan',     type: 'Path',          dirs: 'SUB',     usedBy: 'engine' },
  { key: 'cmdVelTopic',  label: 'Command Velocity', default: '/cmd_vel',  type: 'Twist',         dirs: 'PUB',     usedBy: 'engine' },
] as const

const INTERNAL_TOPIC_ROWS = [
  { key: 'poseWithActionArrayTopic', label: 'Pose + Action Array',  default: '/pose_with_action_array',      type: 'PoseWithActionArray', dirs: 'PUB→SUB', usedBy: 'engine → planner' },
  { key: 'plannerInfoTopic',         label: 'Planner Info',         default: '/reris/planner/info',          type: 'Float32MultiArray',   dirs: 'PUB→SUB', usedBy: 'planner → engine' },
  { key: 'selectedMapPathsTopic',    label: 'Selected Map Paths',   default: '/selected_map_paths',          type: 'String',              dirs: 'PUB→SUB', usedBy: 'manager → engine' },
  { key: 'plannerCurrentGoalTopic',  label: 'Planner Current Goal', default: '/reris/planner/current_goal',  type: 'PoseStamped',         dirs: 'PUB',     usedBy: 'planner' },
  { key: 'routinesPlanTopic',        label: 'Routines Plan',        default: '/reris_planner/plan/routines', type: 'PoseWithActionArray', dirs: 'PUB',     usedBy: 'planner' },
] as const

function topicVal(key: string): string {
  return (settings.value.topicConfig as Record<string, string>)[key] ?? ''
}
function setTopicVal(key: string, val: string) {
  (settings.value.topicConfig as Record<string, string>)[key] = val
}

function dirColor(dirs: string): string {
  if (dirs === 'PUB') return 'green-9'
  if (dirs === 'SUB') return 'blue-9'
  return 'purple-9'
}

// ── State ─────────────────────────────────────────────────────────────────────
const DEFAULT_JOYSTICK_CONFIG: JoystickConfig = {
  mode: 'omni',
  maxLinear: 0.5,
  maxAngular: 0.8,
}

const DEFAULT_MAP_ENGINE_CONFIG: MapEngineConfig = {
  minZoom: 0.1, maxZoom: 10.0,
  layerVisibility: { map: true, robot: true, target: true, navPath: true },
  robotColor: '#00ff00', robotRadius: 0.25,
  navPathColor: '#4285F4', navPathWidth: 15,
  lutFree: 240, lutOccupied: 0, lutUnknown: 127,
}

const DEFAULT_TOPIC_CONFIG: TopicConfig = {
  mapTopic: '/map',
  odomTopic: '/odom',
  planTopic: '/plan',
  cmdVelTopic: '/cmd_vel',
  poseWithActionArrayTopic: '/pose_with_action_array',
  plannerInfoTopic: '/reris/planner/info',
  selectedMapPathsTopic: '/selected_map_paths',
  plannerCurrentGoalTopic: '/reris/planner/current_goal',
  routinesPlanTopic: '/reris_planner/plan/routines',
}

const profile = ref<{ username: string; role: string; selectedMapSite?: string; selectedMapName?: string }>({ username: '', role: 'viewer' })
const savingMapSelection = ref(false)
const mapSelectionMsg    = ref('')
let _mapSelWatchEnabled  = false
const settings = ref<SettingsModel>({
  defaultMapSite: null, defaultMapName: null,
  mapResolution: 0.05, showGrid: true,
  apiEndpoint: `http://${server_api_config.ip}:${server_api_config.port}`,
  wsEndpoint: `ws://${server_api_config.ip}:8441`,
  mongodbUri: 'mongodb://127.0.0.1:27017',
  corsOrigins: ['*'], jwtExpiryHours: 24, bannedIps: [],
  topicConfig: { ...DEFAULT_TOPIC_CONFIG },
  mapEngineConfig: { ...DEFAULT_MAP_ENGINE_CONFIG, layerVisibility: { ...DEFAULT_MAP_ENGINE_CONFIG.layerVisibility } },
  joystickConfig: { ...DEFAULT_JOYSTICK_CONFIG },
})

const savingAll   = ref(false)
const newBanIp    = ref('')

// ── Robot image upload ─────────────────────────────────────────────────────────
const robotImgInput      = ref<HTMLInputElement | null>(null)
const robotImgFile       = ref<File | null>(null)
const robotImgPreview    = ref<string | null>(null)
const robotImgUrl        = ref<string | null>(null)
const uploadingRobotImg  = ref(false)
const robotImgMsg        = ref('')
const robotImgMsgType    = ref<'ok'|'err'>('ok')
const activeTab   = ref('connections')
const loadingMaps = ref(false)
const mapRawData  = ref<MapListItem[]>([])
const mapSiteOptions      = ref<string[]>([])
const mapNameOptions      = ref<string[]>([])

const isReadOnly = computed(() => profile.value.role !== 'admin')

const connections = ref<ConnectionRow[]>([
  { name: 'rebot-api',    description: 'REST API / Auth',        endpoint: '', status: 'checking', latencyMs: null },
  { name: 'reris_engine', description: 'Robot WebSocket Bridge', endpoint: '', status: 'checking', latencyMs: null },
  { name: 'MongoDB',      description: 'Database',               endpoint: 'mongodb://127.0.0.1:27017', status: 'checking', latencyMs: null },
  { name: 'ROS 2',        description: 'Map + Odom topics',      endpoint: '', status: 'checking', latencyMs: null },
])

const tabs = [
  { key: 'mapconfig',   label: 'Map Configuration', icon: 'map',        adminOnly: false },
  { key: 'joystick',    label: 'Joystick',           icon: 'sports_esports', adminOnly: false },
  { key: 'connections', label: 'Connections',        icon: 'cable',      adminOnly: true  },
  { key: 'topics',      label: 'Topics',             icon: 'device_hub', adminOnly: true  },
  { key: 'ban',         label: 'Ban',                icon: 'block',      adminOnly: true  },
  { key: 'security',    label: 'Security',           icon: 'security',   adminOnly: true  },
]

const settingsUpdatedAt = computed(() =>
  settings.value.updatedAt
    ? new Date(settings.value.updatedAt).toLocaleString('en-GB')
    : '—'
)

const api     = () => `http://${server_api_config.ip}:${server_api_config.port}`
const authHdr = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` })

// ── Map combobox helpers ───────────────────────────────────────────────────────
function allSiteNames(): string[] {
  return mapRawData.value.map(x => x.map_sites.site_name)
}

function mapsForSite(site: string | null): string[] {
  if (!site) return []
  const entry = mapRawData.value.find(x => x.map_sites.site_name === site)
  return entry ? entry.map_sites.map.map(m => m.map_name) : []
}

function filterSites(val: string, update: (fn: () => void) => void) {
  update(() => {
    const needle = val.toLowerCase()
    mapSiteOptions.value = allSiteNames().filter(s => s.toLowerCase().includes(needle))
  })
}

function filterMaps(val: string, update: (fn: () => void) => void) {
  update(() => {
    const needle = val.toLowerCase()
    mapNameOptions.value = mapsForSite(settings.value.defaultMapSite)
      .filter(m => m.toLowerCase().includes(needle))
  })
}

async function loadMapOptions() {
  loadingMaps.value = true
  try {
    const res = await axios.get(`${api()}/api/map/list`, { headers: authHdr() })
    mapRawData.value = (res.data as MapListItem[]) ?? []
    mapSiteOptions.value = allSiteNames()
    mapNameOptions.value = mapsForSite(settings.value.defaultMapSite)
  } catch (e) {
    console.warn('[Settings] loadMapOptions failed', e)
  } finally {
    loadingMaps.value = false
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadProfile() {
  try {
    const res = await axios.post(`${api()}/api/auth/profile`, {}, { headers: authHdr() })
    const d = res.data
    profile.value = {
      username:          d.username          || d.Username          || '',
      role:              d.role              || 'viewer',
      selectedMapSite:   d.selectedMapSite   || d.SelectedMapSite   || undefined,
      selectedMapName:   d.selectedMapName   || d.SelectedMapName   || undefined,
    }
  } catch (e: unknown) {
    console.warn('[Settings] loadProfile failed', e)
  }
}

async function loadSettings() {
  try {
    const res = await axios.get(`${api()}/api/settings`, { headers: authHdr() })
    const d = res.data
    settings.value = {
      defaultMapSite: d.defaultMapSite ?? null,
      defaultMapName: d.defaultMapName ?? null,
      mapResolution:  d.mapResolution  ?? 0.05,
      showGrid:       d.showGrid       ?? true,
      apiEndpoint:    d.apiEndpoint    ?? settings.value.apiEndpoint,
      wsEndpoint:     d.wsEndpoint     ?? settings.value.wsEndpoint,
      mongodbUri:     d.mongodbUri     ?? settings.value.mongodbUri,
      corsOrigins:    d.corsOrigins    ?? ['*'],
      jwtExpiryHours: d.jwtExpiryHours ?? 24,
      bannedIps:      d.bannedIps      ?? [],
      topicConfig:    { ...DEFAULT_TOPIC_CONFIG, ...(d.topicConfig ?? {}) },
      mapEngineConfig: {
        ...DEFAULT_MAP_ENGINE_CONFIG,
        ...(d.mapEngineConfig ?? {}),
        layerVisibility: { ...DEFAULT_MAP_ENGINE_CONFIG.layerVisibility, ...(d.mapEngineConfig?.layerVisibility ?? {}) },
      },
      joystickConfig: { ...DEFAULT_JOYSTICK_CONFIG, ...(d.joystickConfig ?? {}) },
      updatedAt:      d.updatedAt,
    }
    // User's personal selection overrides system default
    if (profile.value.selectedMapSite) settings.value.defaultMapSite = profile.value.selectedMapSite
    if (profile.value.selectedMapName) settings.value.defaultMapName = profile.value.selectedMapName
    // Refresh map name list once we know the saved site
    mapNameOptions.value = mapsForSite(settings.value.defaultMapSite)
  } catch (e: unknown) {
    console.warn('[Settings] loadSettings failed', e)
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveAllSettings() {
  savingAll.value = true
  try {
    await axios.patch(`${api()}/api/settings`, settings.value, { headers: authHdr() })
    settings.value.updatedAt = new Date().toISOString()
    // Persist map engine config to localStorage so MapAsset picks it up on next load
    localStorage.setItem('mapEngineConfig', JSON.stringify(settings.value.mapEngineConfig))
    // Write configuration.yaml and signal all ROS nodes to reload topics
    await axios.post(`${api()}/api/settings/apply-topics`, {}, { headers: authHdr() })
  } catch (e) {
    console.warn('[Settings] save failed', e)
  } finally {
    savingAll.value = false
  }
}

function resetEngineConfig() {
  settings.value.mapEngineConfig = {
    ...DEFAULT_MAP_ENGINE_CONFIG,
    layerVisibility: { ...DEFAULT_MAP_ENGINE_CONFIG.layerVisibility },
  }
}

// ── Connection checks ─────────────────────────────────────────────────────────
async function checkConnections() {
  connections.value.forEach(c => { c.status = 'checking'; c.latencyMs = null })

  const wsIp = server_websocket_config.ip

  connections.value[0]!.endpoint = settings.value.apiEndpoint
  connections.value[1]!.endpoint = `http://${wsIp}:${server_websocket_config.healthPort}/health`
  connections.value[2]!.endpoint = settings.value.mongodbUri
  connections.value[3]!.endpoint = `ws://${wsIp}:${server_websocket_config.telemetryPort}`

  // rebot-api
  try {
    const t0 = Date.now()
    await fetch(`${api()}/api/auth/profile`, { method: 'POST', headers: authHdr() })
    connections.value[0]!.status    = 'online'
    connections.value[0]!.latencyMs = Date.now() - t0
  } catch {
    connections.value[0]!.status = 'offline'
  }

  // reris_engine health
  try {
    const t0  = Date.now()
    const res = await fetch(
      `http://${wsIp}:${server_websocket_config.healthPort}/health`,
      { signal: AbortSignal.timeout(3000) }
    )
    const health = await res.json() as {
      status: string; uptime_s: number
      telemetry_clients: number; map_clients: number
      ros_map: boolean; ros_odom: boolean
    }
    const lat = Date.now() - t0
    connections.value[1]!.status      = health.status === 'ok' ? 'online' : 'offline'
    connections.value[1]!.latencyMs   = lat
    connections.value[1]!.description =
      `${health.telemetry_clients} telemetry · ${health.map_clients} map · uptime ${health.uptime_s}s`

    const bothUp = health.ros_map && health.ros_odom
    const anyUp  = health.ros_map || health.ros_odom
    connections.value[3]!.status      = bothUp ? 'online' : anyUp ? 'checking' : 'offline'
    connections.value[3]!.latencyMs   = null
    connections.value[3]!.description =
      `Map: ${health.ros_map ? 'active' : 'offline'} · Odom: ${health.ros_odom ? 'active' : 'offline'}`
  } catch {
    connections.value[1]!.status = 'offline'
    connections.value[3]!.status = 'offline'
  }

  // MongoDB — proxied
  connections.value[2]!.status    = connections.value[0]!.status === 'online' ? 'online' : 'offline'
  connections.value[2]!.latencyMs = connections.value[0]!.latencyMs
}

// ── IP Bans ───────────────────────────────────────────────────────────────────
function addIp() {
  const ip = newBanIp.value.trim()
  if (ip && !settings.value.bannedIps.includes(ip)) {
    settings.value.bannedIps.push(ip)
    newBanIp.value = ''
  }
}

function removeIp(idx: number) {
  settings.value.bannedIps.splice(idx, 1)
}

// ── CORS ──────────────────────────────────────────────────────────────────────
function addCors() {
  settings.value.corsOrigins.push('')
}

function removeCors(idx: number) {
  settings.value.corsOrigins.splice(idx, 1)
}

// ── Robot image helpers ────────────────────────────────────────────────────────
function triggerRobotImagePick() {
  robotImgInput.value?.click()
}

function onRobotImagePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.type !== 'image/png') {
    robotImgMsg.value = 'Only PNG files are allowed'
    robotImgMsgType.value = 'err'
    return
  }
  if (file.size > 204_800) {
    robotImgMsg.value = 'File too large (max 200 KB)'
    robotImgMsgType.value = 'err'
    return
  }
  robotImgFile.value = file
  robotImgPreview.value = URL.createObjectURL(file)
  robotImgMsg.value = ''
}

async function uploadRobotImage() {
  if (!robotImgFile.value) return
  uploadingRobotImg.value = true
  robotImgMsg.value = ''
  try {
    const form = new FormData()
    form.append('robotImage', robotImgFile.value)
    await axios.post(`${api()}/api/system/robot-image`, form, {
      headers: { ...authHdr(), 'Content-Type': 'multipart/form-data' },
    })
    // Commit preview as the active URL (cache-bust)
    robotImgUrl.value = `${api()}/api/system/robot-image?v=${Date.now()}`
    robotImgPreview.value = null
    robotImgFile.value = null
    if (robotImgInput.value) robotImgInput.value.value = ''
    robotImgMsg.value = 'Robot image uploaded! Reload map pages to see it.'
    robotImgMsgType.value = 'ok'
  } catch (err: unknown) {
    const msg = axios.isAxiosError(err) ? (err.response?.data as { Message?: string })?.Message : undefined
    robotImgMsg.value = msg ?? 'Upload failed'
    robotImgMsgType.value = 'err'
  } finally {
    uploadingRobotImg.value = false
    setTimeout(() => { robotImgMsg.value = '' }, 5000)
  }
}

async function removeRobotImage() {
  try {
    await axios.delete(`${api()}/api/system/robot-image`, { headers: authHdr() })
  } catch (err: unknown) {
    const msg = axios.isAxiosError(err) ? (err.response?.data as { Message?: string })?.Message : undefined
    robotImgMsg.value = msg ?? 'Remove failed'
    robotImgMsgType.value = 'err'
    setTimeout(() => { robotImgMsg.value = '' }, 4000)
    return
  }
  robotImgUrl.value = null
  robotImgPreview.value = null
  robotImgFile.value = null
  robotImgMsg.value = 'Robot image removed. Default triangle will be used.'
  robotImgMsgType.value = 'ok'
  setTimeout(() => { robotImgMsg.value = '' }, 4000)
}

async function checkRobotImageExists() {
  try {
    const res = await fetch(`${api()}/api/system/robot-image`)
    if (res.ok) robotImgUrl.value = `${api()}/api/system/robot-image`
  } catch {
    robotImgUrl.value = null
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
async function saveMapSelection(site: string | null, name: string | null) {
  if (!site || !name) return
  savingMapSelection.value = true
  mapSelectionMsg.value = ''
  try {
    await axios.patch(`${api()}/api/user/select-map`, { mapSite: site, mapName: name }, { headers: authHdr() })
    mapSelectionMsg.value = 'Saved'
    setTimeout(() => { mapSelectionMsg.value = '' }, 2000)
  } catch (e) {
    mapSelectionMsg.value = 'Save failed'
    console.warn('[Settings] saveMapSelection failed', e)
  } finally {
    savingMapSelection.value = false
  }
}

watch(
  () => [settings.value.defaultMapSite, settings.value.defaultMapName] as [string | null, string | null],
  ([site, name]) => {
    if (!_mapSelWatchEnabled) return
    void saveMapSelection(site, name)
  }
)

onMounted(async () => {
  await loadProfile()
  await Promise.all([loadSettings(), loadMapOptions(), checkRobotImageExists()])
  _mapSelWatchEnabled = true
  await checkConnections()
})
</script>

<style scoped>
@font-face {
  font-family: 'RedHatDisplay';
  src: url('~assets/fonts/Red_Hat_Display/RedHatDisplay-VariableFont_wght.ttf') format('truetype');
}

/* ── Layout ── */
.settings-page {
  flex: 1;
  min-height: 0;
  background: #1c1c1e;
  font-family: 'RedHatDisplay', sans-serif;
}

.settings-layout {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ── Sidebar ── */
.settings-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #111;
  border-right: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px 16px 16px;
  font-size: 15px;
  font-weight: 700;
  color: #f5f5f7;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.settings-nav {
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  color: #8e8e93;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.18s;
}
.nav-item:hover { background: rgba(255,255,255,0.06); color: #f5f5f7; }
.nav-item--active { background: rgba(10,132,255,0.18); color: #0a84ff; }

.lock-icon { color: #636366; }

.settings-footer {
  padding: 12px 14px;
  border-top: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.save-all-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 36px;
  background: #1ecf61;
  border: none;
  border-radius: 8px;
  color: #0d1f12;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s;
  letter-spacing: .02em;
}
.save-all-btn:hover:not(:disabled) { background: #1bdb6a; }
.save-all-btn:disabled { opacity: .38; cursor: not-allowed; }

.mode-btn {
  flex: 1; display:flex; align-items:center; justify-content:center; gap:6px;
  height:40px; border-radius:8px; border:1px solid #333; background:#1a1a1a;
  color:#aaa; font-size:13px; font-weight:500; cursor:pointer; transition:all .15s;
}
.mode-btn--active { border-color:#1ecf61; background:rgba(30,207,97,.1); color:#1ecf61; }
.mode-btn:hover:not(:disabled):not(.mode-btn--active) { background:#222; color:#eee; }
.mode-btn:disabled { opacity:.4; cursor:not-allowed; }

.save-spinner {
  width: 13px;
  height: 13px;
  animation: sp 0.8s linear infinite;
}
@keyframes sp { to { transform: rotate(360deg); } }

.admin-hint {
  font-size: 11px;
  color: #636366;
  text-align: center;
}

/* ── Content ── */
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
}

.tab-section { max-width: 800px; }

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}

.section-icon { color: #0a84ff; }

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: #f5f5f7;
}

/* ── Admin badge ── */
.admin-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #636366;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  padding: 3px 8px;
}

/* ── Card blocks ── */
.card-block {
  background: #2c2c2e;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  padding: 20px 24px;
}

.block-title {
  font-size: 12px;
  font-weight: 700;
  color: #8e8e93;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 16px;
}

.block-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
}

/* ── Form rows ── */
.form-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.form-label {
  width: 140px;
  flex-shrink: 0;
  font-size: 13px;
  color: #aeaeb2;
  padding-top: 10px;
}

.form-input { flex: 1; }

:deep(.form-input .q-field__control),
:deep(.topic-input .q-field__control) {
  background: #1c1c1e;
  border-color: rgba(255,255,255,0.12);
}

:deep(.form-input .q-field__native),
:deep(.form-input input),
:deep(.topic-input .q-field__native),
:deep(.topic-input input) { color: #f5f5f7; font-size: 13px; }

:deep(.q-field--disabled .q-field__native) { color: #636366 !important; }

/* q-select dark popup */
:deep(.q-menu) { background: #2c2c2e; }
:deep(.q-item) { color: #f5f5f7; }
:deep(.q-item:hover) { background: rgba(255,255,255,0.06); }

/* ── Slider ── */
.slider-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 6px;
}

.flex-1 { flex: 1; }

.slider-value {
  width: 64px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: #f5f5f7;
}

/* ── Toggle ── */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 6px;
}

.toggle-label { font-size: 13px; color: #aeaeb2; }

/* ── Info card ── */
.info-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  background: rgba(10,132,255,0.08);
  border: 1px solid rgba(10,132,255,0.2);
  border-radius: 10px;
  font-size: 13px;
  color: #8e8e93;
  line-height: 1.6;
}

.info-card p { margin: 0; }

.info-card code {
  background: rgba(255,255,255,0.1);
  padding: 1px 5px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  color: #0a84ff;
}

/* ── Connection Table ── */
.conn-table-header {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.8fr 100px;
  gap: 8px;
  background: #3a3a3c;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #8e8e93;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.conn-row {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.8fr 100px;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: background 0.15s;
  margin-bottom: 4px;
}

.conn-row:hover { background: rgba(255,255,255,0.04); }

.conn-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.conn-dot--online   { background: #30d158; box-shadow: 0 0 6px rgba(48,209,88,0.6); }
.conn-dot--offline  { background: #ff453a; }
.conn-dot--checking { background: #ff9f0a; animation: pulse 1s infinite; }

@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

.conn-info { display: flex; flex-direction: column; }
.conn-service { font-size: 13px; font-weight: 700; color: #f5f5f7; }
.conn-desc    { font-size: 11px; color: #8e8e93; }
.conn-endpoint { font-size: 12px; color: #636366; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conn-status-cell, .conn-latency { display: flex; align-items: center; }
.col-right { justify-content: flex-end; }

.latency-good { font-size: 13px; font-weight: 600; color: #30d158; }
.latency-slow { font-size: 13px; font-weight: 600; color: #ff9f0a; }
.latency-na   { font-size: 13px; color: #636366; }

/* ── Topic Table ── */
.topic-table-header {
  display: grid;
  grid-template-columns: 1.6fr 1.8fr 1fr 1fr;
  gap: 8px;
  background: #3a3a3c;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #8e8e93;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.topic-row {
  display: grid;
  grid-template-columns: 1.6fr 1.8fr 1fr 1fr;
  gap: 8px;
  align-items: center;
  padding: 8px 14px;
  border-radius: 10px;
  transition: background 0.15s;
  margin-bottom: 4px;
}

.topic-row:hover { background: rgba(255,255,255,0.03); }

.topic-label-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dir-badge { font-size: 10px; font-weight: 700; border-radius: 5px; padding: 2px 6px; }

.topic-label { font-size: 13px; color: #f5f5f7; font-weight: 500; }

.topic-input { }

.topic-type {
  font-size: 11px;
  font-family: monospace;
  color: #8e8e93;
}

.topic-used {
  font-size: 11px;
  color: #636366;
}

/* ── IP Bans ── */
.ip-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }

.ip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(255,69,58,0.08);
  border: 1px solid rgba(255,69,58,0.15);
  border-radius: 8px;
}

.ip-text { flex: 1; font-family: monospace; font-size: 13px; color: #f5f5f7; }

.ban-input-row { display: flex; gap: 12px; align-items: flex-start; }

.ban-btn {
  border-radius: 10px;
  padding: 8px 20px;
  font-weight: 600;
  text-transform: none;
  flex-shrink: 0;
}

/* ── CORS ── */
.cors-col { flex: 1; display: flex; flex-direction: column; gap: 8px; }

.cors-row { display: flex; align-items: center; gap: 8px; }

/* ── System Info ── */
.sys-info-row {
  display: flex;
  align-items: flex-start;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  gap: 16px;
}

.sys-info-row:last-child { border-bottom: none; }

.sys-key { width: 140px; flex-shrink: 0; font-size: 13px; color: #8e8e93; }
.sys-val { font-size: 13px; color: #f5f5f7; font-family: monospace; word-break: break-all; }

/* ── Empty state ── */
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: #636366;
  font-size: 13px;
  gap: 8px;
}

/* ── Scrollbar ── */
.settings-content::-webkit-scrollbar { width: 4px; }
.settings-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

/* ── Robot image ── */
.hidden-file-input { display: none; }

.robot-img-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.robot-img-preview {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  width: 72px;
  height: 72px;
}

.robot-img-preview:hover .robot-img-overlay { opacity: 1; }

.robot-img-thumb {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  object-fit: contain;
  background: #3a3a3c;
  border: 1px solid rgba(255,255,255,0.12);
  display: block;
}

.robot-img-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  border: 2px dashed rgba(255,255,255,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3a3a3c;
}

.robot-img-overlay {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.18s;
}

.robot-img-info { flex: 1; }

.robot-img-hint {
  font-size: 12px;
  color: #636366;
  line-height: 1.5;
}

.robot-img-msg { font-size: 12px; margin-top: 6px; }
.robot-msg-ok  { color: #30d158; }
.robot-msg-err { color: #ff453a; }

/* ── Advanced Map Engine ── */
.adv-expansion {
  background: #2c2c2e;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
}

:deep(.adv-expansion-header) {
  color: #aeaeb2;
  font-size: 13px;
  font-weight: 600;
  padding: 14px 20px;
}

:deep(.adv-expansion-header:hover) {
  background: rgba(255,255,255,0.04);
}

:deep(.adv-expansion-header .q-item__section--avatar) {
  color: #636366;
}

.adv-body {
  padding: 4px 24px 20px 24px;
}

.adv-group-title {
  font-size: 11px;
  font-weight: 700;
  color: #636366;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 10px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.adv-body .form-row:first-child .adv-group-title { border-top: none; }

.adv-toggles-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 14px;
}

.adv-toggle-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 6px;
  flex: 1;
}

.color-swatch {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  cursor: pointer;
  background: none;
  padding: 0;
}

.color-hex {
  font-family: monospace;
  font-size: 13px;
  color: #aeaeb2;
}

.adv-lut-hint {
  font-size: 11px;
  color: #636366;
  margin-bottom: 10px;
}

.adv-lut-preview {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  margin-bottom: 4px;
}

.adv-lut-swatch {
  flex: 1;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #000;
  border: 1px solid rgba(255,255,255,0.1);
}
</style>
