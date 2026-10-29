<template>
  <div
    class="joystick-container"
    @mousedown="startMove"
    @mousemove="moveJoystick"
    @mouseup="endMove"
    @mouseleave="endMove"
    @touchstart="startMove"
    @touchmove.prevent="moveJoystick"
    @touchend="endMove"
  >
    <div class="joystick">
      <div class="rumble" :style="rumblePosition"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, defineEmits } from 'vue'

const emit = defineEmits<{
  (e: 'updateVelocity', p: { Vx: number; Vy: number }): void
}>()

// ——— params ———
const joystickSize = 300
const rumbleSize   = 70
const center       = { x: joystickSize / 2, y: joystickSize / 2 }
const maxDistance  = joystickSize / 2 - rumbleSize / 2

// ——— state ———
const rumblePosition = reactive({ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' })
const velocity       = reactive({ Vx: 0, Vy: 0 })
const isMoving       = ref(false)

const isTouchSupported = typeof window !== 'undefined' && 'ontouchstart' in window

function getEventPosition (event: MouseEvent | TouchEvent) {
  // ปลอดภัยกับ Safari/SSR
  if (isTouchSupported && typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const t = event.touches[0] ?? event.changedTouches[0]
    return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 }
  }
  if (event instanceof MouseEvent) return { x: event.clientX, y: event.clientY }
  return { x: 0, y: 0 }
}

function startMove (event: MouseEvent | TouchEvent) {
  isMoving.value = true
  updateRumblePosition(event)
}

function moveJoystick (event: MouseEvent | TouchEvent) {
  if (!isMoving.value) return
  updateRumblePosition(event)
}

function endMove () {
  isMoving.value = false
  rumblePosition.left = '50%'
  rumblePosition.top  = '50%'
  velocity.Vx = 0
  velocity.Vy = 0
  emit('updateVelocity', { Vx: 0, Vy: 0 })
}

function updateRumblePosition (event: MouseEvent | TouchEvent) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return

  const rect = target.getBoundingClientRect()
  const { x, y } = getEventPosition(event)

  const offsetX = x - rect.left - center.x
  const offsetY = y - rect.top  - center.y

  const distance = Math.hypot(offsetX, offsetY)
  const angle    = Math.atan2(offsetY, offsetX)
  const move     = Math.min(distance, maxDistance)

  rumblePosition.left = `${((move * Math.cos(angle)) + center.x) / joystickSize * 100}%`
  rumblePosition.top  = `${((move * Math.sin(angle)) + center.y) / joystickSize * 100}%`

  // map เป็น -1..1
  velocity.Vy = -offsetX / maxDistance
  velocity.Vx = -offsetY / maxDistance
  emit('updateVelocity', { Vx: velocity.Vx * 0.0015, Vy: velocity.Vy * 0.0015 })
}
</script>

<style scoped>
/* ลอยหน้าสุดเสมอ */
.joystick-container {
  position: fixed;      /* สำคัญ: ให้ลอยเหนือ layout */
  right: 24px;          /* เปลี่ยนตำแหน่งได้ตามต้องการ */
  bottom: 24px;
  width: 300px;
  height: 300px;
  z-index: 3000;        /* สูงกว่า q-drawer/overlay */
  cursor: pointer;
  overflow: hidden;
  touch-action: none;   /* กัน scroll ขณะลาก */
}

.joystick {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background-color: #bbb;
  display: flex;
  justify-content: center;
  align-items: center;
}

.rumble {
  position: absolute;
  width: 70px;
  height: 70px;
  background-color: rgba(25, 25, 25, 0.6);
  border-radius: 50%;
  transition: transform 0.1s ease, left 0.1s ease, top 0.1s ease;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
</style>
