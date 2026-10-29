<template>
  <q-page class="profile-page">
    <div class="profile-layout">

      <!-- ===== LEFT — Sidebar Profile Card ===== -->
      <div class="profile-sidebar">
        <div class="avatar-card">
          <!-- Avatar Circle -->
          <div class="avatar-big-wrap" @click="triggerAvatarPick">
            <img v-if="avatarUrl" :src="avatarUrl" class="avatar-big avatar-img" :key="avatarUrl" />
            <div v-else class="avatar-big" :style="{ background: avatarGradient }">
              <span class="avatar-initials">{{ initials }}</span>
            </div>
            <div class="avatar-edit-overlay"><q-icon name="photo_camera" size="18px" /></div>
          </div>
          <input ref="avatarInput" type="file" accept="image/png,image/jpeg" class="hidden-input" @change="onAvatarPicked" />
          <div class="profile-name">{{ displayName || profile.username }}</div>
          <div class="profile-username">@{{ profile.username }}</div>
          <q-chip
            dense
            :color="roleColor"
            text-color="white"
            class="role-chip"
            icon="shield"
          >
            {{ profile.role || 'viewer' }}
          </q-chip>
          <div class="profile-joined" v-if="profile.createdAt">
            Joined {{ formatDate(profile.createdAt) }}
          </div>
        </div>

        <!-- Nav tabs (vertical) -->
        <div class="profile-nav">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="nav-item"
            :class="{ 'nav-item--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <q-icon :name="tab.icon" size="18px" />
            <span>{{ tab.label }}</span>
          </div>
        </div>
      </div>

      <!-- ===== RIGHT — Tab Content ===== -->
      <div class="profile-content">

        <!-- ── Account Tab ── -->
        <div v-if="activeTab === 'account'" class="tab-section">
          <div class="section-header">
            <q-icon name="manage_accounts" size="22px" class="section-icon" />
            <span class="section-title">Account Settings</span>
          </div>

          <div class="card-block">
            <div class="block-title">Profile Information</div>
            <div class="form-row">
              <label class="form-label">Display Name</label>
              <q-input
                v-model="displayName"
                dense dark outlined
                placeholder="Enter display name"
                class="form-input"
              />
            </div>
            <div class="form-row">
              <label class="form-label">Username</label>
              <q-input
                :model-value="profile.username"
                dense dark outlined
                readonly
                class="form-input"
              >
                <template #append>
                  <q-icon name="lock" size="16px" color="grey-6" />
                </template>
              </q-input>
            </div>
            <div class="form-row">
              <label class="form-label">Role</label>
              <q-input
                :model-value="profile.role"
                dense dark outlined
                readonly
                class="form-input"
              >
                <template #append>
                  <q-chip dense :color="roleColor" text-color="white" size="sm">{{ profile.role }}</q-chip>
                </template>
              </q-input>
            </div>
            <q-btn
              unelevated
              label="Save Changes"
              icon="save"
              color="blue-8"
              class="save-btn"
              :loading="savingProfile"
              @click="saveProfile"
            />
            <q-banner v-if="profileMsg" class="msg-banner" :class="profileMsgType === 'ok' ? 'msg-ok' : 'msg-err'" dense>
              {{ profileMsg }}
            </q-banner>
          </div>

          <div class="card-block q-mt-md">
            <div class="block-title">Profile Picture</div>
            <div class="avatar-upload-row">
              <div class="avatar-preview-wrap" @click="triggerAvatarPick">
                <img v-if="avatarPreview || avatarUrl" :src="avatarPreview || avatarUrl || ''" class="avatar-preview-img" />
                <div v-else class="avatar-preview-placeholder" :style="{ background: avatarGradient }">
                  <span>{{ initials }}</span>
                </div>
                <div class="avatar-edit-overlay-sm"><q-icon name="photo_camera" size="14px" /></div>
              </div>
              <div class="avatar-upload-info">
                <div class="avatar-upload-hint">PNG or JPEG · max 500 KB · displayed at 120×120 px</div>
                <q-btn
                  unelevated dense no-caps
                  label="Upload Photo"
                  icon="upload"
                  color="blue-8"
                  size="sm"
                  class="q-mt-sm"
                  :loading="uploadingAvatar"
                  @click="triggerAvatarPick"
                />
                <q-btn
                  v-if="avatarPreview"
                  unelevated dense no-caps
                  label="Save"
                  icon="check"
                  color="green-8"
                  size="sm"
                  class="q-mt-sm q-ml-sm"
                  :loading="uploadingAvatar"
                  @click="uploadAvatar"
                />
                <div v-if="avatarMsg" class="avatar-msg" :class="avatarMsgType === 'ok' ? 'msg-ok-text' : 'msg-err-text'">
                  {{ avatarMsg }}
                </div>
              </div>
            </div>
          </div>

          <div class="card-block q-mt-md">
            <div class="block-title">Change Password</div>
            <div class="form-row">
              <label class="form-label">Current Password</label>
              <q-input
                v-model="pwd.current"
                dense dark outlined type="password"
                placeholder="Current password"
                class="form-input"
              />
            </div>
            <div class="form-row">
              <label class="form-label">New Password</label>
              <q-input
                v-model="pwd.newPwd"
                dense dark outlined type="password"
                placeholder="New password"
                class="form-input"
              />
            </div>
            <div class="form-row">
              <label class="form-label">Confirm Password</label>
              <q-input
                v-model="pwd.confirm"
                dense dark outlined type="password"
                placeholder="Confirm new password"
                :error="!!pwd.newPwd && pwd.confirm !== '' && pwd.newPwd !== pwd.confirm"
                error-message="Passwords do not match"
                class="form-input"
              />
            </div>
            <q-btn
              unelevated
              label="Update Password"
              icon="vpn_key"
              color="orange-8"
              class="save-btn"
              :loading="savingPwd"
              :disable="!pwd.current || !pwd.newPwd || pwd.newPwd !== pwd.confirm"
              @click="updatePassword"
            />
            <q-banner v-if="pwdMsg" class="msg-banner" :class="pwdMsgType === 'ok' ? 'msg-ok' : 'msg-err'" dense>
              {{ pwdMsg }}
            </q-banner>
          </div>
        </div>

        <!-- ── Role Management Tab ── -->
        <div v-else-if="activeTab === 'roles'" class="tab-section">
          <div class="section-header">
            <q-icon name="admin_panel_settings" size="22px" class="section-icon" />
            <span class="section-title">Role Management</span>
            <q-chip dense color="purple-9" text-color="white" class="q-ml-sm">Admin Only</q-chip>
          </div>

          <div v-if="profile.role !== 'admin'" class="forbidden-card">
            <q-icon name="lock" size="48px" color="grey-7" />
            <p>Only administrators can manage user roles.</p>
          </div>

          <template v-else>
            <div class="card-block">
              <div class="block-title">All Users</div>
              <!-- Table header -->
              <div class="user-table-header">
                <span>Username</span>
                <span>Display Name</span>
                <span>Role</span>
                <span>Joined</span>
                <span class="col-right">Action</span>
              </div>

              <div v-if="loadingUsers" class="table-loading">
                <q-spinner color="blue-5" size="32px" />
              </div>

              <div v-else-if="allUsers.length === 0" class="table-empty">
                No users found.
              </div>

              <div
                v-else
                v-for="u in allUsers"
                :key="u.username"
                class="user-row"
                :class="{ 'user-row--banned': u.isBanned }"
              >
                <div class="user-row-cell">
                  <div class="user-mini-avatar" :style="{ background: getGradient(u.username) }">
                    {{ u.username[0]?.toUpperCase() }}
                  </div>
                  <span class="user-name-text">{{ u.username }}</span>
                </div>
                <span class="user-row-cell dim-text">{{ u.displayName || '—' }}</span>
                <span class="user-row-cell">
                  <q-chip dense :color="getRoleColor(u.role)" text-color="white" size="sm">
                    {{ u.role }}
                  </q-chip>
                </span>
                <span class="user-row-cell dim-text">{{ formatDate(u.createdAt) }}</span>
                <div class="user-row-cell col-right">
                  <q-btn
                    dense flat
                    label="Modify"
                    icon="edit"
                    color="blue-5"
                    size="sm"
                    @click="openModify(u)"
                  />
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- ── Ban Tab ── -->
        <div v-else-if="activeTab === 'ban'" class="tab-section">
          <div class="section-header">
            <q-icon name="block" size="22px" class="section-icon" color="red-5" />
            <span class="section-title">Banned Users</span>
            <q-chip dense color="purple-9" text-color="white" class="q-ml-sm">Admin Only</q-chip>
          </div>

          <div v-if="profile.role !== 'admin'" class="forbidden-card">
            <q-icon name="lock" size="48px" color="grey-7" />
            <p>Only administrators can manage bans.</p>
          </div>

          <template v-else>
            <div class="card-block">
              <div class="block-title">Banned Accounts</div>
              <div class="user-table-header" style="grid-template-columns: 1fr 1fr 1fr 160px;">
                <span>Username</span>
                <span>Display Name</span>
                <span>Joined</span>
                <span class="col-right">Action</span>
              </div>

              <div v-if="loadingUsers" class="table-loading">
                <q-spinner color="red-5" size="32px" />
              </div>

              <div v-else-if="bannedUsers.length === 0" class="table-empty">
                <q-icon name="check_circle" size="36px" color="green-7" />
                <p>No banned users. Everything looks clean!</p>
              </div>

              <div
                v-else
                v-for="u in bannedUsers"
                :key="u.username"
                class="user-row user-row--banned"
                style="grid-template-columns: 1fr 1fr 1fr 160px;"
              >
                <div class="user-row-cell">
                  <div class="user-mini-avatar banned-avatar">
                    {{ u.username[0]?.toUpperCase() }}
                  </div>
                  <span class="user-name-text">{{ u.username }}</span>
                  <q-chip dense color="red-9" text-color="white" size="xs" class="q-ml-xs">Banned</q-chip>
                </div>
                <span class="user-row-cell dim-text">{{ u.displayName || '—' }}</span>
                <span class="user-row-cell dim-text">{{ formatDate(u.createdAt) }}</span>
                <div class="user-row-cell col-right">
                  <q-btn
                    dense unelevated
                    label="Unban"
                    icon="lock_open"
                    color="green-8"
                    size="sm"
                    :loading="banningUser === u.username"
                    @click="unbanUser(u.username)"
                  />
                </div>
              </div>
            </div>

            <!-- Ban a user manually -->
            <div class="card-block q-mt-md">
              <div class="block-title">Ban a User</div>
              <div class="ban-input-row">
                <q-input
                  v-model="banTargetUsername"
                  dense dark outlined
                  placeholder="Enter username to ban"
                  class="form-input"
                />
                <q-btn
                  unelevated
                  label="Ban"
                  icon="block"
                  color="red-8"
                  class="ban-btn"
                  :disable="!banTargetUsername.trim()"
                  :loading="banningUser === banTargetUsername"
                  @click="banUser(banTargetUsername)"
                />
              </div>
            </div>
          </template>
        </div>

        <!-- ── Security Tab ── -->
        <div v-else-if="activeTab === 'security'" class="tab-section">
          <div class="section-header">
            <q-icon name="security" size="22px" class="section-icon" color="green-5" />
            <span class="section-title">Security</span>
          </div>

          <div class="card-block">
            <div class="block-title">Active Session</div>
            <div class="session-row">
              <div class="session-info">
                <q-icon name="computer" size="20px" color="blue-4" />
                <div class="session-details">
                  <span class="session-device">This Device</span>
                  <span class="session-meta">Current session · Token in localStorage</span>
                </div>
              </div>
              <q-chip dense color="green-9" text-color="white" icon="circle" size="sm">Active</q-chip>
            </div>
            <q-separator dark class="q-my-sm" />
            <div class="form-row q-mt-sm">
              <label class="form-label">Auth Token</label>
              <q-input
                :model-value="maskedToken"
                dense dark outlined
                readonly
                class="form-input font-mono"
              >
                <template #append>
                  <q-btn flat dense round icon="copy_all" size="xs" color="grey-5" @click="copyToken" />
                </template>
              </q-input>
            </div>
            <q-btn
              unelevated
              label="Sign Out"
              icon="logout"
              color="red-9"
              class="save-btn"
              @click="logout"
            />
          </div>

          <div class="card-block q-mt-md">
            <div class="block-title">Two-Factor Authentication</div>
            <div class="tfa-placeholder">
              <q-icon name="phonelink_lock" size="40px" color="grey-7" />
              <p class="tfa-text">2FA support is coming in a future update.</p>
            </div>
          </div>
        </div>

      </div><!-- /profile-content -->
    </div><!-- /profile-layout -->

    <!-- ===== Modify Role Dialog ===== -->
    <q-dialog v-model="modifyOpen">
      <q-card class="modify-card" dark>
        <q-card-section class="modify-header">
          <span class="modify-title">Modify User: <strong>{{ modifyTarget?.username }}</strong></span>
          <q-btn flat round dense icon="close" color="grey-5" @click="modifyOpen = false" />
        </q-card-section>
        <q-separator dark />
        <q-card-section>
          <div class="form-row">
            <label class="form-label">Assign Role</label>
            <div class="role-picker">
              <div
                v-for="r in ['admin','operator','viewer']"
                :key="r"
                class="role-option"
                :class="{ 'role-option--active': modifyRole === r }"
                @click="modifyRole = r"
              >
                <q-icon :name="r === 'admin' ? 'shield' : r === 'operator' ? 'engineering' : 'person'" size="20px" />
                <span>{{ r }}</span>
              </div>
            </div>
          </div>
          <div class="form-row q-mt-sm">
            <label class="form-label">Ban Status</label>
            <q-toggle v-model="modifyBanned" color="red-7" dense label="Banned" dark />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Cancel" color="grey-5" @click="modifyOpen = false" />
          <q-btn unelevated label="Apply" color="blue-8" :loading="savingModify" @click="applyModify" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { server_api_config } from 'src/configs/server'

