<template>
  <div
    ref="joyEl"
    class="joystick-container"
    :style="{ '--joy-size': joySizeCss }"
    @contextmenu.prevent
    @mousedown="startMove"
    @mousemove="moveJoystick"
    @mouseup="endMove"
    @mouseleave="endMove"
    @touchstart.passive="startMove"
    @touchmove.prevent="moveJoystick"
    @touchend="endMove"
  >
    <div class="joystick">
      <div class="rumble" :style="rumblePosition"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, defineProps, defineEmits, onMounted, onBeforeUnmount, computed } from 'vue'

/** ===== Props ===== */
const props = defineProps<{
  /** Base size in px (default 300). You can set 340, 360, etc. */
  size?: number
}>()

/** ===== Emit ===== */
const emit = defineEmits<{
  (e: 'updateVelocity', payload: { Vx: number; Vy: number; heartbeat?: boolean }): void
}>()

/** ===== DOM refs / layout state ===== */
const joyEl = ref<HTMLElement | null>(null)
const layout = reactive({
  w: 0, h: 0, cx: 0, cy: 0,
  maxDist: 0,
  knobSizePx: 0
})

/** ===== Tunables ===== */
// Joystick emits normalized -1..1; scaling is done by reris_engine using settings
const DEADZONE = 0.07
const RESPONSE_GAMMA = 0.60
// knob ≈ 70px when base = 300px  → 70/300 ≈ 0.233
const KNOB_RATIO = 0.233

/** ===== Runtime state ===== */
const rumblePosition = reactive({
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)'
})
const velocity = reactive({ Vx: 0, Vy: 0 })
const isMoving = ref(false)
const joyFlipBit = ref(false)
const joyTimerMode = ref(false)

let emitInterval: ReturnType<typeof setInterval> | null = null

/** ===== Size control (bigger than before) =====
 * Default 300px; clamps a bit for tiny screens, allows up to 380px.
 */
const baseSize = computed(() => props.size ?? 300)
const joySizePx = ref<number>(baseSize.value)
const joySizeCss = computed(() => `${joySizePx.value}px`)

function recomputeResponsiveSize() {
  // Keep it big (original feel) but avoid overflowing very small screens
  const vw = Math.max(320, window.innerWidth || 320)
  const vh = Math.max(480, window.innerHeight || 480)
  const limit = Math.min(vw, vh)
  // clamp between 240px and 380px; prefer requested size
  joySizePx.value = Math.min(Math.max(baseSize.value, 240), 380, Math.floor(limit * 0.6))
}

/** ===== Helpers ===== */
function shapeGain(r01: number) {
  if (r01 <= DEADZONE) return 0
  const t = (r01 - DEADZONE) / (1 - DEADZONE)
  return Math.pow(Math.min(Math.max(t, 0), 1), RESPONSE_GAMMA)
}
function getEventPosition(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in event && event.touches && event.touches.length) {
    const t = event.touches[0]
    return { x: t.clientX, y: t.clientY }
  }
  if ('changedTouches' in event && event.changedTouches && event.changedTouches.length) {
    const t = event.changedTouches[0]
    return { x: t.clientX, y: t.clientY }
  }
  const me = event as MouseEvent
  return { x: me.clientX, y: me.clientY }
}

/** ===== Layout / center recompute ===== */
function recomputeLayout() {
  const el = joyEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  layout.w = rect.width
  layout.h = rect.height
  const base = Math.min(layout.w, layout.h)
  layout.knobSizePx = base * KNOB_RATIO
  layout.cx = rect.left + layout.w / 2
  layout.cy = rect.top + layout.h / 2
  layout.maxDist = base / 2 - layout.knobSizePx / 2
}
function resetJoystick() {
  isMoving.value = false
  rumblePosition.left = '50%'
  rumblePosition.top = '50%'
  velocity.Vx = 0
  velocity.Vy = 0
  joyTimerMode.value = false
  emit('updateVelocity', { Vx: 0, Vy: 0 })
}

