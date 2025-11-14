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

const state = reactive({
  service: {
    initialized: false,
    running: false
  },
  registration: {
    status: 'idle',
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
    availableRoutes: [],
    devices: [],
    suggestedRoute: '',
    reason: ''
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
  Object.assign(state.service, patch)
}

export function updateRegistrationState(patch = {}) {
  Object.assign(state.registration, patch, { lastUpdated: Date.now() })
  if (patch.status && patch.status !== 'error') {
    state.registration.error = ''
  }
  if (patch.suggestedRoute) {
    requestNavigation(patch.suggestedRoute, { auto: true })
  }
}

export function updateCallState(patch = {}) {
  const nextState = patch.state ?? state.call.state
  const merged = { ...patch }

  if (nextState === 'connected' && !state.call.startedAt) {
    merged.startedAt = Date.now()
  }

  if (nextState === 'ended') {
    merged.duration = state.call.startedAt ? Date.now() - state.call.startedAt : state.call.duration
    if (!('reason' in merged) && patch.reason == null) {
      merged.reason = state.call.reason
    }
  }

  if (nextState === 'idle') {
    merged.startedAt = 0
    merged.duration = 0
  }

  Object.assign(state.call, merged)

  if (patch.suggestedRoute) {
    requestNavigation(patch.suggestedRoute, { auto: true })
  }
}

export function setAudioRoute(route) {
  const nextRoute = route || 'system'
  state.call.audioRoute = nextRoute
  if (Array.isArray(state.call.devices)) {
    state.call.devices.forEach((device) => {
      device.selected = device.type === nextRoute || device.id === nextRoute
    })
  }
  if (nextRoute && Array.isArray(state.call.availableRoutes) && !state.call.availableRoutes.includes(nextRoute)) {
    state.call.availableRoutes.push(nextRoute)
  }
}

export function updateAudioDevices(payload = {}) {
  const devicesInput = Array.isArray(payload.devices) ? payload.devices : []
  const normalized = devicesInput.map((device) => {
    const id = device?.id || device?.name || `device-${Math.random().toString(36).slice(2, 10)}`
    const name = device?.name || device?.label || id
    const type = device?.type || device?.route || device?.category || 'unknown'
    return {
      id,
      name,
      type,
      selected: !!device?.selected
    }
  })
  state.call.devices = normalized
  const routes = normalized
    .map((device) => device.type)
    .filter((route, index, arr) => route && arr.indexOf(route) === index)
  const uniqueRoutes = routes.length > 0 ? [...routes] : []
  if (!uniqueRoutes.includes('system')) {
    uniqueRoutes.unshift('system')
  }
  state.call.availableRoutes = uniqueRoutes
  if (payload?.activeRoute) {
    setAudioRoute(payload.activeRoute)
  } else {
    const selected = normalized.find((device) => device.selected)
    if (selected) {
      setAudioRoute(selected.type || selected.id)
    }
  }
}

export function recordMessageReceived(message) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...message
  }
  state.messaging.received.unshift(entry)
  if (state.messaging.received.length > MAX_MESSAGES) {
    state.messaging.received.length = MAX_MESSAGES
  }
}

export function markMessageSent(payload) {
  state.messaging.lastSent = { ...payload, timestamp: Date.now() }
  state.messaging.lastError = ''
}

export function markMessageError(error) {
  state.messaging.lastError = error
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
  const now = Date.now()
  if (auto && now < state.navigation.manualBlockUntil && resolved !== state.navigation.manualRoute) {
    return
  }
  state.navigation.requestedRoute = resolved
  state.navigation.requestReplace = replace
}

export function manualNavigate(route, { replace = false } = {}) {
  const now = Date.now()
  state.navigation.manualBlockUntil = now + MANUAL_NAVIGATION_HOLD_MS
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
