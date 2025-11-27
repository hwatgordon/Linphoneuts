import { reactive } from 'vue'

export const ROUTES = Object.freeze({
  launcher: '/pages/test/index',
  registration: '/pages/registration/index',
  dialer: '/pages/dialer/index',
  call: '/pages/call/index',
  messages: '/pages/messages/index'
})

const MAX_EVENTS = 200
const MAX_MESSAGES = 50
const MANUAL_NAVIGATION_HOLD_MS = 8000

const CALL_ACTIVE_STATES = ['incoming', 'outgoing', 'connected']
const CALL_END_STATES = ['ended', 'error', 'idle']

const state = reactive({
  service: {
    initialized: false,
    running: false,
    provider: '',
    plugin: '',
    logLevel: 'info',
    lastError: ''
  },
  registration: {
    status: 'none',
    state: 'none',
    error: '',
    reason: '',
    detail: null,
    lastUpdated: 0
  },
  call: {
    state: 'idle',
    direction: '',
    number: '',
    displayName: '',
    startedAt: 0,
    duration: 0,
    audioRoute: 'system',
    audioRouteReason: '',
    availableRoutes: [],
    devices: [],
    suggestedRoute: '',
    reason: '',
    error: '',
    lastUpdated: 0
  },
  messaging: {
    lastSent: null,
    lastError: '',
    received: []
  },
  navigation: {
    currentRoute: ROUTES.launcher,
    requestedRoute: '',
    requestReplace: false,
    manualBlockUntil: 0,
    manualRoute: ROUTES.launcher
  },
  events: []
})

function assignDefined(target, source) {
  Object.entries(source).forEach(([key, value]) => {
    if (value !== undefined) {
      target[key] = value
    }
  })
}

function toStringValue(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback
  }
  try {
    return String(value)
  } catch (error) {
    return fallback
  }
}

function extractErrorMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error.message) return toStringValue(error.message)
  if (error.code) return toStringValue(error.code)
  return toStringValue(error)
}

function determineRegistrationRoute(previous, next, hasError) {
  if (!next || next === previous) {
    return ''
  }
  if (hasError || next === 'failed') {
    return ROUTES.registration
  }
  if (next === 'ok') {
    return ROUTES.dialer
  }
  if (next === 'none') {
    return ROUTES.launcher
  }
  return ''
}

function determineCallRoute(previous, next) {
  if (!next || next === previous) {
    return ''
  }
  if (CALL_ACTIVE_STATES.includes(next)) {
    return ROUTES.call
  }
  if (CALL_END_STATES.includes(next) && CALL_ACTIVE_STATES.concat(['ended', 'error']).includes(previous)) {
    return ROUTES.dialer
  }
  return ''
}

export function useAppState() {
  return state
}

export function logEvent({ level = 'info', message = '', data = null, context = '' }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    level,
    message,
    data,
    context
  }
  state.events.unshift(entry)
  if (state.events.length > MAX_EVENTS) {
    state.events.length = MAX_EVENTS
  }
  return entry
}

export function updateServiceState(patch = {}) {
  const next = {}
  if ('initialized' in patch) next.initialized = Boolean(patch.initialized)
  if ('running' in patch) next.running = Boolean(patch.running)
  if ('provider' in patch) next.provider = toStringValue(patch.provider)
  if ('plugin' in patch) next.plugin = toStringValue(patch.plugin)
  if ('logLevel' in patch) next.logLevel = toStringValue(patch.logLevel || 'info')
  if ('lastError' in patch) {
    next.lastError = toStringValue(patch.lastError)
  }
  if (patch.error) {
    next.lastError = extractErrorMessage(patch.error)
  }
  assignDefined(state.service, next)
}

