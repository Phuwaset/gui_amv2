<template>
  <!-- Icon Sprite -->
  <svg xmlns="http://www.w3.org/2000/svg" style="display:none">
    <defs>
      >
      <symbol id="icon-cursor" viewBox="0 0 24 24" aria-label="Cursor">
        <polygon points="2,2 2,22 8,16 13,22 15,20 10,14 18,14" fill="white" stroke="currentColor" stroke-width="1" stroke-linejoin="miter" />
      </symbol>

      <symbol id="icon-marker" viewBox="0 0 24 24" aria-label="Point to point">
        <path fill="currentColor" d="M12 2c-3.31 0-6 2.53-6 5.65 0 4.6 6 13.7 6 13.7s6-9.1 6-13.7C18 4.53 15.31 2 12 2zm0 8.2a2.55 2.55 0 1 1 0-5.1 2.55 2.55 0 0 1 0 5.1z" />
      </symbol>

      <symbol id="icon-multi-marker" viewBox="0 0 24 24" aria-label="Multi point">
        <path fill="currentColor" opacity="0.6" d="M8 3c-2.5 0-4.5 1.9-4.5 4.2 0 3.4 4.5 10.1 4.5 10.1S12.5 10.6 12.5 7.2C12.5 4.9 10.5 3 8 3zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
        <path fill="currentColor" opacity="0.8" d="M13 4.5c-2.2 0-4 1.7-4 3.9 0 3.1 4 9.2 4 9.2s4-6.1 4-9.2c0-2.2-1.8-3.9-4-3.9zm0 5.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z" />
        <path fill="currentColor" d="M17 6c-2 0-3.5 1.6-3.5 3.5 0 2.8 3.5 7.6 3.5 7.6s3.5-4.8 3.5-7.6C20.5 7.6 19 6 17 6zm0 4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z" />
      </symbol>

      <symbol id="icon-area" viewBox="0 0 24 24" aria-label="Area selection">
        <rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 3" rx="2" ry="2" />
      </symbol>

      <symbol id="icon-map-editor" viewBox="0 0 24 24" aria-label="Map editor">
        <path fill="none" stroke="currentColor" stroke-width="2" d="M4 6l6-2 4 2 6-2v12l-6 2-4-2-6 2z" />
        <path fill="none" stroke="currentColor" stroke-width="2" d="M10 4v12M14 6v12" />
        <path fill="currentColor" d="M16.8 9.2l3 3-4.6 4.6-2.1.5.5-2.1 4.6-4.6z" />
        <path fill="currentColor" d="M20 8.9l1.1 1.1c.4.4.4 1 0 1.4l-.4.4-2.5-2.5.4-.4c.4-.4 1-.4 1.4 0z" />
      </symbol>
    </defs>
  </svg>

  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { socketService } from './services/socketService';
import { server_websocket_config } from './configs/server';

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let seq = 0;

const HEARTBEAT_MS_FG = 50;   // 20 Hz เมื่อแท็บโฟกัส
const HEARTBEAT_MS_BG = 200;  // 5 Hz เมื่อแท็บไม่โฟกัส
const PING_MS = 1000;         // 1 Hz RTT ping-pong

function startHeartbeatLoop() {
  stopHeartbeatLoop();
  const isVisible = document.visibilityState === 'visible';
  const period = isVisible ? HEARTBEAT_MS_FG : HEARTBEAT_MS_BG;

  heartbeatTimer = setInterval(() => {
    const isAuth = localStorage.getItem('auth') === 'true';
    if (!isAuth) return;
    // ใช้ API ใหม่: ส่ง heartbeat พร้อม seq + timestamp
    socketService.sendHeartbeat(seq++);
  }, period);
}

function stopHeartbeatLoop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startPingLoop() {
  stopPingLoop();
  pingTimer = setInterval(() => {
    const isAuth = localStorage.getItem('auth') === 'true';
    if (!isAuth) return;
    const id = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
    socketService.sendPing(id);
  }, PING_MS);
}

function stopPingLoop() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function handleVisibilityChange() {
  // ปรับความถี่ heartbeat ตามสถานะแท็บ
  startHeartbeatLoop();
}

// Initialize WebSocket connections on app mount
onMounted(() => {
  console.log('[App] Initializing dual WebSocket connections (telemetry + map)');
  socketService.connect(server_websocket_config.ip);

  startHeartbeatLoop();
  startPingLoop();

  document.addEventListener('visibilitychange', handleVisibilityChange);
});

// Cleanup on app unmount
onBeforeUnmount(() => {
  console.log('[App] Disconnecting WebSockets');
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  stopHeartbeatLoop();
  stopPingLoop();

  socketService.disconnect();
});
</script>
