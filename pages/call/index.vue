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
          <button
            class="button button--primary"
            :disabled="!canAnswer"
            :loading="loading.answer"
            @click="handleAnswer"
          >
            Answer
          </button>
          <button
            class="button button--danger"
            :disabled="!canHangup"
            :loading="loading.hangup"
            @click="handleHangup"
          >
            Hangup
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
            :class="{ 'audio-route--active': route.selected }"
            :disabled="route.selected || audioRouteLoading === route.value"
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
import { ROUTES, requestNavigation, useAppState } from '@/store/appState'
import service from '@/services/utssdk'

const state = useAppState()
const call = computed(() => state.call)
const events = computed(() => state.events)

const loading = reactive({
  answer: false,
  hangup: false
})

const audioRouteLoading = ref('')
const elapsedMs = ref(0)
let timer = null

const audioRouteLabels = {
  system: 'System',
  earpiece: 'Earpiece',
  speaker: 'Speaker',
  bluetooth: 'Bluetooth',
  unknown: 'Unknown'
}

const DEFAULT_ROUTES = ['system', 'earpiece', 'speaker', 'bluetooth']

function normalizeRoute(route) {
  return typeof route === 'string' ? route.toLowerCase() : ''
}

function formatAudioRouteLabel(route, device) {
  const key = normalizeRoute(route)
  const fallback =
    typeof route === 'string' && route.length > 0
      ? route.charAt(0).toUpperCase() + route.slice(1)
      : audioRouteLabels.system
  const base = audioRouteLabels[key] || fallback
  if (device?.name && key !== 'system') {
    return `${base} (${device.name})`
  }
  return base
}

const audioRoutes = computed(() => {
  const devices = Array.isArray(call.value.devices) ? call.value.devices : []
  const currentRoute = normalizeRoute(call.value.audioRoute || 'system')
  const entries = []
  const seen = new Set()

  devices.forEach((device) => {
    const route = device?.type || device?.route || device?.id
    const normalized = normalizeRoute(route)
    if (!normalized || seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    entries.push({
      value: normalized,
      label: formatAudioRouteLabel(normalized, device),
      selected: normalized === currentRoute
    })
  })

  const fallback =
    call.value.availableRoutes && call.value.availableRoutes.length > 0
      ? call.value.availableRoutes
      : DEFAULT_ROUTES

  fallback.forEach((route) => {
    const normalized = normalizeRoute(route)
    if (!normalized || seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    entries.push({
      value: normalized,
      label: formatAudioRouteLabel(normalized),
      selected: normalized === currentRoute
    })
  })

  if (!entries.length) {
    entries.push({
      value: 'system',
      label: audioRouteLabels.system,
      selected: currentRoute === 'system'
    })
  }

  return entries
})

const isIncoming = computed(() => call.value.state === 'incoming')
const canAnswer = computed(() => isIncoming.value && !loading.answer)
const canHangup = computed(
  () => ['incoming', 'outgoing', 'connected'].includes(call.value.state) && !loading.hangup
)

const stateLabel = computed(() => {
  switch (call.value.state) {
    case 'incoming':
      return 'Incoming call'
    case 'outgoing':
      return 'Dialing...'
    case 'connected':
      return 'Connected'
    case 'ended':
      return call.value.reason ? `Ended (${call.value.reason})` : 'Call ended'
    case 'error':
      return call.value.reason ? `Error (${call.value.reason})` : 'Call error'
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
  (stateValue) => {
    if (stateValue === 'connected') {
      startTimer()
    } else {
      stopTimer()
      if (stateValue === 'ended' && call.value.duration) {
        elapsedMs.value = call.value.duration
      } else {
        elapsedMs.value = 0
      }
    }

    if (['ended', 'idle', 'error'].includes(stateValue)) {
      requestNavigation(ROUTES.dialer, { auto: true })
    }
  },
  { immediate: true }
)

watch(
  () => call.value.startedAt,
  (startedAt) => {
    if (call.value.state === 'connected' && typeof startedAt === 'number' && startedAt > 0) {
      elapsedMs.value = Math.max(0, Date.now() - startedAt)
    }
  }
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
  const startedAt = call.value.startedAt
  if (typeof startedAt === 'number' && startedAt > 0) {
    elapsedMs.value = Math.max(0, Date.now() - startedAt)
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function subscribeEvents() {
  service.events.on('call', handleCallEvent)
  service.events.on('audioRoute', handleAudioRouteEvent)
}

function unsubscribeEvents() {
  service.events.off('call', handleCallEvent)
  service.events.off('audioRoute', handleAudioRouteEvent)
}

function handleCallEvent(event) {
  if (!event) return
  switch (event.state) {
    case 'incoming':
      uni.showToast({ title: 'Incoming call', icon: 'none' })
      break
    case 'outgoing':
      uni.showToast({ title: 'Dialing...', icon: 'none' })
      break
    case 'connected':
      uni.showToast({ title: 'Call connected', icon: 'none' })
      break
    case 'ended': {
      const title = event.reason ? `Call ended (${event.reason})` : 'Call ended'
      uni.showToast({ title, icon: 'none' })
      break
    }
    case 'error': {
      const message = event.error?.message || event.reason || 'Call failed'
      uni.showToast({ title: message, icon: 'none' })
      break
    }
    default:
      break
  }
}

function handleAudioRouteEvent(event) {
  if (!event?.route) return
  const label = formatAudioRouteLabel(event.route)
  uni.showToast({ title: `Audio route: ${label}`, icon: 'none' })
}

onMounted(subscribeEvents)
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
    const message = error?.message || 'Operation failed'
    uni.showToast({ title: message, icon: 'none' })
  } finally {
    loading[key] = false
  }
}

function handleAnswer() {
  if (!canAnswer.value) return
  withLoading('answer', () => service.call.answer())
}

function handleHangup() {
  if (!canHangup.value) return
  withLoading('hangup', () => service.call.hangup())
}

async function selectAudioRoute(route) {
  const value = typeof route === 'string' ? route : ''
  if (!value || audioRouteLoading.value === value) {
    return
  }
  audioRouteLoading.value = value
  try {
    await service.audio.setRoute(value)
  } catch (error) {
    const message = error?.message || 'Audio route failed'
    uni.showToast({ title: message, icon: 'none' })
  } finally {
    audioRouteLoading.value = ''
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