export function updateRegistrationState(patch = {}) {
  const previous = state.registration.state
  const timestamp = patch.timestamp || Date.now()
  const nextState = patch.state ?? patch.status ?? previous ?? 'none'
  const reason = toStringValue(patch.reason)
  const detail = patch.detail ?? patch.details ?? null
  const errorMessage = extractErrorMessage(patch.error)

  state.registration.status = nextState || 'none'
  state.registration.state = nextState || 'none'
  state.registration.detail = detail
  state.registration.reason = reason
  state.registration.lastUpdated = timestamp

  if (errorMessage) {
    state.registration.error = errorMessage
  } else if (nextState !== 'failed') {
    state.registration.error = ''
  }

  const suggested = patch.suggestedRoute ?? determineRegistrationRoute(previous, state.registration.state, !!state.registration.error)
  if (suggested) {
    requestNavigation(suggested, { auto: true })
  }
}

export function updateCallState(patch = {}) {
  const previous = state.call.state
  const timestamp = patch.timestamp || Date.now()
  const nextState = patch.state ?? patch.status ?? previous ?? 'idle'

  const updates = {
    state: nextState,
    lastUpdated: timestamp
  }

  if (patch.direction !== undefined) {
    updates.direction = toStringValue(patch.direction)
  } else if (patch.detail && patch.detail.direction !== undefined) {
    updates.direction = toStringValue(patch.detail.direction)
  }

  if (!updates.direction) {
    if (nextState === 'incoming') {
      updates.direction = 'incoming'
    } else if (nextState === 'outgoing') {
      updates.direction = 'outgoing'
    }
  }

  const numberCandidate =
    patch.number ??
    patch.remote ??
    patch.uri ??
    patch.address ??
    patch.detail?.number ??
    patch.detail?.uri
  if (numberCandidate !== undefined) {
    updates.number = toStringValue(numberCandidate)
  }

  const displayNameCandidate = patch.displayName ?? patch.detail?.displayName ?? patch.detail?.name
  if (displayNameCandidate !== undefined) {
    updates.displayName = toStringValue(displayNameCandidate)
  }

  if (patch.reason !== undefined) {
    updates.reason = toStringValue(patch.reason)
  }

  const errorMessage = extractErrorMessage(patch.error)
  if (errorMessage) {
    updates.error = errorMessage
    if (!updates.reason) {
      updates.reason = errorMessage
    }
  } else if (nextState !== 'error') {
    updates.error = ''
  }

  if (nextState === 'connected') {
    if (!state.call.startedAt) {
      updates.startedAt = timestamp
    }
  } else if (CALL_ACTIVE_STATES.includes(nextState)) {
    if (!state.call.startedAt) {
      updates.startedAt = 0
    }
  } else if (nextState === 'ended' || nextState === 'error') {
    updates.duration = state.call.startedAt ? timestamp - state.call.startedAt : state.call.duration
    updates.startedAt = 0
  } else if (nextState === 'idle') {
    updates.startedAt = 0
    updates.duration = 0
    updates.reason = ''
    updates.error = ''
    updates.number = ''
  }

  if (patch.detail?.audioRoute && !patch.audioRoute) {
    updates.audioRoute = toStringValue(patch.detail.audioRoute)
  }

  assignDefined(state.call, updates)

  const suggested = patch.suggestedRoute ?? determineCallRoute(previous, nextState)
  state.call.suggestedRoute = suggested
  if (suggested) {
    requestNavigation(suggested, { auto: true })
  }
}

export function setAudioRoute(input) {
  const payload = typeof input === 'string' ? { route: input } : input || {}
  const nextRoute = payload.route ? toStringValue(payload.route) : 'system'
  const reason = payload.reason ? toStringValue(payload.reason) : ''

  state.call.audioRoute = nextRoute
  state.call.audioRouteReason = reason

  if (Array.isArray(state.call.devices)) {
    state.call.devices.forEach((device) => {
      device.selected = device.type === nextRoute || device.id === nextRoute || device.name === nextRoute
    })
  }

  if (
    nextRoute &&
    Array.isArray(state.call.availableRoutes) &&
    !state.call.availableRoutes.includes(nextRoute)
  ) {
    state.call.availableRoutes.push(nextRoute)
  }
}

