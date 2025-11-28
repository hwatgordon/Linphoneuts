import {
  logEvent,
  updateServiceState,
  updateRegistrationState,
  updateCallState,
  setAudioRoute,
  updateAudioDevices,
  recordMessageReceived,
  markMessageSent,
  markMessageError
} from '@/store/appState'

const PLUGIN_ALIASES = [
  'CrossPlatformPlugin',
  'crossPlatformPlugin',
  'utssdk',
  'UTSSDK',
  'telecomUTS',
  'TelecomUTS',
  'UniTelecomService'
]

const METHOD_ALIASES = {
  bootstrap: ['bootstrap', 'initPlugin'],
  shutdown: ['shutdown', 'disposePlugin'],
  init: ['init'],
  dispose: ['dispose'],
  register: ['register'],
  unregister: ['unregister'],
  dial: ['call.dial', 'callDial', 'dial'],
  hangup: ['call.hangup', 'callHangup', 'hangup'],
  answer: ['call.answer', 'callAnswer', 'answer'],
  sendDtmf: ['call.sendDtmf', 'callSendDtmf', 'sendDtmf'],
  messageSend: ['message.send', 'messageSend', 'sendMessage'],
  audioSetRoute: ['audio.setRoute', 'audioSetRoute', 'setAudioRoute'],
  getState: ['getState'],
  setLogLevel: ['setLogLevel', 'setLoglevel']
}

const DEFAULT_TOAST_DURATION = 2500
const BOOTSTRAP_THROTTLE_MS = 1200

const listeners = new Map()

let nativeClient = null
let nativeClientName = ''
let attemptedNativeLookup = false
let nativeEventsBound = false
let nativeUnsubscribeAll = null
let mockClient = null
let lastBootstrapAt = 0

function now() {
  return Date.now()
}

function showToast(title, icon = 'none') {
  if (!title) return
  if (typeof uni === 'undefined' || typeof uni.showToast !== 'function') {
    return
  }
  uni.showToast({
    title: String(title),
    icon,
    duration: DEFAULT_TOAST_DURATION
  })
}

function normalizeError(error) {
  if (!error) {
    return { code: 'unknown', message: 'Unknown error' }
  }
  if (error instanceof Error) {
    return {
      code: error.code || 'error',
      message: error.message || 'Unexpected error',
      detail: error
    }
  }
  if (typeof error === 'object') {
    const code = String(error.code ?? error.errCode ?? error.errorCode ?? 'unknown')
    const message = String(
      error.message ?? error.errMsg ?? error.errorMessage ?? error.description ?? 'Unexpected platform error'
    )
    return {
      code,
      message,
      detail: error
    }
  }
  return {
    code: 'unknown',
    message: String(error)
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

function emitLocal(event, payload) {
  if (!event) return
  const handlers = listeners.get(event)
  if (handlers) {
    handlers.forEach((callback) => {
      try {
        callback(payload)
      } catch (error) {
        logEvent({
          level: 'error',
          message: `Listener for ${event} threw an error`,
          data: { error: normalizeError(error) },
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
          data: { error: normalizeError(error) },
          context: 'utssdk'
        })
      }
    })
  }
}

export function on(event, handler) {
  if (!event || typeof handler !== 'function') return
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event).add(handler)
}

export function off(event, handler) {
  const handlers = listeners.get(event)
  if (handlers) {
    handlers.delete(handler)
    if (handlers.size === 0) {
      listeners.delete(event)
    }
  }
}

export function once(event, handler) {
  if (!event || typeof handler !== 'function') return
  const wrapped = (payload) => {
    off(event, wrapped)
    handler(payload)
  }
  on(event, wrapped)
}

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
        updateServiceState({ provider: 'native', plugin: name })
        return nativeClient
      }
    } catch (error) {
      // continue searching
    }
  }

  logEvent({
    level: 'warn',
    message: 'Unable to load native UTS SDK plugin. Falling back to mock implementation.',
    context: 'utssdk'
  })

  return null
}

