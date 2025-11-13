import {
  logEvent,
  updateServiceState,
  updateRegistrationState,
  updateCallState,
  setAudioRoute,
  recordMessageReceived,
  markMessageSent,
  markMessageError,
  requestNavigation
} from '@/store/appState'

const listeners = new Map()
let nativeClient = null
let nativeEventsBound = false
let mockClient = null
let attemptedNativeLookup = false

const PLUGIN_ALIASES = [
  'CrossPlatformPlugin',
  'crossPlatformPlugin',
  'utssdk',
  'UTSSDK',
  'telecomUTS',
  'TelecomUTS',
  'UniTelecomService'
]

function ensureNativeClient() {
  if (nativeClient || attemptedNativeLookup) {
    return nativeClient
  }

  attemptedNativeLookup = true

  for (const name of PLUGIN_ALIASES) {
    try {
      const candidate = uni.requireNativePlugin(name)
      if (candidate) {
        nativeClient = candidate
        nativeClientName = name
        logEvent({
          level: 'info',
          message: `Loaded native UTS SDK plugin: ${name}`,
          context: 'utssdk'
        })
        bindNativeEvents(candidate)
        return nativeClient
      }
    } catch (error) {
      // Try next alias
    }
  }

  logEvent({
    level: 'warn',
    message: 'Unable to load native UTS SDK plugin. Falling back to mock implementation.',
    context: 'utssdk'
  })

  return null
}

function ensureMockClient() {
  if (!mockClient) {
    mockClient = createMockClient()
  }
  return mockClient
}

function getClient() {
  return ensureNativeClient() || ensureMockClient()
}

function bindNativeEvents(client) {
  if (!client || nativeEventsBound) {
    return
  }

  const handler = (event, payload) => {
    if (typeof event === 'string') {
      handleNativeEvent(event, payload)
      return
    }

    if (event && typeof event.type === 'string') {
      handleNativeEvent(event.type, event.data ?? event.payload ?? payload ?? {})
      return
    }

    if (event && event.event) {
      handleNativeEvent(event.event, event.payload ?? payload ?? {})
      return
    }
  }

  const subscriptions = [
    ['on', ['event', 'message', 'state', 'update']],
    ['addEventListener', ['event', 'message', 'state', 'update']],
    ['subscribe', ['event', 'message', 'state', 'update']],
    ['setEventHandler', [null]],
    ['setListener', [null]],
    ['registerListener', [null]]
  ]

  for (const [method, events] of subscriptions) {
    if (typeof client[method] !== 'function') {
      continue
    }

    try {
      if (events[0] === null) {
        client[method](handler)
        nativeEventsBound = true
        logEvent({
          level: 'info',
          message: `Bound native UTS SDK events via ${method}`,
          context: 'utssdk'
        })
        return
      }

      for (const eventName of events) {
        client[method](eventName, handler)
      }

      nativeEventsBound = true
      logEvent({
        level: 'info',
        message: `Bound native UTS SDK events via ${method}`,
        context: 'utssdk'
      })
      return
    } catch (error) {
      // Try next option
    }
  }

  logEvent({
    level: 'warn',
    message: 'Failed to bind native UTS SDK events. Relying on manual state updates.',
    context: 'utssdk'
  })
}

function emitLocal(event, payload) {
  const handlers = listeners.get(event)
  if (handlers) {
    handlers.forEach((callback) => {
      try {
        callback(payload)
      } catch (error) {
        logEvent({
          level: 'error',
          message: `Listener for ${event} threw an error`,
          data: { error: error.message },
          context: 'utssdk'
        })
      }
    })
  }

  const anyHandlers = listeners.get('*')
  if (anyHandlers) {
    anyHandlers.forEach((callback) => {
      try {
        callback({ event, payload })
      } catch (error) {
        logEvent({
          level: 'error',
          message: 'Wildcard listener threw an error',
          data: { error: error.message },
          context: 'utssdk'
        })
      }
    })
  }
}

