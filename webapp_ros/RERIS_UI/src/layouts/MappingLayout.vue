<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
// import { useRoute } from 'vue-router'
import axios from 'axios'
import { server_api_config } from 'src/configs/server'

// const iconRailOpen = ref(true)
// const setupDrawerOpen = ref(true)
const usernameReadable = ref<string>('')

// const route = useRoute()

/**
 * isActive:
 * - exact = true จะเทียบ path แบบตรงตัว (ใช้กับ '/')
 * - ถ้า exact = false ใช้ startsWith เพื่อรองรับซับเส้นทาง (/maps/..., /marker/...)
 */
// function isActive (path: string, exact = false) {
//   const current = route.path || '/'
//   return exact ? current === path : current.startsWith(path)
// }

// function toggleSetupDrawer () {
//   setupDrawerOpen.value = !setupDrawerOpen.value
//   iconRailOpen.value = !iconRailOpen.value
// }

function logout () {
  localStorage.removeItem('authToken')
  localStorage.removeItem('username')
  localStorage.removeItem('auth')
  window.location.href = '/'
}

onMounted(async () => {
  const token = localStorage.getItem('authToken')
  if (!token) { logout(); return }

  try {
    const url = `http://${server_api_config.ip}:${server_api_config.port}/api/auth/profile`
    const res = await axios.post(url, {}, { headers: { Authorization: `Bearer ${token}` } })
    if (res?.data?.username) {
      usernameReadable.value = res.data.username
      localStorage.setItem('username', res.data.username)
      localStorage.setItem('auth', 'true')
    } else if (res?.data?.error === 'failed') {
      logout()
    }
  } catch (e: string) {
    console.error(e)
    if (e?.response?.status === 401 || e?.response?.status === 403) logout()
  }
})
</script>

<style scoped>
@font-face {
  font-family: 'RedHatDisplay';
  src: url('~assets/fonts/Red_Hat_Display/RedHatDisplay-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
}

/* Global dark theme */
:deep(body),
:deep(#q-app),
:deep(.q-layout),
:deep(.q-page),
:deep(.q-page-container) {
  background: #1c1c1e !important;
  color: #f5f5f7 !important;
}

:deep(.q-drawer),
:deep(.q-drawer .q-drawer__content),
:deep(.q-drawer__backdrop) {
  background: #1c1c1e !important;
}

html, body, button, input, textarea, select,
.q-layout, .q-header, .q-toolbar, .q-drawer,
.q-page-container, .q-btn, .q-item, .q-input,
.q-card, .q-list, .q-table {
  font-family: 'RedHatDisplay', 'Noto Sans Thai', sans-serif;
  letter-spacing: 0.2px;
}

/* Global dark background */
body, .q-layout {
  background: #1c1c1e !important;
}

.q-page-container {
  background: #1c1c1e !important;
}

/* Preserve the icon fonts */
.material-icons,
.material-symbols-outlined,
.material-symbols-rounded,
.material-symbols-sharp,
.q-icon {
  font-family: 'Material Icons' !important;
  font-feature-settings: 'liga';
}

/* Topbar - Modern Dark Theme */
.topbar { 
  background: rgba(28, 28, 30, 0.85);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 0 0 rgba(0, 0, 0, 0.3);
}

.toolbar-modern {
  height: 50px;
  min-height: 50px;
  padding: 0 16px;
  max-width: 100%;
}

.menu-btn {
  color: #f5f5f7;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-right: 12px;
  background: transparent;
}

.menu-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(1.05);
}

.menu-btn :deep(.q-icon) {
  color: #f5f5f7;
}

.menu-btn :deep(.q-btn__content) {
  background: transparent;
}

.app-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.3px;
  color: #f5f5f7;
}

.title-text {
  background: linear-gradient(135deg, #f5f5f7 0%, #a1a1a6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.user-section {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 14px 4px 4px;
  background: rgba(72, 72, 74, 0.5);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  transition: all 0.2s ease;
}

.user-info:hover {
  background: rgba(72, 72, 74, 0.7);
  border-color: rgba(255, 255, 255, 0.18);
}

.avatar-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
}