const router = useRouter()

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserProfile {
  username: string
  displayName?: string
  role: string
  isBanned: boolean
  createdAt?: string
  selectedMapSite?: string
  selectedMapName?: string
  avatarPath?: string
}

// ── State ─────────────────────────────────────────────────────────────────────
const profile      = ref<UserProfile>({ username: '', role: 'viewer', isBanned: false })
const displayName  = ref('')
const allUsers     = ref<UserProfile[]>([])
const loadingUsers = ref(false)
const savingProfile = ref(false)
const savingPwd    = ref(false)
const profileMsg   = ref('')
const profileMsgType = ref<'ok'|'err'>('ok')
const pwdMsg       = ref('')
const pwdMsgType   = ref<'ok'|'err'>('ok')
const pwd = ref({ current: '', newPwd: '', confirm: '' })
const banTargetUsername = ref('')
const banningUser  = ref('')

const activeTab = ref('account')
const modifyOpen = ref(false)

// ── Avatar upload ──────────────────────────────────────────────────────────────
const avatarInput   = ref<HTMLInputElement | null>(null)
const avatarPreview = ref<string | null>(null)
const avatarFile    = ref<File | null>(null)
const uploadingAvatar = ref(false)
const avatarMsg     = ref('')
const avatarMsgType = ref<'ok'|'err'>('ok')
const modifyTarget = ref<UserProfile | null>(null)
const modifyRole   = ref('viewer')
const modifyBanned = ref(false)
const savingModify = ref(false)

