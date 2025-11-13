import { EventBus, SUPPORTED_EVENTS } from './events';
import type {
  AudioRoute,
  AudioRouteState,
  CallState,
  ConnectivityStatus,
  DeviceDescriptor,
  MessageEvent,
  MessagePayload,
  NormalizedError,
  RegistrationState,
  SipConfig,
  TransportKind
} from './types';
import type { CoreEventName, EventHandler, EventPayloadMap } from './events';

declare const plus: any;
declare const uni: any;

type PlatformIdentifier = 'app-ios' | 'app-android' | 'web' | 'unknown';

type PlatformEventName = CoreEventName;

type PlatformEventHandler<K extends PlatformEventName> = (payload: any) => void;

interface PlatformShim {
  init(config: SipConfig): Promise<void>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  dispose?: () => Promise<void> | void;
  call: {
    dial(number: string): Promise<void>;
    hangup(): Promise<void>;
    answer(): Promise<void>;
    sendDtmf(tone: string): Promise<void>;
  };
  message: {
    send(to: string, text: string): Promise<void>;
  };
  audio: {
    setRoute(route: AudioRoute): Promise<void>;
  };
  subscribe<K extends PlatformEventName>(event: K, handler: PlatformEventHandler<K>): void;
  unsubscribe<K extends PlatformEventName>(event: K, handler: PlatformEventHandler<K>): void;
}

interface OperationState {
  init?: Promise<void> | null;
  dispose?: Promise<void> | null;
  register?: Promise<void> | null;
  unregister?: Promise<void> | null;
}

const GLOBAL_SHIM_REGISTRY = '__UTSSDK_PLATFORM_SHIMS__';

const DEBOUNCE_WINDOWS: Partial<Record<CoreEventName, number>> = {
  audioRoute: 250,
  connectivity: 750
};

const REGISTRATION_STATES: RegistrationState[] = ['none', 'progress', 'ok', 'failed'];
const CALL_STATES: CallState[] = ['incoming', 'outgoing', 'connected', 'ended', 'error'];
const MESSAGE_EVENTS: MessageEvent[] = ['received', 'sent', 'failed'];
const AUDIO_ROUTES: AudioRouteState[] = ['earpiece', 'speaker', 'bluetooth', 'unknown'];
const CONNECTIVITY_STATES: ConnectivityStatus[] = ['unknown', 'offline', 'online', 'degraded'];
const TRANSPORT_KINDS: TransportKind[] = ['udp', 'tcp', 'tls'];

