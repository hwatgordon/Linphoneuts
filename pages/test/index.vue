<template>
  <view class="page">
    <scroll-view scroll-y class="page__scroll">
      <view class="section">
        <view class="section__header">
          <text class="section__title">Service Controls</text>
          <text class="section__subtitle">
            {{ serviceStatusLabel }} · provider: {{ serviceProviderLabel }} · log: {{ serviceLogLevel }}
          </text>
        </view>
        <view class="button-row">
          <button type="primary" class="button" :loading="loading.init" @click="handleInit">
            Init
          </button>
          <button
            class="button"
            :loading="loading.register"
            :disabled="!service.initialized"
            @click="handleRegister"
          >
            Register
          </button>
          <button class="button" :loading="loading.unregister" @click="handleUnregister">
            Unregister
          </button>
          <button
            type="warn"
            class="button button--outline"
            :loading="loading.dispose"
            @click="handleDispose"
          >
            Dispose
          </button>
        </view>
        <view class="button-row">
          <button class="button" :loading="loading.bootstrap" @click="handleBootstrap">
            Refresh State
          </button>
          <button class="button" :loading="loading.logLevel" @click="handleToggleLogLevel">
            Toggle Log Level
          </button>
        </view>
      </view>

      <view class="section">
        <view class="section__header">
          <text class="section__title">Current Status</text>
        </view>
        <view class="status-grid">
          <view class="status-card">
            <text class="status-card__label">Registration</text>
            <text class="status-card__value">{{ registrationLabel }}</text>
            <text v-if="registration.error" class="status-card__error">{{ registration.error }}</text>
          </view>
          <view class="status-card">
            <text class="status-card__label">Call State</text>
            <text class="status-card__value">{{ callStateLabel }}</text>
            <text v-if="call.number" class="status-card__hint">{{ call.number }}</text>
          </view>
          <view class="status-card">
            <text class="status-card__label">Audio Route</text>
            <text class="status-card__value">{{ audioRouteLabel }}</text>
          </view>
          <view class="status-card">
            <text class="status-card__label">Messages</text>
            <text class="status-card__value">{{ messageSummary }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section__header">
          <text class="section__title">Navigate to Modules</text>
        </view>
        <view class="nav-grid">
          <button class="nav-button" @click="go('registration')">Registration</button>
          <button class="nav-button" @click="go('dialer')">Dialer</button>
          <button class="nav-button" @click="go('call')">Incoming / In-Call</button>
          <button class="nav-button" @click="go('messages')">Messages</button>
        </view>
      </view>

      <view v-if="isIOSPlatform" class="section">
        <view class="section__header">
          <text class="section__title">iOS Bridge Harness</text>
          <text class="section__subtitle">Drive the Objective-C wrapper from the demo</text>
        </view>
        <view class="harness-form">
          <view class="harness-form__field">
            <text class="harness-form__label">SIP Server</text>
            <input class="harness-form__input" v-model="iosHarness.sipServer" placeholder="sip.example.com" />
          </view>
          <view class="harness-form__row">
            <view class="harness-form__field harness-form__field--half">
              <text class="harness-form__label">Username</text>
              <input class="harness-form__input" v-model="iosHarness.username" placeholder="Extension" />
            </view>
            <view class="harness-form__field harness-form__field--half">
              <text class="harness-form__label">Password</text>
              <input class="harness-form__input" v-model="iosHarness.password" password placeholder="Password" />
            </view>
          </view>
          <view class="harness-form__row">
            <view class="harness-form__field harness-form__field--half">
              <text class="harness-form__label">Display Name</text>
              <input class="harness-form__input" v-model="iosHarness.displayName" placeholder="Optional" />
            </view>
            <view class="harness-form__field harness-form__field--half">
              <text class="harness-form__label">Transport</text>
              <input class="harness-form__input" v-model="iosHarness.transport" placeholder="udp / tcp / tls" />
            </view>
          </view>
          <view class="harness-form__field">
            <text class="harness-form__label">Test Number / SIP URI</text>
            <input class="harness-form__input" v-model="iosHarness.testNumber" placeholder="sip:echo@conference.linphone.org" />
          </view>
        </view>
        <view class="button-row button-row--wrap">
          <button
            class="button button--primary"
            :loading="loading.iosRegister"
            @click="runIosRegistration"
          >
            Init &amp; Register
          </button>
          <button class="button" :loading="loading.iosCall" @click="dialIosEcho">Dial Test Number</button>
          <button class="button" :loading="loading.iosState" @click="fetchIosState">Fetch Native State</button>
          <button class="button button--outline" :loading="loading.iosDispose" @click="disposeIos">
            Dispose Core
          </button>
        </view>
        <view v-if="iosStateJson" class="ios-state">
          <text class="ios-state__label">Latest native state snapshot</text>
          <scroll-view class="ios-state__scroll" scroll-y>
            <text class="ios-state__code">{{ iosStateJson }}</text>
          </scroll-view>
        </view>
      </view>

      <view v-if="isMock" class="section">
        <view class="section__header">
          <text class="section__title">Mock Utilities</text>
          <text class="section__subtitle">Simulate events when native plugin is unavailable</text>
        </view>
        <view class="button-row">
          <button class="button" @click="simulateIncoming">Simulate Incoming Call</button>
        </view>
      </view>

      <view class="section section--log">
        <event-log :events="events" :limit="30" />
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useAppState, manualNavigate } from '@/store/appState'
import {
  initService,
  registerAccount,
  unregisterAccount,
  dialNumber,
  disposeService,
  getNativeState,
  simulateIncomingCall,
  isUsingMock,
  bootstrapServiceState,
  setLogLevel
} from '@/services/utssdk'