const tabs = [
  { key: 'account', label: 'Account',         icon: 'manage_accounts' },
  { key: 'roles',   label: 'Role Management', icon: 'admin_panel_settings' },
  { key: 'ban',     label: 'Ban',             icon: 'block' },
  { key: 'security',label: 'Security',        icon: 'security' },
]

// ── Computed ──────────────────────────────────────────────────────────────────
const initials = computed(() => {
  const name = displayName.value || profile.value.username
  return name.slice(0, 2).toUpperCase()
})

const maskedToken = computed(() => {
  const t = localStorage.getItem('authToken') || ''
  return t.length > 16 ? t.slice(0, 8) + '••••••••' + t.slice(-4) : t
})

const bannedUsers = computed(() => allUsers.value.filter(u => u.isBanned))

const avatarGradient = computed(() => getGradient(profile.value.username))

const avatarCacheBust = ref(Date.now())
const avatarUrl = computed(() => {
  if (!profile.value.avatarPath) return null
  const safe = profile.value.username.replace(/[^a-zA-Z0-9_-]/g, '')
  return `${api()}/api/user/avatar/${encodeURIComponent(safe)}?v=${avatarCacheBust.value}`
})

const roleColor = computed(() => getRoleColor(profile.value.role))

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGradient(name: string): string {
  const colors = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#f093fb,#f5576c)',
    'linear-gradient(135deg,#4facfe,#00f2fe)',
    'linear-gradient(135deg,#43e97b,#38f9d7)',
    'linear-gradient(135deg,#fa709a,#fee140)',
    'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  ]
  const idx = (name.charCodeAt(0) || 0) % colors.length
  return colors[idx]!
}