function createMockClient() {
  const subscriptions = {
    registration: new Set(),
    call: new Set(),
    message: new Set(),
    audioRoute: new Set(),
    deviceChange: new Set(),
    connectivity: new Set()
  }

  let initialized = false
  let registrationState = {
    state: 'none',
    reason: '',
    detail: null,
    error: null
  }
  let callState = {
    state: 'idle',
    direction: '',
    number: '',
    reason: '',
    error: null
  }
  let audioRouteState = {
    route: 'system',
    reason: ''
  }
  let devices = []
  let logLevel = 'info'

  function emit(event, payload) {
    const handlers = subscriptions[event]
    if (!handlers) return
    handlers.forEach((handler) => {
      try {
        handler(payload)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[MockUTS] listener error', error)
      }
    })
  }

  function nextRegistration(state, extra = {}) {
    registrationState = {
      state,
      reason: extra.reason || '',
      detail: extra.detail ?? null,
      error: extra.error ?? null,
      timestamp: now(),
      raw: extra.raw ?? { state }
    }
    emit('registration', registrationState)
  }

  function nextCall(state, extra = {}) {
    callState = {
      state,
      direction: extra.direction || (state === 'incoming' ? 'incoming' : state === 'outgoing' ? 'outgoing' : ''),
      number: extra.number || callState.number,
      reason: extra.reason || '',
      error: extra.error ?? null,
      detail: extra.detail ?? null,
      timestamp: now(),
      raw: extra.raw ?? { state }
    }
    emit('call', callState)
  }

  function nextAudioRoute(route, reason = '') {
    audioRouteState = { route, reason, timestamp: now(), raw: { route, reason } }
    emit('audioRoute', audioRouteState)
  }

  function publishDeviceChange() {
    emit('deviceChange', {
      devices,
      active: devices.find((device) => device.selected) ?? null,
      timestamp: now(),
      raw: { devices }
    })
  }

  return {
    async init(config) {
      if (!config || !config.sipServer || !config.username || !config.password) {
        throw new Error('sipServer, username and password are required for init')
      }
      initialized = true
      nextRegistration('none', { detail: config })
      return true
    },
    async dispose() {
      initialized = false
      nextRegistration('none')
      nextCall('idle', { number: '' })
      nextAudioRoute('system')
      devices = []
      publishDeviceChange()
      return true
    },
    async register() {
      if (!initialized) {
        const error = new Error('Service not initialized')
        nextRegistration('failed', { error: normalizeError(error) })
        throw error
      }
      nextRegistration('progress')
      setTimeout(() => {
        nextRegistration('ok', { detail: { registeredAt: now() } })
      }, 250)
      return true
    },
    async unregister() {
      nextRegistration('none')
      return true
    },
    call: {
      async dial(number) {
        if (!number) {
          throw new Error('Number required')
        }
        nextCall('outgoing', { number, direction: 'outgoing' })
        setTimeout(() => {
          nextCall('connected', { number, direction: 'outgoing' })
        }, 600)
        return true
      },
      async hangup() {
        const number = callState.number
        nextCall('ended', { number, reason: 'hangup' })
        setTimeout(() => {
          nextCall('idle', { number: '' })
        }, 300)
        return true
      },
      async answer() {
        if (callState.state === 'incoming') {
          nextCall('connected', { direction: 'incoming' })
        }
        return true
      },
      async sendDtmf(tone) {
        if (!tone) {
          throw new Error('Tone required')
        }
        return true
      }
    },
    message: {
      async send(to, text) {
        emit('message', {
          event: 'sent',
          payload: { to, text, from: 'mock' },
          timestamp: now(),
          raw: { to, text }
        })
        setTimeout(() => {
          emit('message', {
            event: 'received',
            payload: { from: to, to: 'mock', text: `Echo: ${text}` },
            timestamp: now(),
            raw: { from: to, text }
          })
        }, 400)
        return true
      }
    },
    audio: {
      async setRoute(route) {
        nextAudioRoute(route, 'manual')
        return true
      }
    },
    async getState() {
      return {
        initialized,
        registration: registrationState,
        call: callState,
        audioRoute: audioRouteState,
        devices,
        logLevel
      }
    },
    setLogLevel(level) {
      logLevel = level
      return true
    },
    onRegistration(handler) {
      subscriptions.registration.add(handler)
    },
    offRegistration(handler) {
      subscriptions.registration.delete(handler)
    },
    onCall(handler) {
      subscriptions.call.add(handler)
    },
    offCall(handler) {
      subscriptions.call.delete(handler)
    },
    onMessage(handler) {
      subscriptions.message.add(handler)
    },
    offMessage(handler) {
      subscriptions.message.delete(handler)
    },
    onAudioRouteChanged(handler) {
      subscriptions.audioRoute.add(handler)
    },
    offAudioRouteChanged(handler) {
      subscriptions.audioRoute.delete(handler)
    },
    onDeviceChange(handler) {
      subscriptions.deviceChange.add(handler)
    },
    offDeviceChange(handler) {
      subscriptions.deviceChange.delete(handler)
    },
    onConnectivity(handler) {
      subscriptions.connectivity.add(handler)
    },
    offConnectivity(handler) {
      subscriptions.connectivity.delete(handler)
    },
    async simulateIncoming(number) {
      nextCall('incoming', { number, direction: 'incoming' })
      return true
    }
  }
}