const state = useAppState()
const loading = reactive({
  init: false,
  dispose: false,
  register: false,
  unregister: false,
  bootstrap: false,
  logLevel: false,
  iosRegister: false,
  iosCall: false,
  iosState: false,
  iosDispose: false
})

const service = computed(() => state.service)
const registration = computed(() => state.registration)
const call = computed(() => state.call)
const messaging = computed(() => state.messaging)
const events = computed(() => state.events)
const isMock = computed(() => isUsingMock())

const iosState = ref(null)
const iosHarness = reactive({
  sipServer: 'sip.linphone.org',
  username: '',
  password: '',
  displayName: 'iOS Demo',
  transport: 'tls',
  testNumber: 'sip:echo@conference.linphone.org'
})

const systemInfo = (() => {
  try {
    if (typeof uni !== 'undefined' && typeof uni.getSystemInfoSync === 'function') {
      return uni.getSystemInfoSync()
    }
  } catch (error) {
    // ignore runtime failures
  }
  return {}
})()

const isIOSPlatform = computed(() => {
  const platform = (systemInfo.platform || systemInfo.osName || '').toLowerCase()
  return platform === 'ios' || platform === 'iphone' || platform === 'ipad'
})

const iosStateJson = computed(() => (iosState.value ? JSON.stringify(iosState.value, null, 2) : ''))

const serviceStatusLabel = computed(() => (service.value.initialized ? 'Initialized' : 'Not initialized'))
const serviceProviderLabel = computed(() => {
  if (service.value.provider) {
    return service.value.provider
  }
  return isMock.value ? 'mock' : 'native'
})
const serviceLogLevel = computed(() => service.value.logLevel || 'info')
const registrationLabel = computed(() => registration.value.state || 'none')
const callStateLabel = computed(() => {
  if (call.value.state === 'connected') {
    return `Connected (${call.value.direction || 'n/a'})`
  }
  if (call.value.state === 'incoming') {
    return 'Incoming call'
  }
  if (call.value.state === 'outgoing') {
    return 'Outgoing call'
  }
  if (call.value.state === 'ended') {
    return call.value.reason ? `Ended (${call.value.reason})` : 'Ended'
  }
  if (call.value.state === 'error') {
    return call.value.reason ? `Error (${call.value.reason})` : 'Error'
  }
  return call.value.state || 'idle'
})
const audioRouteLabel = computed(() => call.value.audioRoute || 'system')
const messageSummary = computed(() => {
  const received = messaging.value.received?.length || 0
  return `${received} received`
})

function go(routeKey) {
  manualNavigate(routeKey)
}

async function runWithLoading(key, action) {
  if (loading[key]) return
  loading[key] = true
  try {
    await action()
  } catch (error) {
    uni.showToast({
      title: error?.message || 'Operation failed',
      icon: 'none'
    })
  } finally {
    loading[key] = false
  }
}

function buildConfigFromRegistration() {
  const detail = registration.value.detail || {}
  const candidate = {
    sipServer: detail.sipServer || detail.domain,
    username: detail.username,
    password: detail.password,
    displayName: detail.displayName,
    transport: detail.transport
  }
  if (candidate.sipServer && candidate.username && candidate.password) {
    return candidate
  }
  const harnessCandidate = {
    sipServer: iosHarness.sipServer,
    username: iosHarness.username,
    password: iosHarness.password,
    displayName: iosHarness.displayName,
    transport: iosHarness.transport
  }
  if (harnessCandidate.sipServer && harnessCandidate.username && harnessCandidate.password) {
    return harnessCandidate
  }
  return null
}

function handleInit() {
  const config = buildConfigFromRegistration()
  if (!config) {
    uni.showToast({ title: 'Provide SIP config via Registration page first', icon: 'none' })
    return
  }
  runWithLoading('init', () => initService(config))
}