function getRoleColor(role: string): string {
  return role === 'admin' ? 'red-8' : role === 'operator' ? 'blue-8' : 'grey-7'
}

function formatDate(d?: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const api = () => `http://${server_api_config.ip}:${server_api_config.port}`
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` })

// ── Load own profile ──────────────────────────────────────────────────────────
async function loadProfile() {
  try {
    const res = await axios.post(`${api()}/api/auth/profile`, {}, { headers: authHeader() })
    const d = res.data
    profile.value = {
      username: d.username || d.Username || '',
      displayName: d.displayName,
      role: d.role || 'viewer',
      isBanned: d.isBanned || false,
      createdAt: d.createdAt,
      selectedMapSite: d.SelectedMapSite || d.selectedMapSite,
      selectedMapName: d.SelectedMapName || d.selectedMapName,
      avatarPath: d.avatarPath ?? undefined,
    }
    displayName.value = d.displayName || d.username || d.Username || ''
  } catch (e: unknown) {
    console.warn('[Profile] load failed', e)
  }
}

// ── Load all users (admin) ─────────────────────────────────────────────────────
async function loadAllUsers() {
  if (profile.value.role !== 'admin') return
  loadingUsers.value = true
  try {
    const res = await axios.get(`${api()}/api/admin/users`, { headers: authHeader() })
    allUsers.value = res.data
  } catch (e: unknown) {
    console.warn('[Profile] loadAllUsers failed', e)
    // Fallback mockup so UI is visible
    allUsers.value = [
      { username: profile.value.username, displayName: displayName.value, role: 'admin', isBanned: false, createdAt: new Date().toISOString() }
    ]
  } finally {
    loadingUsers.value = false
  }
}

// ── Save own profile ───────────────────────────────────────────────────────────
async function saveProfile() {
  savingProfile.value = true
  profileMsg.value = ''
  try {
    await axios.patch(`${api()}/api/user/profile`, { displayName: displayName.value }, { headers: authHeader() })
    profile.value.displayName = displayName.value
    profileMsg.value = 'Profile saved successfully.'
    profileMsgType.value = 'ok'
  } catch {
    profileMsg.value = 'Failed to save profile.'
    profileMsgType.value = 'err'
  } finally {
    savingProfile.value = false
    setTimeout(() => { profileMsg.value = '' }, 3000)
  }
}

// ── Avatar upload ──────────────────────────────────────────────────────────────
function triggerAvatarPick() {
  avatarInput.value?.click()
}

function onAvatarPicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 512_000) {
    avatarMsg.value = 'File too large (max 500 KB)'
    avatarMsgType.value = 'err'
    return
  }
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    avatarMsg.value = 'Only PNG and JPEG are allowed'
    avatarMsgType.value = 'err'
    return
  }
  avatarFile.value = file
  avatarPreview.value = URL.createObjectURL(file)
  avatarMsg.value = ''
}

async function uploadAvatar() {
  if (!avatarFile.value) return
  uploadingAvatar.value = true
  avatarMsg.value = ''
  try {
    const form = new FormData()
    form.append('avatar', avatarFile.value)
    const res = await axios.post(`${api()}/api/user/avatar`, form, {
      headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
    })
    profile.value.avatarPath = (res.data as { avatarPath: string }).avatarPath
    avatarCacheBust.value = Date.now()  // force img reload
    avatarPreview.value = null
    avatarFile.value = null
    if (avatarInput.value) avatarInput.value.value = ''
    avatarMsg.value = 'Avatar updated!'
    avatarMsgType.value = 'ok'
  } catch {
    avatarMsg.value = 'Upload failed. Please try again.'
    avatarMsgType.value = 'err'
  } finally {
    uploadingAvatar.value = false
    setTimeout(() => { avatarMsg.value = '' }, 4000)
  }
}

// ── Change own password ────────────────────────────────────────────────────────
async function updatePassword() {
  savingPwd.value = true
  pwdMsg.value = ''
  try {
    const res = await axios.patch(`${api()}/api/user/security`, { currentPassword: pwd.value.current, newPassword: pwd.value.newPwd }, { headers: authHeader() })
    if (res.data?.error) {
      pwdMsg.value = res.data.Message || 'Failed.'
      pwdMsgType.value = 'err'
    } else {
      pwdMsg.value = 'Password updated successfully.'
      pwdMsgType.value = 'ok'
      pwd.value = { current: '', newPwd: '', confirm: '' }
    }
  } catch {
    pwdMsg.value = 'Failed to update password.'
    pwdMsgType.value = 'err'
  } finally {
    savingPwd.value = false
    setTimeout(() => { pwdMsg.value = '' }, 4000)
  }
}

// ── Modify dialog ──────────────────────────────────────────────────────────────
function openModify(u: UserProfile) {
  modifyTarget.value = u
  modifyRole.value   = u.role
  modifyBanned.value = u.isBanned
  modifyOpen.value   = true
}

async function applyModify() {
  if (!modifyTarget.value) return
  savingModify.value = true
  try {
    await axios.patch(`${api()}/api/admin/user/role`, { username: modifyTarget.value.username, role: modifyRole.value }, { headers: authHeader() })
    await axios.patch(`${api()}/api/admin/user/ban`,  { username: modifyTarget.value.username, isBanned: modifyBanned.value }, { headers: authHeader() })
    modifyTarget.value.role    = modifyRole.value
    modifyTarget.value.isBanned = modifyBanned.value
    modifyOpen.value = false
  } catch (e: unknown) {
    console.warn('[Profile] applyModify failed', e)
  } finally {
    savingModify.value = false
    await loadAllUsers()
  }
}

// ── Ban / Unban ────────────────────────────────────────────────────────────────
async function banUser(username: string) {
  banningUser.value = username
  try {
    await axios.patch(`${api()}/api/admin/user/ban`, { username, isBanned: true }, { headers: authHeader() })
    await loadAllUsers()
    banTargetUsername.value = ''
  } finally { banningUser.value = '' }
}

async function unbanUser(username: string) {
  banningUser.value = username
  try {
    await axios.patch(`${api()}/api/admin/user/ban`, { username, isBanned: false }, { headers: authHeader() })
    await loadAllUsers()
  } finally { banningUser.value = '' }
}

// ── Security helpers ───────────────────────────────────────────────────────────
async function copyToken() {
  const t = localStorage.getItem('authToken') || ''
  await navigator.clipboard.writeText(t)
}

function logout() {
  localStorage.removeItem('authToken')
  localStorage.removeItem('username')
  localStorage.removeItem('auth')
  router.push('/login').catch(() => { /* ignore */ })
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadProfile()
  await loadAllUsers()
})
</script>

<style scoped>
@font-face {
  font-family: 'RedHatDisplay';
  src: url('~assets/fonts/Red_Hat_Display/RedHatDisplay-VariableFont_wght.ttf') format('truetype');
}

/* ── Layout ── */
.profile-page {
  height: 100%;
  background: #1c1c1e;
  font-family: 'RedHatDisplay', sans-serif;
}

.profile-layout {
  display: flex;
  height: 100%;
  min-height: 0;
}

/* ── Sidebar ── */
.profile-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: #111;
  border-right: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.avatar-card {
  padding: 28px 20px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.avatar-big {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  margin-bottom: 4px;
}

.avatar-initials {
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -1px;
}

.profile-name {
  font-size: 15px;
  font-weight: 700;
  color: #f5f5f7;
  text-align: center;
}

.profile-username {
  font-size: 12px;
  color: #8e8e93;
  margin-top: -2px;
}

.role-chip {
  margin-top: 4px;
}

.profile-joined {
  font-size: 11px;
  color: #636366;
  margin-top: 4px;
}

.profile-nav {
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

.nav-item:hover {
  background: rgba(255,255,255,0.06);
  color: #f5f5f7;
}

.nav-item--active {
  background: rgba(10, 132, 255, 0.18);
  color: #0a84ff;
}

/* ── Content Area ── */
.profile-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
  min-width: 0;
}

.tab-section {
  max-width: 760px;
}

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

/* ── Cards ── */
.card-block {
  background: #2c2c2e;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  padding: 20px 24px;
}

.block-title {
  font-size: 13px;
  font-weight: 700;
  color: #8e8e93;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 16px;
}

/* ── Form ── */
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

.form-input {
  flex: 1;
}

:deep(.form-input .q-field__control) {
  background: #1c1c1e;
  border-color: rgba(255,255,255,0.12);
}

:deep(.form-input .q-field__native),
:deep(.form-input input) {
  color: #f5f5f7;
}

.save-btn {
  margin-top: 4px;
  border-radius: 10px;
  padding: 8px 20px;
  font-weight: 600;
  text-transform: none;
}

.msg-banner {
  margin-top: 10px;
  border-radius: 8px;
  font-size: 13px;
}
.msg-ok { background: rgba(48,209,88,0.15) !important; color: #30d158 !important; }
.msg-err { background: rgba(255,69,58,0.15) !important; color: #ff453a !important; }

/* ── User Table ── */
.user-table-header {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr 1fr 160px;
  gap: 8px;
  background: #3a3a3c;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #8e8e93;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}

.user-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr 1fr 160px;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: background 0.15s;
}

.user-row:hover {
  background: rgba(255,255,255,0.04);
}

.user-row--banned {
  background: rgba(255,69,58,0.05);
  border-color: rgba(255,69,58,0.12);
}

.user-row-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #f5f5f7;
  overflow: hidden;
}

.dim-text { color: #8e8e93; }

.col-right { justify-content: flex-end; }

.user-mini-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.banned-avatar { background: #3a1a1a; color: #ff6b6b; }
.user-name-text { font-weight: 600; }

.table-loading, .table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: #636366;
  font-size: 13px;
  gap: 8px;
}

/* ── Ban input ── */
.ban-input-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.ban-btn {
  border-radius: 10px;
  padding: 8px 20px;
  font-weight: 600;
  text-transform: none;
  flex-shrink: 0;
}

/* ── Security ── */
.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}

.session-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-details {
  display: flex;
  flex-direction: column;
}

.session-device {
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;
}

.session-meta {
  font-size: 12px;
  color: #8e8e93;
}

.font-mono :deep(input) {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  letter-spacing: 0.05em;
}

.tfa-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  gap: 10px;
}

.tfa-text {
  color: #636366;
  font-size: 13px;
  margin: 0;
}

/* ── Forbidden ── */
.forbidden-card {
  background: #2c2c2e;
  border-radius: 14px;
  padding: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #636366;
  font-size: 14px;
  border: 1px dashed rgba(255,255,255,0.1);
}

/* ── Modify Dialog ── */
.modify-card {
  width: 420px;
  background: #1e1e1e;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.1);
}

.modify-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px 20px;
}

.modify-title {
  font-size: 16px;
  color: #f5f5f7;
}

.role-picker {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.1);
  cursor: pointer;
  color: #8e8e93;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.18s;
}

.role-option:hover { background: rgba(255,255,255,0.06); color: #f5f5f7; }

.role-option--active {
  background: rgba(10,132,255,0.2);
  border-color: rgba(10,132,255,0.5);
  color: #0a84ff;
}

/* ── Scrollbars ── */
.profile-sidebar::-webkit-scrollbar,
.profile-content::-webkit-scrollbar { width: 4px; }
.profile-sidebar::-webkit-scrollbar-thumb,
.profile-content::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 2px;
}

/* ── Avatar upload ── */
.hidden-input { display: none; }

.avatar-big-wrap {
  position: relative;
  cursor: pointer;
  margin-bottom: 4px;
}

.avatar-big-wrap:hover .avatar-edit-overlay { opacity: 1; }

.avatar-img {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}

.avatar-edit-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s;
}

.avatar-upload-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.avatar-preview-wrap {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}

.avatar-preview-wrap:hover .avatar-edit-overlay-sm { opacity: 1; }

.avatar-preview-img {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  border: 2px solid rgba(255,255,255,0.15);
}

.avatar-preview-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  border: 2px dashed rgba(255,255,255,0.2);
}

.avatar-edit-overlay-sm {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s;
}

.avatar-upload-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.avatar-upload-hint {
  font-size: 12px;
  color: #636366;
}

.msg-ok-text { font-size: 12px; color: #30d158; margin-top: 4px; }
.msg-err-text { font-size: 12px; color: #ff453a; margin-top: 4px; }
</style>