function ensureMockClient() {
  if (!mockClient) {
    mockClient = createMockClient()
    bindNativeEvents(mockClient)
    updateServiceState({ provider: 'mock', plugin: 'mock-utssdk' })
  }
  return mockClient
}

function getClient() {
  return ensureNativeClient() || ensureMockClient()
}

export function isUsingMock() {
  ensureNativeClient()
  return !nativeClient
}

function resolveMethod(client, descriptor) {
  if (!client || !descriptor) {
    return null
  }
  if (descriptor.includes('.')) {
    const parts = descriptor.split('.')
    let context = client
    for (let index = 0; index < parts.length; index += 1) {
      const key = parts[index]
      if (!context) return null
      if (index === parts.length - 1) {
        const fn = context[key]
        if (typeof fn === 'function') {
          return { fn, context }
        }
        return null
      }
      context = context[key]
    }
  }
  const direct = client[descriptor]
  if (typeof direct === 'function') {
    return { fn: direct, context: client }
  }
  const lower = descriptor.charAt(0).toLowerCase() + descriptor.slice(1)
  if (lower !== descriptor && typeof client[lower] === 'function') {
    return { fn: client[lower], context: client }
  }
  return null
}

function findMethod(client, aliases) {
  if (!client) return null
  for (const alias of aliases) {
    const resolved = resolveMethod(client, alias)
    if (resolved) {
      return resolved
    }
  }
  return null
}

async function callNative(operation, args = [], options = {}) {
  const {
    label = operation,
    toastOnError = true,
    toastOnSuccess = false,
    successMessage = '',
    errorMessage = '',
    logSuccess = true
  } = options

  const client = getClient()
  const aliases = METHOD_ALIASES[operation] || [operation]
  const descriptor = findMethod(client, aliases)

  if (!descriptor) {
    const message = errorMessage || `UTS SDK method ${operation} is not available${nativeClientName ? ` on ${nativeClientName}` : ''}`
    logEvent({
      level: 'warn',
      message,
      data: { operation, aliases },
      context: 'utssdk'
    })
    if (toastOnError) {
      showToast(message)
    }
    throw new Error(message)
  }

  try {
    const result = descriptor.fn.apply(descriptor.context, args)
    const value = result && typeof result.then === 'function' ? await result : result
    if (logSuccess) {
      logEvent({
        level: 'info',
        message: `${label || operation} succeeded`,
        data: { operation, args },
        context: 'utssdk'
      })
    }
    if (toastOnSuccess && successMessage) {
      showToast(successMessage, 'success')
    }
    return value
  } catch (error) {
    const normalized = normalizeError(error)
    const message = errorMessage || normalized.message || `${label || operation} failed`
    logEvent({
      level: 'error',
      message: `${label || operation} failed`,
      data: { operation, args, error: normalized },
      context: 'utssdk'
    })
    if (toastOnError) {
      showToast(message)
    }
    throw normalized
  }
}

function normalizeRegistrationArgs(args) {
  if (!args || args.length === 0) {
    return {}
  }
  if (args.length === 1 && typeof args[0] === 'object') {
    return args[0]
  }
  const [state, detail, error] = args
  const payload = { state }
  if (detail !== undefined) {
    payload.detail = detail
  }
  if (error) {
    payload.error = error
  }
  return payload
}

function normalizeCallArgs(args) {
  if (!args || args.length === 0) {
    return {}
  }
  if (args.length === 1 && typeof args[0] === 'object') {
    return args[0]
  }
  const [state, detail, error] = args
  const payload = { state }
  if (detail && typeof detail === 'object') {
    return { state, ...detail, error }
  }
  if (detail !== undefined) {
    payload.detail = detail
  }
  if (error) {
    payload.error = error
  }
  return payload
}

