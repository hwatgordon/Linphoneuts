<template>
  <view class="page">
    <scroll-view scroll-y class="page__scroll">
      <view class="section">
        <view class="section__header">
          <text class="section__title">Service Controls</text>
          <text class="section__subtitle">
            {{ serviceStatusLabel }} · {{ service.initialized ? 'Initialized' : 'Not initialized' }}
          </text>
        </view>
        <view class="button-row">
          <button type="primary" class="button" :loading="loading.init" @click="handleInit">
            Init
          </button>
          <button
            type="primary"
            class="button"
            :loading="loading.start"
            :disabled="service.running"
            @click="handleStart"
          >
            Start Service
          </button>
          <button
            type="warn"
            class="button button--outline"
            :loading="loading.stop"
            :disabled="!service.running"
            @click="handleStop"
          >
            Stop Service
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
import { computed, reactive } from 'vue'
import { useAppState, manualNavigate } from '@/store/appState'
import {
  initService,
  startService,
  stopService,
  simulateIncomingCall,
  isUsingMock
} from '@/services/utssdk'

const state = useAppState()
const loading = reactive({
  init: false,
  start: false,
  stop: false
})

const service = computed(() => state.service)
const registration = computed(() => state.registration)
const call = computed(() => state.call)
const messaging = computed(() => state.messaging)
const events = computed(() => state.events)
const isMock = computed(() => isUsingMock())

const serviceStatusLabel = computed(() => (service.value.running ? 'Running' : 'Stopped'))
const registrationLabel = computed(() => registration.value.status || 'idle')
const callStateLabel = computed(() => {
  if (call.value.state === 'connected') {
    return `Connected (${call.value.direction || 'n/a'})`
  }
  if (call.value.state === 'incoming') {
    return 'Incoming call'
  }
  if (call.value.state === 'dialing') {
    return 'Dialing'
  }
  if (call.value.state === 'ended') {
    return call.value.reason ? `Ended (${call.value.reason})` : 'Ended'
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

function handleInit() {
  runWithLoading('init', () => initService({ debug: true }))
}

function handleStart() {
  runWithLoading('start', () => startService())
}

function handleStop() {
  runWithLoading('stop', () => stopService())
}

async function simulateIncoming() {
  const success = await simulateIncomingCall()
  uni.showToast({
    title: success ? 'Incoming call simulated' : 'Mock only feature',
    icon: 'none'
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