/** ===== Handlers ===== */
function startMove(event: MouseEvent | TouchEvent) {
  recomputeLayout()
  isMoving.value = true
  updateRumblePosition(event)
  
  if (!emitInterval) {
    // Emit current velocity at 20Hz (50ms) to prevent WS flooding on high polling-rate screens
    emitInterval = setInterval(() => {
      emit('updateVelocity', { Vx: velocity.Vx, Vy: velocity.Vy, heartbeat: joyFlipBit.value })
    }, 50)
  }
}
function moveJoystick(event: MouseEvent | TouchEvent) {
  if (!isMoving.value) return
  updateRumblePosition(event)
}
function endMove() {
  if (emitInterval) {
    clearInterval(emitInterval)
    emitInterval = null
  }
  resetJoystick()
}
function updateRumblePosition(event: MouseEvent | TouchEvent) {
  const el = joyEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const base = Math.min(rect.width, rect.height)
  const knob = base * KNOB_RATIO
  const maxDistance = base / 2 - knob / 2

  const { x, y } = getEventPosition(event)
  const relX = x - (rect.left + rect.width / 2)
  const relY = y - (rect.top + rect.height / 2)

  const dist = Math.hypot(relX, relY)
  const angle = Math.atan2(relY, relX)
  const clampedDist = Math.min(dist, maxDistance)
  const knobX = Math.cos(angle) * clampedDist
  const knobY = Math.sin(angle) * clampedDist

  rumblePosition.left = `${((knobX + rect.width / 2) / rect.width) * 100}%`
  rumblePosition.top  = `${((knobY + rect.height / 2) / rect.height) * 100}%`

  const r01 = clampedDist / maxDistance
  const gain = shapeGain(r01)
  const ux = knobX / maxDistance
  const uy = knobY / maxDistance

  const Vy_cmd = -ux * gain
  const Vx_cmd = -uy * gain
  velocity.Vx = Vx_cmd
  velocity.Vy = Vy_cmd
  // We no longer emit right here; the 50ms setInterval loop handles it
}

/** ===== Global guards (fix “stuck after QMenu/Drawer”) ===== */
function bindGlobalGuards() {
  window.addEventListener('resize', onViewportChange, { passive: true })
  window.addEventListener('orientationchange', onViewportChange)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('blur', resetJoystick)
  document.addEventListener('pointerup', resetJoystick)
  document.addEventListener('pointercancel', resetJoystick)
  document.addEventListener('touchend', resetJoystick)
  document.addEventListener('touchcancel', resetJoystick)
}
function unbindGlobalGuards() {
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('blur', resetJoystick)
  document.removeEventListener('pointerup', resetJoystick)
  document.removeEventListener('pointercancel', resetJoystick)
  document.removeEventListener('touchend', resetJoystick)
  document.removeEventListener('touchcancel', resetJoystick)
}
function onViewportChange() {
  recomputeResponsiveSize()
  recomputeLayout()
  resetJoystick()
}
function onVisibility() {
  if (document.hidden) resetJoystick()
}

/** ===== Mount ===== */
onMounted(() => {
  recomputeResponsiveSize()
  recomputeLayout()
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => {
      // if container size changed (drawer push, css change), keep center
      recomputeLayout()
      if (!isMoving.value) resetJoystick()
    })
    if (joyEl.value) ro.observe(joyEl.value)
    ;(joyEl.value )._ro = ro
  }
  bindGlobalGuards()
})
onBeforeUnmount(() => {
  const el = joyEl.value 
  if (el && el._ro) el._ro.disconnect()
  unbindGlobalGuards()
})
</script>

<style scoped>
/* Bigger by default; you can set :size="340" etc. */
.joystick-container {
  position: relative;

  width: var(--joy-size, 300px);
  height: var(--joy-size, 300px);

  touch-action: none;
  user-select: none;
}

.joystick {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
  backdrop-filter: blur(6px);
  box-shadow: 0 6px 22px rgba(0,0,0,0.35) inset, 0 2px 8px rgba(0,0,0,0.25);
  position: relative;
}

.rumble {
  position: absolute;
  width: 23.3%;
  height: 23.3%;
  border-radius: 999px;
  background: radial-gradient(circle at 40% 40%, rgba(255,255,255,0.95), rgba(220,220,220,0.85));
  box-shadow: 0 4px 12px rgba(0,0,0,0.35);
  pointer-events: none;
  will-change: left, top, transform;
  transition: left 60ms linear, top 60ms linear;
}
</style>
