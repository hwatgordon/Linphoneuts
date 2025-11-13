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
            :disabled="!callee"
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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useAppState } from '@/store/appState'
import {
  dialNumber,
  hangupCall,
  sendDtmf,
  on as onEvent,
  off as offEvent
} from '@/services/utssdk'

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

const callStateLabel = computed(() => {
  if (call.value.state === 'connected') {
    return `Connected (${call.value.direction || 'unknown'})`
  }
  if (call.value.state === 'dialing') return 'Dialing'
  if (call.value.state === 'incoming') return 'Incoming'
  if (call.value.state === 'ended') return call.value.reason ? `Ended (${call.value.reason})` : 'Ended'
  return call.value.state || 'idle'
})

const canHangup = computed(() => ['dialing', 'connected', 'incoming'].includes(call.value.state))
const canSendDtmf = computed(() => call.value.state === 'connected' && !!lastTone.value)

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

function subscribeEvents() {
  onEvent('call:state', handleCallEvent)
}

function unsubscribeEvents() {
  offEvent('call:state', handleCallEvent)
}

function handleCallEvent(payload) {
  if (payload?.state === 'connected') {
    uni.showToast({ title: 'Call connected', icon: 'none' })
  }
  if (payload?.state === 'ended') {
    uni.showToast({ title: 'Call ended', icon: 'none' })
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

function handleDial() {
  const payload = { number: callee.value }
  withLoading('dial', () => dialNumber(payload))
}

function handleHangup() {
  withLoading('hangup', () => hangupCall())
}

function handleSendDtmf() {
  const tone = lastTone.value
  if (!tone) return
  withLoading('dtmf', async () => {
    await sendDtmf({ tone })
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