export function updateAudioDevices(payload = {}) {
  const devicesInput = Array.isArray(payload.devices) ? payload.devices : []
  const active = payload.active ?? null
  const activeRoute =
    payload.activeRoute ||
    (active && (active.route || active.type || active.category || active.id || active.name)) ||
    (typeof active === 'string' ? active : '')

  const normalized = devicesInput.map((device) => {
    if (!device || typeof device !== 'object') {
      const fallback = toStringValue(device, 'device')
      return {
        id: fallback,
        name: fallback,
        label: fallback,
        type: 'unknown',
        selected: fallback === activeRoute
      }
    }
    const id =
      device.id ||
      device.identifier ||
      device.uid ||
      device.name ||
      device.label ||
      `device-${Math.random().toString(36).slice(2, 10)}`
    const label = device.label || device.name || device.description || id
    const type = device.type || device.route || device.category || device.kind || 'unknown'
    const isSelected =
      Boolean(device.selected || device.isDefault || device.default) ||
      id === activeRoute ||
      type === activeRoute ||
      label === activeRoute
    return {
      id,
      name: label,
      label,
      type,
      selected: isSelected
    }
  })

  state.call.devices = normalized

  const routes = normalized
    .map((device) => device.type)
    .filter((route, index, arr) => route && arr.indexOf(route) === index)
  const available = routes.length ? [...routes] : []
  if (!available.includes('system')) {
    available.unshift('system')
  }
  state.call.availableRoutes = available

  if (activeRoute) {
    setAudioRoute({ route: activeRoute, reason: 'device' })
  } else {
    const selected = normalized.find((device) => device.selected)
    if (selected) {
      setAudioRoute({ route: selected.type || selected.id, reason: 'device' })
    }
  }
}

export function recordMessageReceived(message) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    from: toStringValue(message?.from),
    to: toStringValue(message?.to),
    text: toStringValue(message?.text),
    direction: message?.direction || 'incoming'
  }
  state.messaging.received.unshift(entry)
  if (state.messaging.received.length > MAX_MESSAGES) {
    state.messaging.received.length = MAX_MESSAGES
  }
}

export function markMessageSent(payload) {
  if (!payload) {
    state.messaging.lastSent = null
    return
  }
  state.messaging.lastSent = {
    ...payload,
    timestamp: Date.now()
  }
  state.messaging.lastError = ''
}

export function markMessageError(error) {
  state.messaging.lastError = extractErrorMessage(error)
}

export function setCurrentRoute(route) {
  if (route) {
    state.navigation.currentRoute = route
  }
}

export function requestNavigation(route, { auto = false, replace = false } = {}) {
  if (!route) return
  let resolved = route
  if (!resolved.startsWith('/')) {
    resolved = ROUTES[route] || route
  }
  if (!resolved.startsWith('/')) {
    return
  }
  const nowTs = Date.now()
  if (auto && nowTs < state.navigation.manualBlockUntil && resolved !== state.navigation.manualRoute) {
    return
  }
  state.navigation.requestedRoute = resolved
  state.navigation.requestReplace = replace
}

export function manualNavigate(route, { replace = false } = {}) {
  const nowTs = Date.now()
  state.navigation.manualBlockUntil = nowTs + MANUAL_NAVIGATION_HOLD_MS
  state.navigation.manualRoute = resolveRoute(route)
  requestNavigation(route, { auto: false, replace })
}

export function consumeRequestedRoute() {
  const route = state.navigation.requestedRoute
  const replace = !!state.navigation.requestReplace
  state.navigation.requestedRoute = ''
  state.navigation.requestReplace = false
  return { route, replace }
}

export function resolveRoute(route) {
  if (!route) return ''
  if (route.startsWith('/')) return route
  return ROUTES[route] || route
}