.avatar-icon {
  color: white;
  font-size: 28px;
}

.username { 
  font-weight: 500;
  font-size: 14px;
  color: #f5f5f7;
  letter-spacing: -0.1px;
}

.logout-btn {
  color: #f5f5f7;
  font-weight: 500;
  padding: 6px 16px;
  border-radius: 18px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(72, 72, 74, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.12);
  text-transform: none;
  letter-spacing: -0.1px;
  font-size: 13px;
}

.logout-btn:hover {
  background: rgba(255, 69, 58, 0.2);
  border-color: rgba(255, 69, 58, 0.3);
  color: #ff453a;
  transform: translateY(-1px);
}

.logout-btn:active {
  transform: translateY(0);
}

/* Icon Rail - Dark */
.icon-rail { 
  background: #1c1c1e !important; 
  color: #f5f5f7;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.icon-rail .q-drawer__content) {
  background: #1c1c1e !important;
}

:deep(.icon-rail.q-drawer) {
  background: #1c1c1e !important;
}

.rail-wrapper {
  height: 100%;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #1c1c1e;
}
.rail-btn {
  margin: 6px 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  transition: all 0.2s ease;
  color: #a1a1a6;
}
.rail-btn:hover { 
  transform: scale(1.05);
  background: rgba(255, 255, 255, 0.1);
  color: #f5f5f7;
}

/* Setup Drawer - Dark */
.setup-drawer { 
  background: #1c1c1e !important;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.setup-drawer.q-drawer) {
  background: #1c1c1e !important;
}

.setup-title {
  font-weight: 700;
  text-align: center;
  font-size: 20px;
  padding: 8px 12px 16px 12px;
  color: #f5f5f7;
}

:deep(.setup-drawer .q-drawer__content) {
  background: #1c1c1e !important;
}

:deep(.setup-drawer .q-list) {
  background: #1c1c1e !important;
}

/* Content toolbar - Dark */
.content-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 18px 6px 18px;
  background: #1c1c1e;
}
.search-box { 
  flex: 1; 
  max-width: 560px;
}
:deep(.search-box .q-field__control) {
  background: #2c2c2e;
  color: #f5f5f7;
  border-color: rgba(255, 255, 255, 0.12);
}
:deep(.search-box .q-field__native),
:deep(.search-box .q-placeholder) {
  color: #a1a1a6;
}
:deep(.search-box .q-icon) {
  color: #a1a1a6;
}
.create-btn { 
  padding: 8px 18px; 
  font-weight: 600; 
  border-radius: 12px;
  background: #30d158;
  color: #000;
}
.create-btn:hover {
  background: #32d65a;
}

/* List card - Dark */
.list-card {
  margin: 8px 18px 18px 18px;
  background: #2c2c2e;
  border-radius: 12px;
  padding: 10px;
  min-height: 280px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Header like table - Dark */
.list-header {
  display: grid;
  grid-template-columns: 1fr 160px 120px;
  gap: 8px;
  background: #3a3a3c;
  color: #f5f5f7;
  border-radius: 6px;
  padding: 10px 12px;
  font-weight: 600;
  font-size: 14px;
}
.col-status { text-align: left; }
.col-action { text-align: right; }

/* Empty state - Dark */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 220px;
  margin: 12px;
  border-radius: 12px;
  background: rgba(28, 28, 30, 0.5);
  color: #8e8e93;
  font-size: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
}

/* active item - Dark */
:deep(.q-item--active) {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

:deep(.q-item) {
  color: #f5f5f7;
}

:deep(.q-item:hover) {
  background: rgba(255, 255, 255, 0.05);
}

:deep(.q-item .q-icon) {
  color: #a1a1a6;
}

:deep(.q-item--active .q-icon) {
  color: #0a84ff;
}

:deep(.q-layout__section--marginal) {
  background: #252525 !important;
}
</style>