function handleNativeEvent(event, payload = {}) {
  if (!event) {
    return
  }

  switch (event) {
    case 'service:state':
    case 'service-state':
      updateServiceState(payload)
      break
    case 'registration:state':
    case 'registration-state':
      updateRegistrationState(payload)
      break
    case 'call:state':
    case 'call-state':
      updateCallState(payload)
      break
    case 'call:audio-route':
      if (payload.route) {
        setAudioRoute(payload.route)
      }
      break
    case 'message:received':
      recordMessageReceived(payload)
      break
    case 'message:sent':
      markMessageSent(payload)
      break
    case 'message:error':
      markMessageError(payload?.error || 'Unknown messaging error')
      break
    case 'navigation:suggested':
      if (payload?.route) {
        requestNavigation(payload.route, { auto: true })
      }
      break
    default:
      break
  }

  if (payload?.suggestedRoute) {
    requestNavigation(payload.suggestedRoute, { auto: true })
  }

  logEvent({
    level: 'info',
    message: `Event ${event}`,
    data: payload,
    context: 'utssdk'
  })

  emitLocal(event, payload)
}

async function callClientMethod(method, payload) {
  const client = getClient()
  if (!client || typeof client[method] !== 'function') {
    logEvent({
      level: 'warn',
      message: `UTS SDK client does not implement method ${method}`,
      context: 'utssdk'
    })
    return false
  }

  try {
    const result = client[method](payload)
    if (result && typeof result.then === 'function') {
      return await result
    }
    return result
  } catch (error) {
    logEvent({
      level: 'error',
      message: `UTS SDK method ${method} failed`,
      data: { error: error?.message || error },
      context: 'utssdk'
    })
    throw error
  }
}

function logAction(message, data) {
  logEvent({
    level: 'info',
    message,
    data,
    context: 'action'
  })
}

export async function initService(config = {}) {
  logAction('Initialize service', config)
  const result = await callClientMethod('init', config)
  if (result !== false) {
    handleNativeEvent('service:state', { initialized: true })
  }
  return result
}

export async function startService(config) {
  logAction('Start service', config)
  const result = await callClientMethod('startService', config)
  if (result !== false) {
    handleNativeEvent('service:state', { running: true, initialized: true })
  }
  return result
}

export async function stopService() {
  logAction('Stop service')
  const result = await callClientMethod('stopService')
  if (result !== false) {
    handleNativeEvent('service:state', { running: false })
    handleNativeEvent('call:state', { state: 'idle', suggestedRoute: '/pages/test/index' })
  }
  return result
}

export async function registerAccount(payload) {
  logAction('Register account', payload)
  const result = await callClientMethod('register', payload)
  if (result !== false) {
    handleNativeEvent('registration:state', { status: 'registered', detail: payload })
  }
  return result
}

export async function unregisterAccount(options) {
  logAction('Unregister account')
  const result = await callClientMethod('unregister', options)
  if (result !== false) {
    handleNativeEvent('registration:state', { status: 'unregistered', suggestedRoute: '/pages/test/index' })
  }
  return result
}

export async function dialNumber(payload) {
  const data = typeof payload === 'string' ? { number: payload } : payload
  logAction('Dial number', data)
  const result = await callClientMethod('dial', data)
  if (result !== false) {
    handleNativeEvent('call:state', {
      state: 'dialing',
      direction: 'outgoing',
      number: data.number,
      suggestedRoute: '/pages/call/index'
    })
  }
  return result
}

export async function hangupCall(data) {
  logAction('Hang up call', data)
  const result = await callClientMethod('hangup', data)
  if (result !== false) {
    handleNativeEvent('call:state', {
      state: 'ended',
      reason: 'hangup',
      suggestedRoute: '/pages/dialer/index'
    })
  }
  return result
}

export async function answerCall(data) {
  logAction('Answer call', data)
  const result = await callClientMethod('answer', data)
  if (result !== false) {
    handleNativeEvent('call:state', {
      state: 'connected',
      direction: 'incoming'
    })
  }
  return result
}

export async function declineCall(data) {
  logAction('Decline call', data)
  const result = await callClientMethod('decline', data)
  if (result !== false) {
    handleNativeEvent('call:state', {
      state: 'ended',
      reason: 'declined',
      suggestedRoute: '/pages/dialer/index'
    })
  }
  return result
}

export async function sendDtmf(payload) {
  const data = typeof payload === 'string' ? { tone: payload } : payload
  logAction('Send DTMF', data)
  return callClientMethod('sendDtmf', data)
}

export async function setAudioOutput(route) {
  const data = typeof route === 'string' ? { route } : route
  logAction('Set audio route', data)
  const result = await callClientMethod('setAudioRoute', data)
  if (result !== false && data.route) {
    handleNativeEvent('call:audio-route', { route: data.route })
  }
  return result
}