function handleRegister() {
  if (!service.value.initialized) {
    uni.showToast({ title: 'Init the service first', icon: 'none' })
    return
  }
  runWithLoading('register', async () => {
    await registerAccount()
    uni.showToast({ title: 'Registration requested', icon: 'none' })
  })
}

function handleUnregister() {
  runWithLoading('unregister', async () => {
    await unregisterAccount()
    uni.showToast({ title: 'Unregister requested', icon: 'none' })
  })
}

function handleDispose() {
  runWithLoading('dispose', async () => {
    await disposeService()
    uni.showToast({ title: 'Service disposed', icon: 'none' })
  })
}

function handleBootstrap() {
  runWithLoading('bootstrap', async () => {
    await bootstrapServiceState({ silent: true })
    uni.showToast({ title: 'State refreshed', icon: 'none' })
  })
}

function handleToggleLogLevel() {
  const next = serviceLogLevel.value === 'debug' ? 'info' : 'debug'
  runWithLoading('logLevel', async () => {
    await setLogLevel(next)
    uni.showToast({ title: `Log level: ${next}`, icon: 'none' })
  })
}

async function simulateIncoming() {
  const success = await simulateIncomingCall()
  uni.showToast({
    title: success ? 'Incoming call simulated' : 'Mock only feature',
    icon: 'none'
  })
}

function buildIosRegistrationPayload() {
  return {
    username: iosHarness.username,
    password: iosHarness.password,
    domain: iosHarness.sipServer,
    displayName: iosHarness.displayName,
    transport: iosHarness.transport
  }
}

function runIosRegistration() {
  const payload = buildIosRegistrationPayload()
  if (!payload.username || !payload.password || !payload.domain) {
    uni.showToast({ title: 'Provide username, password and server', icon: 'none' })
    return
  }
  runWithLoading('iosRegister', async () => {
    await initService({
      sipServer: payload.domain,
      username: payload.username,
      password: payload.password,
      displayName: payload.displayName,
      transport: payload.transport
    })
    await registerAccount()
    uni.showToast({ title: 'Registration requested', icon: 'none' })
  })
}

function dialIosEcho() {
  if (!iosHarness.testNumber) {
    uni.showToast({ title: 'Set a test number first', icon: 'none' })
    return
  }
  runWithLoading('iosCall', async () => {
    await dialNumber({ number: iosHarness.testNumber })
    uni.showToast({ title: 'Dialing echo service', icon: 'none' })
  })
}

function fetchIosState() {
  runWithLoading('iosState', async () => {
    const snapshot = await getNativeState()
    iosState.value = snapshot || {}
    uni.showToast({ title: 'State refreshed', icon: 'none' })
  })
}

function disposeIos() {
  runWithLoading('iosDispose', async () => {
    await disposeService()
    iosState.value = null
    uni.showToast({ title: 'Native core disposed', icon: 'none' })
  })
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
  margin-bottom: 20rpx;
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

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.button {
  padding: 0 20rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 26rpx;
  background-color: #2563eb;
  color: #ffffff;
  border: none;
}

.button--outline {
  background-color: #ffffff;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.button-row--wrap {
  flex-wrap: wrap;
}

.harness-form {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.08);
  margin-bottom: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.harness-form__row {
  display: flex;
  gap: 20rpx;
  flex-wrap: wrap;
}

.harness-form__field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.harness-form__field--half {
  min-width: 240rpx;
  flex: 1;
}

.harness-form__label {
  font-size: 24rpx;
  color: #475569;
}

.harness-form__input {
  background-color: #f8fafc;
  border-radius: 12rpx;
  padding: 20rpx;
  border: 1px solid #e2e8f0;
  font-size: 26rpx;
}

.ios-state {
  background-color: #0f172a;
  border-radius: 16rpx;
  padding: 24rpx;
  color: #e0f2fe;
  margin-top: 16rpx;
}

.ios-state__label {
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}

.ios-state__scroll {
  max-height: 240rpx;
}

.ios-state__code {
  font-family: 'Courier New', monospace;
  font-size: 24rpx;
  white-space: pre-wrap;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240rpx, 1fr));
  gap: 24rpx;
}

.status-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.08);
}

.status-card__label {
  font-size: 24rpx;
  color: #64748b;
}

.status-card__value {
  font-size: 30rpx;
  font-weight: 600;
  color: #0f172a;
  margin-top: 12rpx;
}

.status-card__hint {
  font-size: 24rpx;
  color: #334155;
  margin-top: 4rpx;
}

.status-card__error {
  font-size: 24rpx;
  color: #dc2626;
  margin-top: 8rpx;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240rpx, 1fr));
  gap: 20rpx;
}

.nav-button {
  background-color: #0f172a;
  color: #f8fafc;
  border-radius: 16rpx;
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  font-size: 28rpx;
}

.section--log {
  min-height: 500rpx;
}
</style>