function normalizeMessageArgs(args) {
  if (!args || args.length === 0) {
    return {}
  }
  if (args.length === 1 && typeof args[0] === 'object') {
    return args[0]
  }
  const [event, payload, error] = args
  return {
    event,
    payload,
    error
  }
}

function normalizeAudioRouteArgs(args) {
  if (!args || args.length === 0) {
    return {}
  }
  if (args.length === 1 && typeof args[0] === 'object') {
    return args[0]
  }
  const [route, reason] = args
  return { route, reason }
}

function bindNativeEvents(client) {
  if (!client || nativeEventsBound) {
    return
  }

  const subscriptionFinalizers = []

  const safeBind = (methodNames, handler, teardownNames, eventName) => {
    for (const methodName of methodNames) {
      const subscribe = client[methodName]
      if (typeof subscribe !== 'function') {
        continue
      }
      try {
        if (eventName) {
          subscribe.call(client, eventName, handler)
        } else {
          subscribe.call(client, handler)
        }
        subscriptionFinalizers.push(() => {
          teardownNames.forEach((name) => {
            const unsubscribe = client[name]
            if (typeof unsubscribe === 'function') {
              try {
                if (eventName) {
                  unsubscribe.call(client, eventName, handler)
                } else {
                  unsubscribe.call(client, handler)
                }
              } catch (error) {
                // ignore unbind errors
              }
            }
          })
        })
        return true
      } catch (error) {
        logEvent({
          level: 'warn',
          message: `Failed to bind native event via ${methodName}`,
          data: { error: normalizeError(error) },
          context: 'utssdk'
        })
      }
    }
    return false
  }

  const registrationHandler = (...args) => handleRegistration(normalizeRegistrationArgs(args))
  const callHandler = (...args) => handleCall(normalizeCallArgs(args))
  const messageHandler = (...args) => handleMessage(normalizeMessageArgs(args))
  const audioRouteHandler = (...args) => handleAudioRoute(normalizeAudioRouteArgs(args))
  const deviceHandler = (payload) => handleDeviceChange(payload ?? {})
  const connectivityHandler = (payload) => handleConnectivity(payload ?? {})

  const boundRegistration =
    safeBind(['onRegistration'], registrationHandler, ['offRegistration']) ||
    safeBind(['on'], registrationHandler, ['off'], 'registration')

  const boundCall =
    safeBind(['onCall'], callHandler, ['offCall']) ||
    safeBind(['on'], callHandler, ['off'], 'call')

  const boundMessage =
    safeBind(['onMessage'], messageHandler, ['offMessage']) ||
    safeBind(['on'], messageHandler, ['off'], 'message')

  const boundAudioRoute =
    safeBind(['onAudioRouteChanged'], audioRouteHandler, ['offAudioRouteChanged']) ||
    safeBind(['on'], audioRouteHandler, ['off'], 'audioRoute')

  const boundDevice =
    safeBind(['onDeviceChange', 'onDevicesChanged'], deviceHandler, ['offDeviceChange', 'offDevicesChanged']) ||
    safeBind(['on'], deviceHandler, ['off'], 'deviceChange')

  const boundConnectivity =
    safeBind(['onConnectivity'], connectivityHandler, ['offConnectivity']) ||
    safeBind(['on'], connectivityHandler, ['off'], 'connectivity')

  if (boundRegistration || boundCall || boundMessage || boundAudioRoute || boundDevice || boundConnectivity) {
    nativeEventsBound = true
    nativeUnsubscribeAll = () => {
      subscriptionFinalizers.forEach((fn) => fn())
      nativeEventsBound = false
      nativeUnsubscribeAll = null
    }
    logEvent({
      level: 'info',
      message: 'Bound native UTS SDK events.',
      context: 'utssdk'
    })
  } else {
    logEvent({
      level: 'warn',
      message: 'Failed to bind native UTS SDK events. Falling back to manual state updates only.',
      context: 'utssdk'
    })
  }
}

function unbindNativeEvents() {
  if (typeof nativeUnsubscribeAll === 'function') {
    nativeUnsubscribeAll()
  }
}

function handleRegistration(payload = {}) {
  updateRegistrationState(payload)
  emitLocal('registration', payload)
  logEvent({
    level: 'info',
    message: 'Registration event',
    data: payload,
    context: 'utssdk'
  })
}