export async function sendMessage(payload) {
  logAction('Send message', payload)
  const result = await callClientMethod('sendMessage', payload)
  if (result !== false) {
    handleNativeEvent('message:sent', payload)
  }
  return result
}

export function on(event, handler) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event).add(handler)
}

export function off(event, handler) {
  const handlers = listeners.get(event)
  if (handlers) {
    handlers.delete(handler)
  }
}

export function once(event, handler) {
  const wrapped = (payload) => {
    off(event, wrapped)
    handler(payload)
  }
  on(event, wrapped)
}

export function isUsingMock() {
  ensureNativeClient()
  return !nativeClient
}

export async function simulateIncomingCall(number) {
  const client = ensureMockClient()
  if (typeof client.simulateIncoming === 'function') {
    await client.simulateIncoming(number)
    return true
  }
  logEvent({
    level: 'warn',
    message: 'simulateIncomingCall is only available for mock client',
    context: 'utssdk'
  })
  return false
}

function createMockClient() {
  let serviceRunning = false
  let registered = false
  let currentCall = null

  const emit = (event, data) => {
    handleNativeEvent(event, data)
  }

  return {
    init: async (config) => {
      emit('service:state', { initialized: true, config })
      return true
    },
    startService: async () => {
      serviceRunning = true
      emit('service:state', { running: true, initialized: true })
      return true
    },
    stopService: async () => {
      serviceRunning = false
      registered = false
      currentCall = null
      emit('service:state', { running: false })
      emit('registration:state', { status: 'idle' })
      emit('call:state', { state: 'idle', suggestedRoute: '/pages/test/index' })
      return true
    },
    register: async (options) => {
      if (!serviceRunning) {
        emit('registration:state', { status: 'error', error: 'Service not running' })
        return false
      }
      registered = true
      emit('registration:state', {
        status: 'registered',
        detail: options,
        suggestedRoute: '/pages/dialer/index'
      })
      return true
    },
    unregister: async () => {
      registered = false
      emit('registration:state', { status: 'unregistered', suggestedRoute: '/pages/test/index' })
      return true
    },
    dial: async ({ number }) => {
      if (!registered) {
        emit('call:state', { state: 'error', reason: 'not-registered', number })
        return false
      }
      currentCall = {
        number,
        direction: 'outgoing',
        state: 'dialing'
      }
      emit('call:state', {
        state: 'dialing',
        direction: 'outgoing',
        number,
        suggestedRoute: '/pages/call/index'
      })

      setTimeout(() => {
        if (!currentCall) return
        currentCall.state = 'connected'
        emit('call:state', {
          state: 'connected',
          direction: 'outgoing',
          number
        })
      }, 900)
      return true
    },
    hangup: async () => {
      if (!currentCall) {
        return true
      }
      const number = currentCall.number
      currentCall = null
      emit('call:state', {
        state: 'ended',
        reason: 'hangup',
        number,
        suggestedRoute: '/pages/dialer/index'
      })
      return true
    },
    answer: async () => {
      if (!currentCall || currentCall.direction !== 'incoming') {
        return false
      }
      currentCall.state = 'connected'
      emit('call:state', {
        state: 'connected',
        direction: 'incoming',
        number: currentCall.number
      })
      return true
    },
    decline: async () => {
      if (!currentCall || currentCall.direction !== 'incoming') {
        return false
      }
      const number = currentCall.number
      currentCall = null
      emit('call:state', {
        state: 'ended',
        direction: 'incoming',
        number,
        reason: 'declined',
        suggestedRoute: '/pages/dialer/index'
      })
      return true
    },
    sendDtmf: async ({ tone }) => {
      emit('call:dtmf', { tone })
      return true
    },
    setAudioRoute: async ({ route }) => {
      emit('call:audio-route', { route })
      return true
    },
    sendMessage: async ({ to, text }) => {
      emit('message:sent', { to, text })
      setTimeout(() => {
        emit('message:received', {
          from: to,
          text: `Echo: ${text}`
        })
      }, 600)
      return true
    },
    simulateIncoming: async (number = '1001') => {
      if (!serviceRunning) {
        return false
      }
      currentCall = {
        number,
        direction: 'incoming',
        state: 'incoming'
      }
      emit('call:state', {
        state: 'incoming',
        direction: 'incoming',
        number,
        suggestedRoute: '/pages/call/index'
      })
      return true
    }
  }
}
