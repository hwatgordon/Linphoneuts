<template>
  <view class="page">
    <scroll-view scroll-y class="page__scroll">
      <view class="section">
        <view class="section__header">
          <text class="section__title">Dialer</text>
          <text class="section__subtitle">Enter the callee number and initiate an outgoing call</text>
        </view>
        <view class="dialer-card">
          <input
            class="dialer-card__input"
            v-model="callee"
            placeholder="Enter number"
            type="text"
          />
          <view class="dialer-card__status">
            <text class="status__label">Call State:</text>
            <text class="status__value">{{ callStateLabel }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="keypad">
          <view class="keypad__row" v-for="row in keypad" :key="row.join('-')">
            <button class="keypad__button" v-for="key in row" :key="key" @click="appendDigit(key)">
              {{ key }}
            </button>
          </view>
          <view class="keypad__row">
            <button class="keypad__button keypad__button--action" @click="deleteLast">Delete</button>
            <button class="keypad__button keypad__button--action" @click="clearInput">Clear</button>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="button-row">
          <button
            class="button button--primary"
            :disabled="!canDial"
            :loading="loading.dial"
            @click="handleDial"
          >
            Dial
          </button>
          <button class="button" :disabled="!canHangup" :loading="loading.hangup" @click="handleHangup">
            Hangup
          </button>
          <button
            class="button button--secondary"
            :disabled="!canSendDtmf"
            :loading="loading.dtmf"
            @click="handleSendDtmf"
          >
            Send DTMF ({{ lastTone || '-' }})
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

const callee = ref('')
const lastTone = ref('')

const keypad = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#']
]

const loading = reactive({
  dial: false,
  hangup: false,
  dtmf: false
})

const audioRouteLabels = {
  system: 'System',
  speaker: 'Speaker',
  earpiece: 'Earpiece',
  bluetooth: 'Bluetooth',
  unknown: 'System'
}

const callStateLabel = computed(() => {
  switch (call.value.state) {
    case 'outgoing':
      return 'Dialing...'
    case 'connected':
      return `Connected (${call.value.direction || 'unknown'})`
    case 'incoming':
      return 'Incoming'
    case 'ended':
      return call.value.reason ? `Ended (${call.value.reason})` : 'Ended'
    case 'error':
      return call.value.reason ? `Error (${call.value.reason})` : 'Call error'
    default:
      return call.value.state || 'idle'
  }
})

const canDial = computed(() => {
  if (loading.dial) return false
  if (!callee.value.trim()) return false
  return !['incoming', 'outgoing', 'connected'].includes(call.value.state)
})

const canHangup = computed(() => {
  if (loading.hangup) return false
  return ['incoming', 'outgoing', 'connected'].includes(call.value.state)
})

const canSendDtmf = computed(() => {
  if (loading.dtmf) return false
  return call.value.state === 'connected' && !!lastTone.value
})

function appendDigit(digit) {
  callee.value += digit
  lastTone.value = digit
}

function deleteLast() {
  callee.value = callee.value.slice(0, -1)
}

function clearInput() {
  callee.value = ''
  lastTone.value = ''
}

function formatRouteLabel(route) {
  const key = typeof route === 'string' ? route.toLowerCase() : ''
  return audioRouteLabels[key] || (typeof route === 'string' ? route : 'System')
}

function handleCallEvent(event) {
  if (!event) return
  const { state: eventState } = event
  if (eventState === 'incoming') {
    uni.showToast({ title: 'Incoming call', icon: 'none' })
    return
  }
  if (eventState === 'connected') {
    uni.showToast({ title: 'Call connected', icon: 'none' })
    return
  }
  if (eventState === 'ended') {
    const title = event.reason ? `Call ended (${event.reason})` : 'Call ended'
    uni.showToast({ title, icon: 'none' })
    return
  }
  if (eventState === 'error') {
    const message = event.error?.message || event.reason || 'Call failed'
    uni.showToast({ title: message, icon: 'none' })
  }
}

function handleAudioRouteEvent(event) {
  if (!event?.route) return
  const label = formatRouteLabel(event.route)
  uni.showToast({ title: `Audio route: ${label}`, icon: 'none' })
}

function subscribeEvents() {
  service.events.on('call', handleCallEvent)
  service.events.on('audioRoute', handleAudioRouteEvent)
}

function unsubscribeEvents() {
  service.events.off('call', handleCallEvent)
  service.events.off('audioRoute', handleAudioRouteEvent)
}

onMounted(subscribeEvents)
onUnmounted(unsubscribeEvents)

watch(
  () => call.value.state,
  (stateValue) => {
    if (['incoming', 'outgoing', 'connected'].includes(stateValue)) {
      requestNavigation(ROUTES.call, { auto: true })
    }
    if (['ended', 'idle', 'error'].includes(stateValue)) {
      lastTone.value = ''
    }
  },
  { immediate: true }
)

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

function handleDial() {
  if (!canDial.value) {
    if (!callee.value.trim()) {
      uni.showToast({ title: 'Enter a number first', icon: 'none' })
    }
    return
  }
  const number = callee.value.trim()
  withLoading('dial', () => service.call.dial(number))
}

function handleHangup() {
  if (!canHangup.value) return
  withLoading('hangup', () => service.call.hangup())
}

function handleSendDtmf() {
  const tone = lastTone.value
  if (!tone || !canSendDtmf.value) return
  withLoading('dtmf', async () => {
    await service.call.sendDtmf(tone)
    uni.showToast({ title: `DTMF ${tone} sent`, icon: 'none' })
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

.dialer-card {
  background-color: #ffffff;
  padding: 24rpx;
  border-radius: 16rpx;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.08);
}

.dialer-card__input {
  font-size: 36rpx;
  padding: 20rpx 16rpx;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 16rpx;
}

.dialer-card__status {
  display: flex;
  gap: 8rpx;
  align-items: center;
}

.status__label {
  font-size: 24rpx;
  color: #475569;
}

.status__value {
  font-size: 26rpx;
  color: #0f172a;
  font-weight: 600;
}

.keypad {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.08);
}

.keypad__row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.keypad__button {
  flex: 1;
  height: 100rpx;
  border-radius: 12rpx;
  background-color: #e2e8f0;
  color: #0f172a;
  font-size: 32rpx;
}

.keypad__button--action {
  background-color: #f1f5f9;
  color: #475569;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.button {
  flex: 1;
  min-width: 200rpx;
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

.button--secondary {
  background-color: #6366f1;
  color: #ffffff;
}
</style>
