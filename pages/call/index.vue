<template>
  <view class="page">
    <scroll-view scroll-y class="page__scroll">
      <view class="section">
        <view class="section__header">
          <text class="section__title">Call Control</text>
          <text class="section__subtitle">Manage incoming and active calls</text>
        </view>
        <view class="call-card">
          <text class="call-card__state">{{ stateLabel }}</text>
          <text v-if="call.number" class="call-card__number">{{ call.number }}</text>
          <text v-if="call.direction" class="call-card__direction">{{ call.direction.toUpperCase() }}</text>
          <text v-if="timerDisplay" class="call-card__timer">{{ timerDisplay }}</text>
        </view>
      </view>

      <view class="section" v-if="isIncoming">
        <view class="section__header">
          <text class="section__title">Incoming Call</text>
        </view>
        <view class="button-row">
          <button class="button button--primary" :loading="loading.answer" @click="handleAnswer">
            Answer
          </button>
          <button class="button button--danger" :loading="loading.decline" @click="handleDecline">
            Decline
          </button>
        </view>
      </view>

      <view class="section" v-else>
        <view class="section__header">
          <text class="section__title">Active Call Controls</text>
        </view>
        <view class="button-row">
          <button class="button" :disabled="!canHangup" :loading="loading.hangup" @click="handleHangup">
            Hangup
          </button>
        </view>
      </view>

      <view class="section">
        <view class="section__header">
          <text class="section__title">Audio Route</text>
          <text class="section__subtitle">Select preferred audio output for the call</text>
        </view>
        <view class="audio-routes">
          <button
            v-for="route in audioRoutes"
            :key="route.value"
            class="audio-route"
            :class="{ 'audio-route--active': call.audioRoute === route.value }"
            @click="selectAudioRoute(route.value)"
          >
            {{ route.label }}
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
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useAppState } from '@/store/appState'
import {
  answerCall,
  declineCall,
  hangupCall,
  setAudioOutput,
  on as onEvent,
  off as offEvent
} from '@/services/utssdk'

const state = useAppState()
const call = computed(() => state.call)
const events = computed(() => state.events)

const loading = reactive({
  answer: false,
  decline: false,
  hangup: false
})

const elapsedMs = ref(0)
let timer = null

const audioRouteLabels = {
  system: 'System',
  earpiece: 'Earpiece',
  speaker: 'Speaker',
  bluetooth: 'Bluetooth',
  unknown: 'Unknown'
}

const audioRoutes = computed(() => {
  if (Array.isArray(call.value.devices) && call.value.devices.length > 0) {
    return call.value.devices.map((device) => ({
      value: device.type || device.id,
      label: device.name || audioRouteLabels[device.type] || device.type || device.id
    }))
  }
  const fallback = call.value.availableRoutes && call.value.availableRoutes.length > 0
    ? call.value.availableRoutes
    : ['system', 'earpiece', 'speaker', 'bluetooth']
  return fallback.map((route) => ({
    value: route,
    label: audioRouteLabels[route] || route
  }))
})

const isIncoming = computed(() => call.value.state === 'incoming')
const canHangup = computed(() => ['connected', 'dialing', 'incoming'].includes(call.value.state))

const stateLabel = computed(() => {
  switch (call.value.state) {
    case 'incoming':
      return 'Incoming call'
    case 'dialing':
      return 'Dialing...'
    case 'connected':
      return 'Connected'
    case 'ended':
      return call.value.reason ? `Ended (${call.value.reason})` : 'Call ended'
    default:
      return call.value.state || 'Idle'
  }
})

const timerDisplay = computed(() => {
  if (call.value.state === 'connected') {
    return formatDuration(elapsedMs.value)
  }
  if (call.value.state === 'ended' && call.value.duration) {
    return formatDuration(call.value.duration)
  }
  return ''
})

watch(
  () => call.value.state,
  (state) => {
    if (state === 'connected') {
      startTimer()
    } else {
      stopTimer()
      if (state === 'ended' && call.value.duration) {
        elapsedMs.value = call.value.duration
      } else {
        elapsedMs.value = 0
      }
    }
  },
  { immediate: true }
)

function startTimer() {
  stopTimer()
  updateElapsed()
  timer = setInterval(updateElapsed, 1000)
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function updateElapsed() {
  if (call.value.startedAt) {
    elapsedMs.value = Date.now() - call.value.startedAt
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function subscribeEvents() {
  onEvent('call:state', handleCallEvent)
  onEvent('call:audio-route', handleAudioRouteEvent)
}

function unsubscribeEvents() {
  offEvent('call:state', handleCallEvent)
  offEvent('call:audio-route', handleAudioRouteEvent)
}

function handleCallEvent(payload) {
  if (payload?.state === 'incoming') {
    uni.showToast({ title: 'Incoming call', icon: 'none' })
  }
  if (payload?.state === 'connected') {
    uni.showToast({ title: 'Call connected', icon: 'none' })
  }
  if (payload?.state === 'ended') {
    uni.showToast({ title: 'Call ended', icon: 'none' })
  }
}

function handleAudioRouteEvent(payload) {
  if (payload?.route) {
    uni.showToast({ title: `Audio route: ${payload.route}`, icon: 'none' })
  }
}

onMounted(() => {
  subscribeEvents()
})

onUnmounted(() => {
  unsubscribeEvents()
  stopTimer()
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

function handleAnswer() {
  withLoading('answer', () => answerCall())
}

function handleDecline() {
  withLoading('decline', () => declineCall())
}

function handleHangup() {
  withLoading('hangup', () => hangupCall())
}

async function selectAudioRoute(route) {
  try {
    await setAudioOutput(route)
  } catch (error) {
    uni.showToast({ title: error?.message || 'Audio route failed', icon: 'none' })
  }
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

.call-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  align-items: center;
}

.call-card__state {
  font-size: 34rpx;
  font-weight: 600;
  color: #0f172a;
}

.call-card__number {
  font-size: 40rpx;
  color: #2563eb;
}

.call-card__direction {
  font-size: 24rpx;
  color: #475569;
}

.call-card__timer {
  font-size: 36rpx;
  color: #16a34a;
  margin-top: 12rpx;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.button {
  flex: 1;
  min-width: 220rpx;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  background-color: #e2e8f0;
  color: #0f172a;
  border-radius: 12rpx;
  font-size: 26rpx;
}

.button--primary {
  background-color: #22c55e;
  color: #ffffff;
}

.button--danger {
  background-color: #ef4444;
  color: #ffffff;
}

.audio-routes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220rpx, 1fr));
  gap: 16rpx;
}

.audio-route {
  height: 80rpx;
  line-height: 80rpx;
  text-align: center;
  background-color: #ffffff;
  color: #0f172a;
  border-radius: 12rpx;
  border: 2rpx solid #cbd5f5;
  font-size: 24rpx;
}

.audio-route--active {
  background-color: #2563eb;
  color: #ffffff;
  border-color: #1d4ed8;
}
</style>
