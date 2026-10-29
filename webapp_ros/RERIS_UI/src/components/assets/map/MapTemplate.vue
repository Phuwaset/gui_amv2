<template>
  <q-page class="map-template-page">
    <!-- Debug panel (shows route props, remove after testing) -->
    <div v-if="showDebug" class="debug-panel">
      <div class="debug-title">🗺️ MapTemplate Debug</div>
      <div class="debug-item">Map: <strong>{{ mapName || 'N/A' }}</strong></div>
      <div class="debug-item">Site: <strong>{{ mapSite || 'N/A' }}</strong></div>
      <div class="debug-item">Mode: <strong>{{ mode }}</strong></div>
      <div class="debug-item">Recording: <strong>{{ recording ? 'Yes' : 'No' }}</strong></div>
      <q-btn 
        dense 
        flat 
        size="xs" 
        label="Hide Debug" 
        @click="showDebug = false"
        class="q-mt-xs"
      />
    </div>

    <!-- Main Map Component -->
    <MapAsset
      v-if="mapName && mapSite"
      :map-name="mapName"
      :map-site="mapSite"
      :mode="mode"
      :recording="recording"
      class="map-asset"
    />

    <!-- Error State: Missing required props -->
    <div v-else class="error-container">
      <q-icon name="error_outline" size="64px" color="negative" />
      <div class="error-title">Map Information Missing</div>
      <div class="error-details">
        <div v-if="!mapName">• Map name is required</div>
        <div v-if="!mapSite">• Site name is required</div>
      </div>
      <div class="error-actions">
        <q-btn
          unelevated
          color="primary"
          label="Back to Maps"
          icon="arrow_back"
          @click="goToMapsList"
        />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import MapAsset from './MapAsset.vue'

type MapMode = 'visualize' | 'edit' | 'record'

// Receive props from route
const props = withDefaults(defineProps<{
  mapName: string
  mapSite: string
  mode?: MapMode
  recording?: boolean
}>(), {
  mode: 'visualize',
  recording: false
})

const router = useRouter()
const showDebug = ref(true)

// Auto-hide debug panel after 3 seconds
onMounted(() => {
  console.log('🗺️ MapTemplate mounted with:', {
    mapName: props.mapName,
    mapSite: props.mapSite,
    mode: props.mode,
    recording: props.recording
  })

  // Auto-hide debug after 3 seconds
  setTimeout(() => {
    showDebug.value = false
  }, 3000)
})

// Watch for prop changes
watch(() => props, (newProps) => {
  console.log('🔄 MapTemplate props updated:', newProps)
}, { deep: true })

// Navigate back to maps list
async function goToMapsList() {
await  router.push({ name: 'MapsList' })
}
</script>

<style scoped>
.map-template-page {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  position: relative;
  overflow: hidden;
}

.map-asset {
  width: 100%;
  height: 100%;
}

/* Debug Panel */
.debug-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  padding: 16px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 9999;
  min-width: 250px;
  border: 2px solid #1ecf61;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.debug-title {
  font-size: 14px;
  font-weight: 700;
  color: #1ecf61;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(30, 207, 97, 0.3);
}

.debug-item {
  margin-bottom: 6px;
  color: #ddd;
}

.debug-item strong {
  color: #1ecf61;
  font-weight: 600;
}

/* Error State */
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 20px;
  padding: 40px;
  text-align: center;
}

.error-title {
  font-size: 24px;
  font-weight: 700;
  color: #f0f0f0;
}

.error-details {
  font-size: 14px;
  color: #aaa;
  text-align: left;
}

.error-details div {
  margin-bottom: 4px;
}

.error-actions {
  margin-top: 8px;
}

/* Responsive */
@media (max-width: 768px) {
  .debug-panel {
    top: 8px;
    right: 8px;
    left: 8px;
    min-width: auto;
  }
}
</style>