<template>
  <view class="page">
    <scroll-view scroll-y class="page__scroll">
      <view class="section">
        <view class="section__header">
          <text class="section__title">Send Message</text>
          <text class="section__subtitle">Send a text message through the UTS SDK</text>
        </view>
        <view class="form">
          <view class="form__field">
            <text class="form__label">Recipient</text>
            <input class="form__input" v-model="form.to" placeholder="Number or address" />
          </view>
          <view class="form__field">
            <text class="form__label">Message</text>
            <textarea
              class="form__textarea"
              v-model="form.text"
              placeholder="Enter message text"
              maxlength="200"
            ></textarea>
          </view>
          <button class="button button--primary" :loading="loading.send" @click="handleSend">
            Send
          </button>
        </view>
      </view>

      <view class="section">
        <view class="section__header">
          <text class="section__title">Received Messages</text>
          <text class="section__subtitle">Latest messages from the session</text>
        </view>
        <view class="messages-list" v-if="messages.length">
          <view class="message" v-for="message in messages" :key="message.id">
            <view class="message__header">
              <text class="message__from">From: {{ message.from }}</text>
              <text class="message__time">{{ formatTime(message.timestamp) }}</text>
            </view>
            <text class="message__body">{{ message.text }}</text>
          </view>
        </view>
        <view v-else class="empty">No messages received yet.</view>
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
import { sendMessage, on as onEvent, off as offEvent } from '@/services/utssdk'

const state = useAppState()
const events = computed(() => state.events)
const messages = computed(() => state.messaging.received || [])

const form = reactive({
  to: '',
  text: ''
})

const loading = reactive({
  send: false
})

function subscribeEvents() {
  onEvent('message', handleMessageEvent)
}

function unsubscribeEvents() {
  offEvent('message', handleMessageEvent)
}

function handleMessageEvent(payload) {
  if (payload?.event === 'received') {
    const from = payload.payload?.from || 'unknown'
    uni.showToast({ title: `Message from ${from}`, icon: 'none' })
  }
  if (payload?.event === 'failed') {
    const message = payload?.error?.message || payload?.error?.code || 'Message failed'
    uni.showToast({ title: message, icon: 'none' })
  }
}

onMounted(() => {
  subscribeEvents()
})

onUnmounted(() => {
  unsubscribeEvents()
})

async function handleSend() {
  if (!form.to || !form.text) {
    uni.showToast({ title: 'Recipient and message required', icon: 'none' })
    return
  }
  if (loading.send) return
  loading.send = true
  try {
    await sendMessage({ to: form.to, text: form.text })
    uni.showToast({ title: 'Message sent', icon: 'none' })
    form.text = ''
  } catch (error) {
    uni.showToast({ title: error?.message || 'Failed to send', icon: 'none' })
  } finally {
    loading.send = false
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--'
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
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
  padding: 24rpx;
  border-radius: 16rpx;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.form__label {
  font-size: 24rpx;
  color: #475569;
}

.form__input {
  background-color: #f8fafc;
  border-radius: 12rpx;
  padding: 20rpx;
  border: 1px solid #e2e8f0;
  font-size: 26rpx;
}

.form__textarea {
  background-color: #f8fafc;
  border-radius: 12rpx;
  padding: 20rpx;
  border: 1px solid #e2e8f0;
  min-height: 160rpx;
  font-size: 26rpx;
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
  background-color: #6366f1;
  color: #ffffff;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.message {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.06);
}

.message__header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.message__from {
  font-size: 26rpx;
  color: #0f172a;
  font-weight: 600;
}

.message__time {
  font-size: 24rpx;
  color: #475569;
}

.message__body {
  font-size: 26rpx;
  color: #1e293b;
  line-height: 1.4;
}

.empty {
  padding: 40rpx;
  text-align: center;
  color: #94a3b8;
  font-size: 26rpx;
}
</style>