function handleCall(payload = {}) {
  updateCallState(payload)
  emitLocal('call', payload)
  logEvent({
    level: 'info',
    message: 'Call event',
    data: payload,
    context: 'utssdk'
  })
}

function handleMessage(payload = {}) {
  if (payload.event === 'received') {
    if (payload.payload) {
      recordMessageReceived({ ...payload.payload, direction: 'incoming' })
    }
  } else if (payload.event === 'sent') {
    if (payload.payload) {
      markMessageSent(payload.payload)
    }
  } else if (payload.event === 'failed') {
    const error = payload.error ? payload.error.message || payload.error.code : 'Message failed'
    markMessageError(error)
  }
  emitLocal('message', payload)
  logEvent({
    level: payload.event === 'failed' ? 'warn' : 'info',
    message: `Message event: ${payload.event || 'unknown'}`,
    data: payload,
    context: 'utssdk'
  })
}

function handleAudioRoute(payload = {}) {
  if (payload.route) {
    setAudioRoute(payload.route)
  }
  emitLocal('audioRoute', payload)
  logEvent({
    level: 'info',
    message: 'Audio route event',
    data: payload,
    context: 'utssdk'
  })
}

function handleDeviceChange(payload = {}) {
  updateAudioDevices({
    devices: payload.devices,
    activeRoute: payload.active?.type || payload.active?.id || payload.activeRoute
  })
  emitLocal('deviceChange', payload)
  logEvent({
    level: 'info',
    message: 'Device change event',
    data: payload,
    context: 'utssdk'
  })
}

function handleConnectivity(payload = {}) {
  emitLocal('connectivity', payload)
  logEvent({
    level: 'info',
    message: 'Connectivity event',
    data: payload,
    context: 'utssdk'
  })
}

function applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return
    }

    if (snapshot.service && typeof snapshot.service === 'object') {
        updateServiceState(snapshot.service)
    } else if (typeof snapshot.initialized === 'boolean' || typeof snapshot.running === 'boolean') {
        updateServiceState({
            initialized: Boolean(snapshot.initialized),
            running: snapshot.running != null ? Boolean(snapshot.running) : undefined
        })
    }

    if (snapshot.registration) {
        handleRegistration(snapshot.registration)
    }
    if (snapshot.call) {
        handleCall(snapshot.call)
    }
    if (snapshot.audioRoute) {
        handleAudioRoute(snapshot.audioRoute)
    } else if (snapshot.audio && snapshot.audio.route) {
        handleAudioRoute(snapshot.audio)
    }
    if (snapshot.devices) {
        handleDeviceChange({ devices: snapshot.devices, active: snapshot.activeDevice })
    }
    if (snapshot.messaging) {
        if (snapshot.messaging.lastError) {
            markMessageError(snapshot.messaging.lastError)
        }
        if (snapshot.messaging.lastSent) {
            markMessageSent(snapshot.messaging.lastSent)
        }
    }
}

export async function bootstrapPlugin(config = {}) {
  logAction('Bootstrap native UTS plugin', config)
  try {
    const result = await callNative('bootstrap', [config], {
      label: 'bootstrap',
      toastOnError: false,
      logSuccess: false
    })
    return result !== false
  } catch (error) {
    logEvent({
      level: 'warn',
      message: 'Bootstrap call failed',
      data: { error: normalizeError(error) },
      context: 'utssdk'
    })
    return false
  }
}

export async function shutdownPlugin() {
  logAction('Shutdown native UTS plugin')
  try {
    await callNative('shutdown', [], {
      label: 'shutdown',
      toastOnError: false,
      logSuccess: false
    })
  } catch (error) {
    logEvent({
      level: 'warn',
      message: 'Shutdown call failed',
      data: { error: normalizeError(error) },
      context: 'utssdk'
    })
  }
}

export async function initService(config = {}) {
  logAction('Initialize UTS service', config)
  const normalizedConfig = { ...config }
  try {
    await callNative('init', [normalizedConfig], { label: 'init' })
    updateServiceState({ initialized: true, lastError: '' })
    emitLocal('service', { initialized: true })
  } catch (error) {
    updateServiceState({ initialized: false, lastError: error.message })
    emitLocal('service', { initialized: false, error })
    throw error
  }
}

