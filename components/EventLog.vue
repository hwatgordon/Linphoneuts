<template>
  <view class="event-log">
    <view class="event-log__header">
      <text class="event-log__title">Event Log</text>
      <text class="event-log__count">{{ visibleEvents.length }}</text>
    </view>
    <scroll-view scroll-y class="event-log__list">
      <view
        v-for="event in visibleEvents"
        :key="event.id"
        class="event-log__item"
      >
        <view class="event-log__meta">
          <text class="event-log__time">{{ formatTime(event.timestamp) }}</text>
          <text class="event-log__level" :class="`event-log__level--${event.level}`">
            {{ event.level?.toUpperCase() || 'INFO' }}
          </text>
          <text class="event-log__context" v-if="event.context">{{ event.context }}</text>
        </view>
        <text class="event-log__message">{{ event.message }}</text>
        <text v-if="event.data" class="event-log__data">{{ stringify(event.data) }}</text>
      </view>
      <view v-if="!visibleEvents.length" class="event-log__empty">
        No events yet.
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  events: {
    type: Array,
    default: () => []
  },
  limit: {
    type: Number,
    default: 50
  }
})

const visibleEvents = computed(() => props.events.slice(0, props.limit))

function pad(value) {
  return value.toString().padStart(2, '0')
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--:--'
  const date = new Date(timestamp)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function stringify(data) {
  if (data == null) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch (error) {
    return String(data)
  }
}
</script>

<style scoped>
.event-log {
  border: 1px solid #e2e8f0;
  border-radius: 12rpx;
  overflow: hidden;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.event-log__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 28rpx;
  border-bottom: 1px solid #e2e8f0;
  background-color: #f8fafc;
}

.event-log__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e293b;
}

.event-log__count {
  font-size: 24rpx;
  color: #475569;
}

.event-log__list {
  flex: 1;
}

.event-log__item {
  padding: 24rpx 28rpx;
  border-bottom: 1px solid #f1f5f9;
}

.event-log__meta {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  flex-wrap: wrap;
}

.event-log__time {
  font-size: 24rpx;
  color: #64748b;
}

.event-log__level {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  text-transform: uppercase;
}

.event-log__level--info {
  background-color: #e0f2fe;
  color: #0369a1;
}

.event-log__level--warn {
  background-color: #fef3c7;
  color: #92400e;
}

.event-log__level--error {
  background-color: #fee2e2;
  color: #b91c1c;
}

.event-log__context {
  font-size: 22rpx;
  color: #0f172a;
  background-color: #e2e8f0;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.event-log__message {
  display: block;
  font-size: 26rpx;
  color: #0f172a;
  margin-bottom: 8rpx;
}

.event-log__data {
  display: block;
  font-size: 24rpx;
  color: #475569;
  background-color: #f8fafc;
  padding: 12rpx;
  border-radius: 8rpx;
  white-space: pre-wrap;
  word-break: break-all;
}

.event-log__empty {
  padding: 32rpx;
  text-align: center;
  color: #94a3b8;
  font-size: 26rpx;
}
</style>