function safeString(value: any, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  try {
    return String(value);
  } catch (error) {
    return fallback;
  }
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

export class CoreServiceManager {
  private readonly eventBus: EventBus;

  private readonly operations: OperationState = {};

  private readonly platformShim: PlatformShim;

  private readonly bridgeHandlers: Record<CoreEventName, PlatformEventHandler<any>>;

  private nativeEventsBound = false;

  private config: SipConfig | null = null;

  private initialized = false;

  private registrationState: RegistrationState = 'none';

  private preferredAudioRoute: AudioRoute = 'system';

  constructor() {
    this.eventBus = new EventBus({
      debounce: DEBOUNCE_WINDOWS,
      logger: (level, message, context) => {
        this.log(level, message, context);
      }
    });
    this.platformShim = this.resolvePlatformShim();
    this.bridgeHandlers = this.createBridgeHandlers();
  }

  public getEvents(): EventBus {
    return this.eventBus;
  }

  public getConfig(): SipConfig | null {
    return this.config ? { ...this.config } : null;
  }

  public getRegistrationState(): RegistrationState {
    return this.registrationState;
  }

  public async init(config: SipConfig): Promise<void> {
    if (!config) {
      throw this.normalizeError({ code: 'invalid_config', message: 'Configuration is required.' });
    }
    if (this.initialized) {
      const merged = { ...(this.config ?? {}), ...config } as SipConfig;
      this.config = this.normalizeConfig(merged);
      this.log('debug', 'Core service already initialized; refreshed configuration.', { config: this.config });
      return;
    }
    if (this.operations.init) {
      return this.operations.init;
    }
    this.operations.init = this.performInit(config);
    try {
      await this.operations.init;
    } finally {
      this.operations.init = null;
    }
  }

  public async dispose(): Promise<void> {
    if (this.operations.dispose) {
      return this.operations.dispose;
    }
    this.operations.dispose = this.performDispose();
    try {
      await this.operations.dispose;
    } finally {
      this.operations.dispose = null;
    }
  }

  public async register(): Promise<void> {
    await this.ensureInitialized('register');
    if (this.operations.register) {
      return this.operations.register;
    }
    this.operations.register = this.wrapOperation('register', () => this.platformShim.register());
    try {
      await this.operations.register;
    } finally {
      this.operations.register = null;
    }
  }

  public async unregister(): Promise<void> {
    await this.ensureInitialized('unregister');
    if (this.operations.unregister) {
      return this.operations.unregister;
    }
    this.operations.unregister = this.wrapOperation('unregister', () => this.platformShim.unregister());
    try {
      await this.operations.unregister;
    } finally {
      this.operations.unregister = null;
    }
  }

  public async dial(number: string): Promise<void> {
    await this.ensureInitialized('dial');
    if (!number) {
      throw this.normalizeError({ code: 'invalid_number', message: 'Dialed number must not be empty.' });
    }
    await this.wrapOperation('dial', () => this.platformShim.call.dial(number));
  }

  public async hangup(): Promise<void> {
    await this.ensureInitialized('hangup');
    await this.wrapOperation('hangup', () => this.platformShim.call.hangup());
  }

  public async answer(): Promise<void> {
    await this.ensureInitialized('answer');
    await this.wrapOperation('answer', () => this.platformShim.call.answer());
  }

  public async sendDtmf(tone: string): Promise<void> {
    await this.ensureInitialized('sendDtmf');
    if (!tone) {
      throw this.normalizeError({ code: 'invalid_tone', message: 'DTMF tone must not be empty.' });
    }
    await this.wrapOperation('sendDtmf', () => this.platformShim.call.sendDtmf(tone));
  }

  public async sendMessage(to: string, text: string): Promise<void> {
    await this.ensureInitialized('sendMessage');
    if (!to) {
      throw this.normalizeError({ code: 'invalid_recipient', message: 'Recipient must not be empty.' });
    }
    if (!text) {
      throw this.normalizeError({ code: 'invalid_message', message: 'Message body must not be empty.' });
    }
    await this.wrapOperation('sendMessage', () => this.platformShim.message.send(to, text));
  }

  public async setAudioRoute(route: AudioRoute): Promise<void> {
    await this.ensureInitialized('setAudioRoute');
    if (this.preferredAudioRoute === route) {
      this.log('debug', 'Audio route already set; skipping update.', { route });
      return;
    }
    this.preferredAudioRoute = route;
    await this.wrapOperation('setAudioRoute', () => this.platformShim.audio.setRoute(route));
  }

  public on<K extends CoreEventName>(event: K, handler: EventHandler<K>): void {
    this.eventBus.on(event, handler);
  }

  public off<K extends CoreEventName>(event: K, handler: EventHandler<K>): void {
    this.eventBus.off(event, handler);
  }

  public once<K extends CoreEventName>(event: K, handler: EventHandler<K>): void {
    this.eventBus.once(event, handler);
  }

  public removeAll(event?: CoreEventName): void {
    this.eventBus.removeAll(event);
  }

  public emit<K extends CoreEventName>(event: K, payload: EventPayloadMap[K]): void {
    this.eventBus.emit(event, payload);
  }

  private async performInit(config: SipConfig): Promise<void> {
    this.log('info', 'Initializing core service.', { config });
    try {
      const normalized = this.normalizeConfig(config);
      this.config = normalized;
      this.preferredAudioRoute = 'system';
      this.eventBus.setReady(false);
      this.bindNativeEvents();
      await this.platformShim.init(normalized);
      this.initialized = true;
      this.registrationState = 'none';
      this.eventBus.setReady(true);
      this.log('info', 'Core service initialized successfully.');
    } catch (error) {
      this.eventBus.setReady(false);
      const normalizedError = this.normalizeError(error);
      this.log('error', 'Core service initialization failed.', { error: normalizedError });
      throw normalizedError;
    }
  }

  private async performDispose(): Promise<void> {
    this.log('info', 'Disposing core service.');
    this.eventBus.setReady(false);
    if (this.nativeEventsBound) {
      this.unbindNativeEvents();
    }
    if (typeof this.platformShim.dispose === 'function') {
      try {
        await this.platformShim.dispose();
      } catch (error) {
        this.log('warn', 'Platform shim dispose failed.', { error: this.normalizeError(error) });
      }
    }
    this.initialized = false;
    this.config = null;
    this.registrationState = 'none';
    this.preferredAudioRoute = 'system';
    this.log('info', 'Core service disposed.');
  }

  private async ensureInitialized(operation: string): Promise<void> {
    if (this.operations.init) {
      await this.operations.init;
    }
    if (!this.initialized) {
      throw this.normalizeError({
        code: 'not_initialized',
        message: `Cannot ${operation} before the core service is initialized.`
      });
    }
  }

  private async wrapOperation(label: string, operation: () => Promise<void>): Promise<void> {
    this.log('debug', `Executing operation ${label}.`);
    try {
      await operation();
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      this.log('error', `Operation ${label} failed.`, { error: normalizedError });
      throw normalizedError;
    }
  }

  private bindNativeEvents(): void {
    if (this.nativeEventsBound) {
      return;
    }
    SUPPORTED_EVENTS.forEach((event) => {
      const handler = this.bridgeHandlers[event];
      try {
        this.platformShim.subscribe(event, handler);
      } catch (error) {
        this.log('warn', `Failed to subscribe to ${event} event.`, { error: this.normalizeError(error) });
      }
    });
    this.nativeEventsBound = true;
  }

  private unbindNativeEvents(): void {
    SUPPORTED_EVENTS.forEach((event) => {
      const handler = this.bridgeHandlers[event];
      try {
        this.platformShim.unsubscribe(event, handler);
      } catch (error) {
        this.log('warn', `Failed to unsubscribe from ${event} event.`, { error: this.normalizeError(error) });
      }
    });
    this.nativeEventsBound = false;
  }

  private createBridgeHandlers(): Record<CoreEventName, PlatformEventHandler<any>> {
    return {
      registration: (payload) => {
        const normalized = this.normalizeRegistrationEvent(payload);
        this.registrationState = normalized.state;
        this.eventBus.emit('registration', normalized);
      },
      call: (payload) => {
        const normalized = this.normalizeCallEvent(payload);
        this.eventBus.emit('call', normalized);
      },
      message: (payload) => {
        const normalized = this.normalizeMessageEvent(payload);
        this.eventBus.emit('message', normalized);
      },
      audioRoute: (payload) => {
        const normalized = this.normalizeAudioRouteEvent(payload);
        this.eventBus.emit('audioRoute', normalized);
      },
      deviceChange: (payload) => {
        const normalized = this.normalizeDeviceChangeEvent(payload);
        this.eventBus.emit('deviceChange', normalized);
      },
      connectivity: (payload) => {
        const normalized = this.normalizeConnectivityEvent(payload);
        this.eventBus.emit('connectivity', normalized);
      }
    };
  }

  private normalizeConfig(config: SipConfig): SipConfig {
    const transportCandidate = config.transport;
    const transport = transportCandidate && TRANSPORT_KINDS.includes(transportCandidate)
      ? transportCandidate
      : undefined;
    const normalized: SipConfig = {
      sipServer: safeString(config.sipServer, ''),
      username: safeString(config.username, ''),
      password: safeString(config.password, ''),
      transport,
      displayName: config.displayName ? safeString(config.displayName, '') : undefined
    };
    if (!normalized.sipServer || !normalized.username || !normalized.password) {
      throw this.normalizeError({
        code: 'invalid_config',
        message: 'sipServer, username, and password are mandatory.'
      });
    }
    return normalized;
  }

  private normalizeRegistrationEvent(payload: any): EventPayloadMap['registration'] {
    const raw = payload ?? {};
    const stateCandidate = safeString(raw.state ?? raw.status ?? raw.registration ?? raw.phase, 'none');
    const state = REGISTRATION_STATES.includes(stateCandidate as RegistrationState)
      ? (stateCandidate as RegistrationState)
      : this.mapRegistrationState(stateCandidate);
    const reason = safeString(raw.reason ?? raw.detail?.reason ?? raw.errorReason, '');
    const errorPayload = raw.error ?? raw.err ?? raw.failure ?? null;
    return {
      state,
      reason: reason || undefined,
      detail: raw.detail ?? raw.details ?? clone(raw.payload),
      error: errorPayload ? this.normalizeError(errorPayload) : null,
      timestamp: Date.now(),
      raw: clone(raw)
    };
  }

  private mapRegistrationState(value: string): RegistrationState {
    const normalized = value.toLowerCase();
    if (normalized.includes('progress') || normalized.includes('trying')) {
      return 'progress';
    }
    if (normalized.includes('ok') || normalized.includes('success') || normalized.includes('registered')) {
      return 'ok';
    }
    if (normalized.includes('fail') || normalized.includes('error')) {
      return 'failed';
    }
    return 'none';
  }

  private normalizeCallEvent(payload: any): EventPayloadMap['call'] {
    const raw = payload ?? {};
    const stateCandidate = safeString(raw.state ?? raw.status ?? raw.phase, 'error');
    const state = CALL_STATES.includes(stateCandidate as CallState)
      ? (stateCandidate as CallState)
      : this.mapCallState(stateCandidate);
    const directionCandidate = safeString(raw.direction ?? raw.dir ?? raw.type, '');
    const direction = this.normalizeCallDirection(directionCandidate);
    const number = safeString(raw.number ?? raw.remote ?? raw.uri ?? raw.address, '');
    const reason = safeString(raw.reason ?? raw.cause ?? raw.detail?.reason, '');
    const errorPayload = raw.error ?? raw.err ?? raw.failure ?? null;
    return {
      state,
      direction,
      number: number || undefined,
      reason: reason || undefined,
      error: errorPayload ? this.normalizeError(errorPayload) : null,
      detail: raw.detail ?? raw.details ?? clone(raw.payload),
      timestamp: Date.now(),
      raw: clone(raw)
    };
  }

  private mapCallState(value: string): CallState {
    const normalized = value.toLowerCase();
    if (normalized.includes('incoming') || normalized.includes('ring')) {
      return 'incoming';
    }
    if (normalized.includes('dial') || normalized.includes('outgoing') || normalized.includes('progress')) {
      return 'outgoing';
    }
    if (normalized.includes('connected') || normalized.includes('active') || normalized.includes('established')) {
      return 'connected';
    }
    if (normalized.includes('end') || normalized.includes('hang') || normalized.includes('terminate') || normalized.includes('complete')) {
      return 'ended';
    }
    return 'error';
  }

  private normalizeCallDirection(value: string): 'incoming' | 'outgoing' | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.toLowerCase();
    if (normalized.startsWith('in')) {
      return 'incoming';
    }
    if (normalized.startsWith('out') || normalized.startsWith('dial') || normalized.startsWith('call-out')) {
      return 'outgoing';
    }
    if (normalized.includes('incoming')) {
      return 'incoming';
    }
    if (normalized.includes('outgoing') || normalized.includes('outbound')) {
      return 'outgoing';
    }
    return undefined;
  }

  private normalizeMessageEvent(payload: any): EventPayloadMap['message'] {
    const raw = payload ?? {};
    const eventCandidate = safeString(raw.event ?? raw.state ?? raw.status ?? raw.type, 'received');
    const event = MESSAGE_EVENTS.includes(eventCandidate as MessageEvent)
      ? (eventCandidate as MessageEvent)
      : this.mapMessageEvent(eventCandidate);
    const messagePayload = this.normalizeMessagePayload(raw.payload ?? raw.message ?? raw);
    const errorPayload = raw.error ?? raw.err ?? null;
    return {
      event,
      payload: messagePayload,
      error: errorPayload ? this.normalizeError(errorPayload) : null,
      timestamp: Date.now(),
      raw: clone(raw)
    };
  }

  private mapMessageEvent(value: string): MessageEvent {
    const normalized = value.toLowerCase();
    if (normalized.includes('send')) {
      return 'sent';
    }
    if (normalized.includes('fail') || normalized.includes('error')) {
      return 'failed';
    }
    return 'received';
  }

  private normalizeMessagePayload(payload: any): MessagePayload {
    if (!payload || typeof payload !== 'object') {
      return { text: safeString(payload, '') };
    }
    return {
      from: safeString(payload.from ?? payload.sender, ''),
      to: safeString(payload.to ?? payload.recipient, ''),
      text: safeString(payload.text ?? payload.body ?? payload.message, '')
    };
  }

  private normalizeAudioRouteEvent(payload: any): EventPayloadMap['audioRoute'] {
    const raw = payload ?? {};
    const routeCandidate = safeString(raw.route ?? raw.state ?? raw.mode ?? raw.output, 'unknown');
    const normalizedRoute = AUDIO_ROUTES.includes(routeCandidate as AudioRouteState)
      ? (routeCandidate as AudioRouteState)
      : this.mapAudioRoute(routeCandidate);
    return {
      route: normalizedRoute,
      reason: safeString(raw.reason ?? raw.detail?.reason ?? '', '') || undefined,
      timestamp: Date.now(),
      raw: clone(raw)
    };
  }

  private mapAudioRoute(value: string): AudioRouteState {
    const normalized = value.toLowerCase();
    if (normalized.includes('ear')) {
      return 'earpiece';
    }
    if (normalized.includes('speak') || normalized.includes('loud')) {
      return 'speaker';
    }
    if (normalized.includes('bluetooth') || normalized.includes('bt')) {
      return 'bluetooth';
    }
    return 'unknown';
  }

  private normalizeDeviceChangeEvent(payload: any): EventPayloadMap['deviceChange'] {
    const raw = payload ?? {};
    const devices = Array.isArray(raw.devices)
      ? raw.devices.map((device: any) => this.normalizeDevice(device))
      : Array.isArray(raw)
      ? raw.map((device: any) => this.normalizeDevice(device))
      : [];
    const activeDevice = raw.active ?? raw.activeDevice ?? raw.current ?? null;
    return {
      devices,
      active: activeDevice ? this.normalizeDevice(activeDevice) : null,
      timestamp: Date.now(),
      raw: clone(raw)
    };
  }

  private normalizeDevice(device: any): DeviceDescriptor {
    if (!device || typeof device !== 'object') {
      const label = safeString(device, 'unknown');
      return {
        id: label,
        label,
        type: 'other'
      };
    }
    const id = safeString(device.id ?? device.identifier ?? device.uid, '');
    const label = safeString(device.label ?? device.name ?? device.description ?? id, 'unknown');
    const type = safeString(device.type ?? device.kind ?? device.category, 'other');
    return {
      id: id || label,
      label,
      type,
      isDefault: Boolean(device.isDefault ?? device.default),
      isConnected: device.isConnected ?? device.connected ?? undefined
    };
  }

  private normalizeConnectivityEvent(payload: any): EventPayloadMap['connectivity'] {
    const raw = payload ?? {};
    const statusCandidate = safeString(raw.status ?? raw.state ?? raw.mode, 'unknown');
    const status = CONNECTIVITY_STATES.includes(statusCandidate as ConnectivityStatus)
      ? (statusCandidate as ConnectivityStatus)
      : this.mapConnectivityStatus(statusCandidate, raw.connected);
    const errorPayload = raw.error ?? raw.err ?? null;
    const detail = raw.detail ?? raw.details ?? clone(raw.payload);
    return {
      status,
      networkType: safeString(raw.network ?? raw.networkType ?? raw.transport ?? '', '') || undefined,
      strength: typeof raw.strength === 'number' ? raw.strength : undefined,
      detail,
      error: errorPayload ? this.normalizeError(errorPayload) : null,
      timestamp: Date.now(),
      raw: clone(raw)
    };
  }

  private mapConnectivityStatus(value: string, connected?: boolean): ConnectivityStatus {
    const normalized = value.toLowerCase();
    if (normalized.includes('online') || normalized.includes('connected') || connected === true) {
      return 'online';
    }
    if (normalized.includes('offline') || normalized.includes('disconnected') || connected === false) {
      return 'offline';
    }
    if (normalized.includes('degrad') || normalized.includes('limited')) {
      return 'degraded';
    }
    return 'unknown';
  }

  private resolvePlatformShim(): PlatformShim {
    const platform = this.detectPlatform();
    const shim = this.lookupPlatformShim(platform) ?? this.lookupPlatformShim('web') ?? this.lookupPlatformShim('unknown');
    if (shim) {
      return shim;
    }
    return this.createUnsupportedPlatformShim(platform);
  }

  private detectPlatform(): PlatformIdentifier {
    try {
      if (typeof plus !== 'undefined' && plus !== null && plus.os && typeof plus.os.name === 'string') {
        const osName = safeString(plus.os.name, '').toLowerCase();
        if (osName === 'android') {
          return 'app-android';
        }
        if (osName === 'ios') {
          return 'app-ios';
        }
        return 'unknown';
      }
    } catch (error) {
      this.log('warn', 'Platform detection via plus failed.', { error: this.normalizeError(error) });
    }
    try {
      const systemInfo = uni?.getSystemInfoSync?.();
      if (systemInfo && typeof systemInfo.platform === 'string') {
        const platform = systemInfo.platform.toLowerCase();
        if (platform === 'android') {
          return 'app-android';
        }
        if (platform === 'ios') {
          return 'app-ios';
        }
        if (platform === 'web' || platform === 'h5') {
          return 'web';
        }
      }
    } catch (error) {
      this.log('warn', 'Platform detection via uni failed.', { error: this.normalizeError(error) });
    }
    return 'unknown';
  }

  private lookupPlatformShim(platform: PlatformIdentifier): PlatformShim | null {
    try {
      const registry = (globalThis as any)[GLOBAL_SHIM_REGISTRY];
      if (registry && platform in registry) {
        const shim = registry[platform];
        if (shim) {
          return shim as PlatformShim;
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to read platform shim registry.', { error: this.normalizeError(error) });
    }
    return null;
  }

  private createUnsupportedPlatformShim(platform: PlatformIdentifier): PlatformShim {
    const notSupported = async (): Promise<void> => {
      throw this.normalizeError({
        code: 'platform_unsupported',
        message: `UTS SDK is not available on platform: ${platform}`
      });
    };
    return {
      async init(_: SipConfig): Promise<void> {
        await notSupported();
      },
      async register(): Promise<void> {
        await notSupported();
      },
      async unregister(): Promise<void> {
        await notSupported();
      },
      call: {
        async dial(): Promise<void> {
          await notSupported();
        },
        async hangup(): Promise<void> {
          await notSupported();
        },
        async answer(): Promise<void> {
          await notSupported();
        },
        async sendDtmf(): Promise<void> {
          await notSupported();
        }
      },
      message: {
        async send(): Promise<void> {
          await notSupported();
        }
      },
      audio: {
        async setRoute(): Promise<void> {
          await notSupported();
        }
      },
      subscribe() {
        // no-op
      },
      unsubscribe() {
        // no-op
      }
    };
  }

  private normalizeError(error: any): NormalizedError {
    if (error && typeof error === 'object') {
      const code = safeString(error.code ?? error.errCode ?? error.errorCode, 'unknown');
      const message = safeString(
        error.message ?? error.errMsg ?? error.errorMessage ?? error.description,
        'Unexpected platform error'
      );
      return {
        code,
        message,
        detail: error.detail ?? clone(error)
      };
    }
    if (typeof error === 'string') {
      return { code: 'unknown', message: error };
    }
    return { code: 'unknown', message: safeString(error, 'Unknown error') };
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, any>): void {
    const prefix = '[UTSSDK Core]';
    const payload = context ? [prefix, message, context] : [prefix, message];
    try {
      switch (level) {
        case 'debug':
          console.debug(...payload);
          break;
        case 'info':
          console.info(...payload);
          break;
        case 'warn':
          console.warn(...payload);
          break;
        case 'error':
          console.error(...payload);
          break;
        default:
          console.log(...payload);
      }
    } catch (_) {
      // ignore logging errors
    }
  }
}

export const PLATFORM_SHIM_REGISTRY = GLOBAL_SHIM_REGISTRY;

export const coreService = new CoreServiceManager();

export default coreService;
