<template>
  <view class="page">
    <scroll-view scroll-y class="page__scroll">
      <view class="section">
        <view class="section__header">
          <text class="section__title">Account Details</text>
          <text class="section__subtitle">Fill in SIP/VoIP credentials for registration</text>
        </view>
        <view class="form">
          <view class="form__field">
            <text class="form__label">Username</text>
            <input class="form__input" v-model="form.username" placeholder="e.g. 1001" />
          </view>
          <view class="form__field">
            <text class="form__label">Password</text>
            <input
              class="form__input"
              v-model="form.password"
              password
              placeholder="Password"
            />
          </view>
          <view class="form__field">
            <text class="form__label">Domain</text>
            <input class="form__input" v-model="form.domain" placeholder="sip.example.com" />
          </view>
          <view class="form__field">
            <text class="form__label">Display Name</text>
            <input class="form__input" v-model="form.displayName" placeholder="Optional" />
          </view>
          <view class="form__field">
            <text class="form__label">Transport</text>
            <input class="form__input" v-model="form.transport" placeholder="Optional: udp / tcp / tls" />
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section__header">
          <text class="section__title">Status</text>
        </view>
        <view class="status">
          <text class="status__label">Current Status:</text>
          <text class="status__value">{{ registrationStatus }}</text>
        </view>
        <view v-if="registration.error" class="status status--error">
          <text class="status__label">Error:</text>
          <text class="status__value">{{ registration.error }}</text>
        </view>
      </view>

      <view class="section">
        <view class="section__header">
          <text class="section__title">Actions</text>
        </view>
        <view class="button-grid">
          <button class="button" :loading="loading.init" @click="handleInit">Init</button>
          <button class="button button--primary" :loading="loading.register" @click="handleRegister">
            Register
          </button>
          <button class="button" :loading="loading.unregister" @click="handleUnregister">
            Unregister
          </button>
          <button class="button button--danger" :loading="loading.dispose" @click="handleDispose">
            Dispose
          </button>
        </view>
      </view>

      <view class="section">
        <event-log :events="events" :limit="25" />
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { useAppState } from '@/store/appState'
import {
  initService,
  registerAccount,
  unregisterAccount,
  disposeService,
  on as onEvent,
  off as offEvent
} from '@/services/utssdk'

const state = useAppState()
const registration = computed(() => state.registration)
const events = computed(() => state.events)

const form = reactive({
  username: '',
  password: '',
  domain: '',
  displayName: '',
  transport: ''
})

const loading = reactive({
  init: false,
  register: false,
  unregister: false,
  dispose: false
})

const registrationStatus = computed(() => {
  const status = registration.value.state || 'none'
  if (registration.value.reason) {
    return `${status} (${registration.value.reason})`
  }
  return status
})

function subscribeEvents() {
  onEvent('registration', handleRegistrationEvent)
  onEvent('service', handleServiceEvent)
}

function unsubscribeEvents() {
  offEvent('registration', handleRegistrationEvent)
  offEvent('service', handleServiceEvent)
}

function handleRegistrationEvent(payload) {
  if (payload?.error) {
    uni.showToast({ title: payload.error, icon: 'none' })
  }
}

function handleServiceEvent(payload) {
  if (payload?.initialized) {
    uni.showToast({ title: 'Service initialized', icon: 'none' })
  }
  if (payload?.initialized === false) {
    uni.showToast({ title: 'Service disposed', icon: 'none' })
  }
  if (payload?.logLevel) {
    uni.showToast({ title: `Log level: ${payload.logLevel}`, icon: 'none' })
  }
}

onMounted(() => {
  subscribeEvents()
})

onUnmounted(() => {
  unsubscribeEvents()
})

async function withLoading(key, fn) {
  if (loading[key]) return
  loading[key] = true
  try {
    await fn()
  } catch (error) {
    uni.showToast({ title: error?.message || 'Operation failed', icon: 'none' })
  } finally {
    loading[key] = false
  }
}

function buildConfigFromForm() {
  const config = {
    sipServer: form.domain,
    username: form.username,
    password: form.password,
    displayName: form.displayName
  }
  if (form.transport) {
    config.transport = form.transport
  }
  return config
}

function handleInit() {
  const config = buildConfigFromForm()
  if (!config.sipServer || !config.username || !config.password) {
    uni.showToast({ title: 'Domain, username and password required', icon: 'none' })
    return
  }
  withLoading('init', () => initService(config))
}

function handleRegister() {
  withLoading('register', () => registerAccount())
}

function handleUnregister() {
  withLoading('unregister', () => unregisterAccount())
}

function handleDispose() {
  withLoading('dispose', () => disposeService())
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f1f5f9;
}

.page__scroll {
  height: 100vh;
  padding: 32rpx;
  box-sizing: border-box;
}

.section {
  margin-bottom: 32rpx;
}

.section__header {
  margin-bottom: 16rpx;
}

.section__title {
  font-size: 32rpx;
  font-weight: 600;
  color: #0f172a;
}

.section__subtitle {
  font-size: 24rpx;
  color: #475569;
}

.form {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.06);
}

.form__field {
  margin-bottom: 24rpx;
}

.form__label {
  font-size: 24rpx;
  color: #475569;
  margin-bottom: 8rpx;
  display: block;
}

.form__input {
  background-color: #f8fafc;
  border-radius: 12rpx;
  padding: 20rpx;
  border: 1px solid #e2e8f0;
  font-size: 26rpx;
}

.status {
  display: flex;
  gap: 12rpx;
  align-items: center;
  padding: 20rpx 24rpx;
  background-color: #e0f2fe;
  border-radius: 12rpx;
  color: #0f172a;
  margin-bottom: 16rpx;
}

.status--error {
  background-color: #fee2e2;
  color: #b91c1c;
}

.status__label {
  font-size: 24rpx;
  font-weight: 500;
}

.status__value {
  font-size: 26rpx;
}

.button-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220rpx, 1fr));
  gap: 16rpx;
}

.button {
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  background-color: #e2e8f0;
  color: #0f172a;
  border-radius: 12rpx;
  font-size: 26rpx;
}

.button--primary {
  background-color: #2563eb;
  color: #ffffff;
}

.button--danger {
  background-color: #dc2626;
  color: #ffffff;
}
</style>