export async function disposeService() {
  logAction('Dispose UTS service')
  try {
    await callNative('dispose', [], { label: 'dispose' })
  } catch (error) {
    // dispose might not be implemented; log and continue
    logEvent({
      level: 'warn',
      message: 'Dispose operation failed',
      data: { error: normalizeError(error) },
      context: 'utssdk'
    })
  }
  updateServiceState({ initialized: false, running: false })
  updateRegistrationState({ state: 'none' })
  updateCallState({ state: 'idle', number: '', reason: '' })
  emitLocal('service', { initialized: false })
  unbindNativeEvents()
  bindNativeEvents(getClient())
}

export async function registerAccount(payload = null) {
  logAction('Register account', payload || {})
  try {
    if (payload) {
      await callNative('register', [payload], { label: 'register' })
    } else {
      await callNative('register', [], { label: 'register' })
    }
  } catch (error) {
    throw error
  }
}

export async function unregisterAccount() {
  logAction('Unregister account')
  await callNative('unregister', [], { label: 'unregister' })
}

export async function dialNumber(input) {
  const number = typeof input === 'string' ? input : input?.number || input?.uri || ''
  if (!number) {
    const error = new Error('Number is required to dial')
    showToast(error.message)
    throw error
  }
  logAction('Dial number', { number })
  await callNative('dial', [number], { label: 'call.dial' })
}

export async function hangupCall() {
  logAction('Hangup call')
  await callNative('hangup', [], { label: 'call.hangup' })
}

export async function answerCall() {
  logAction('Answer call')
  await callNative('answer', [], { label: 'call.answer' })
}

export async function sendDtmf(input) {
  const tone = typeof input === 'string' ? input : input?.tone || input?.digit || ''
  if (!tone) {
    const error = new Error('Tone is required for DTMF')
    showToast(error.message)
    throw error
  }
  logAction('Send DTMF', { tone })
  await callNative('sendDtmf', [tone], { label: 'call.sendDtmf' })
}

export async function setAudioOutput(route) {
  const resolved = typeof route === 'string' ? route : route?.route || ''
  if (!resolved) {
    const error = new Error('Audio route is required')
    showToast(error.message)
    throw error
  }
  logAction('Set audio route', { route: resolved })
  await callNative('audioSetRoute', [resolved], { label: 'audio.setRoute' })
  setAudioRoute(resolved)
}

export async function sendMessage(payload) {
  if (!payload || !payload.to || !payload.text) {
    const error = new Error('Recipient and text are required to send a message')
    showToast(error.message)
    throw error
  }
  logAction('Send message', payload)
  await callNative('messageSend', [payload.to, payload.text], { label: 'message.send' })
}

export async function getNativeState({ silent = false } = {}) {
  try {
    const snapshot = await callNative('getState', [], {
      label: 'getState',
      toastOnError: !silent,
      logSuccess: false
    })
    return snapshot
  } catch (error) {
    if (!silent) {
      showToast(error.message || 'Failed to fetch native state')
    }
    throw error
  }
}

export async function setLogLevel(level = 'info') {
  if (!level) {
    return
  }
  await callNative('setLogLevel', [level], {
    label: 'setLogLevel',
    toastOnError: false,
    logSuccess: false
  })
  updateServiceState({ logLevel: level })
  emitLocal('service', { logLevel: level })
}

export async function bootstrapServiceState({ silent = false } = {}) {
  const timestamp = now()
  if (timestamp - lastBootstrapAt < BOOTSTRAP_THROTTLE_MS) {
    return null
  }
  lastBootstrapAt = timestamp
  const client = getClient()
  if (!findMethod(client, METHOD_ALIASES.getState)) {
    if (!silent) {
      showToast('Native state snapshot not available')
    }
    logEvent({
      level: 'warn',
      message: 'getState method not implemented on UTS client',
      context: 'utssdk'
    })
    return null
  }
  try {
    const snapshot = await callNative('getState', [], {
      label: 'getState',
      toastOnError: !silent,
      logSuccess: false
    })
    applySnapshot(snapshot)
    return snapshot
  } catch (error) {
    if (!silent) {
      showToast(error.message || 'Failed to load native snapshot')
    }
    return null
  }
}

export async function simulateIncomingCall(number) {
  const client = ensureMockClient()
  if (client && typeof client.simulateIncoming === 'function') {
    await client.simulateIncoming(number)
    return true
  }
  showToast('Mock simulation unavailable')
  return false
}
