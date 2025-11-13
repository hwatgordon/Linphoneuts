import type {
  AudioRouteState,
  CallState,
  ConnectivityStatus,
  DeviceDescriptor,
  MessageEvent,
  MessagePayload,
  NormalizedError,
  RegistrationState
} from './types';

export interface RegistrationEventPayload {
  state: RegistrationState;
  reason?: string;
  detail?: any;
  error?: NormalizedError | null;
  timestamp: number;
  raw?: any;
}

export interface CallEventPayload {
  state: CallState;
  direction?: 'incoming' | 'outgoing';
  number?: string;
  reason?: string;
  error?: NormalizedError | null;
  detail?: any;
  timestamp: number;
  raw?: any;
}

export interface MessageEventPayload {
  event: MessageEvent;
  payload: MessagePayload;
  error?: NormalizedError | null;
  timestamp: number;
  raw?: any;
}

export interface AudioRouteEventPayload {
  route: AudioRouteState;
  reason?: string;
  timestamp: number;
  raw?: any;
}

export interface DeviceChangeEventPayload {
  devices: DeviceDescriptor[];
  active?: DeviceDescriptor | null;
  timestamp: number;
  raw?: any;
}

export interface ConnectivityEventPayload {
  status: ConnectivityStatus;
  networkType?: string;
  strength?: number;
  detail?: any;
  error?: NormalizedError | null;
  timestamp: number;
  raw?: any;
}

export interface EventPayloadMap {
  registration: RegistrationEventPayload;
  call: CallEventPayload;
  message: MessageEventPayload;
  audioRoute: AudioRouteEventPayload;
  deviceChange: DeviceChangeEventPayload;
  connectivity: ConnectivityEventPayload;
}

export type CoreEventName = keyof EventPayloadMap;

export type EventHandler<K extends CoreEventName> = (payload: EventPayloadMap[K]) => void;

export interface EventBusOptions {
  debounce?: Partial<Record<CoreEventName, number>>;
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, any>) => void;
}

interface InternalListener<K extends CoreEventName> {
  callback: EventHandler<K>;
  once: boolean;
}

interface QueuedEvent<K extends CoreEventName> {
  event: K;
  payload: EventPayloadMap[K];
  timestamp: number;
}

export const SUPPORTED_EVENTS: CoreEventName[] = [
  'registration',
  'call',
  'message',
  'audioRoute',
  'deviceChange',
  'connectivity'
];

function safeClone<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function payloadHash(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

export class EventBus {
  private readonly listeners = new Map<CoreEventName, Map<EventHandler<any>, InternalListener<any>>>();

  private readonly queue: QueuedEvent<CoreEventName>[] = [];

  private readonly pending: QueuedEvent<CoreEventName>[] = [];

  private readonly debounceState = new Map<CoreEventName, { hash: string; timestamp: number }>();

  private isDispatching = false;

  private ready = false;

  constructor(private readonly options: EventBusOptions = {}) {
    SUPPORTED_EVENTS.forEach((event) => {
      this.listeners.set(event, new Map());
    });
  }

  public isReady(): boolean {
    return this.ready;
  }

  public setReady(ready: boolean): void {
    if (this.ready === ready) {
      return;
    }
    this.ready = ready;
    if (ready) {
      this.flushQueue();
    }
  }

  public on<K extends CoreEventName>(event: K, handler: EventHandler<K>): void {
    if (!handler) {
      return;
    }
    const registry = this.listeners.get(event);
    if (!registry) {
      return;
    }
    registry.set(handler, { callback: handler, once: false });
  }

  public once<K extends CoreEventName>(event: K, handler: EventHandler<K>): void {
    if (!handler) {
      return;
    }
    const registry = this.listeners.get(event);
    if (!registry) {
      return;
    }
    const wrapped: InternalListener<K> = {
      once: true,
      callback: (payload) => {
        try {
          handler(payload);
        } finally {
          registry.delete(handler);
        }
      }
    };
    registry.set(handler, wrapped);
  }

  public off<K extends CoreEventName>(event: K, handler: EventHandler<K>): void {
    const registry = this.listeners.get(event);
    if (!registry || !handler) {
      return;
    }
    registry.delete(handler);
  }

  public emit<K extends CoreEventName>(event: K, payload: EventPayloadMap[K]): void {
    const normalizedPayload = this.withTimestamp(payload);
    if (this.shouldDebounce(event, normalizedPayload)) {
      this.log('debug', `debounced event: ${event}`);
      return;
    }
    if (!this.ready) {
      this.queue.push({ event, payload: safeClone(normalizedPayload), timestamp: Date.now() });
      return;
    }
    this.dispatch(event, normalizedPayload);
  }

  public removeAll(event?: CoreEventName): void {
    if (event) {
      const registry = this.listeners.get(event);
      registry?.clear();
      return;
    }
    this.listeners.forEach((registry) => registry.clear());
  }

  private withTimestamp<K extends CoreEventName>(payload: EventPayloadMap[K]): EventPayloadMap[K] {
    if (typeof payload !== 'object' || payload === null) {
      return payload;
    }
    if ('timestamp' in payload && typeof payload.timestamp === 'number') {
      return payload;
    }
    return { ...payload, timestamp: Date.now() } as EventPayloadMap[K];
  }

  private flushQueue(): void {
    if (this.queue.length === 0) {
      return;
    }
    const items = this.queue.splice(0, this.queue.length);
    items.forEach((item) => {
      this.dispatch(item.event, item.payload);
    });
  }

  private dispatch<K extends CoreEventName>(event: K, payload: EventPayloadMap[K]): void {
    if (this.isDispatching) {
      this.pending.push({ event, payload: safeClone(payload), timestamp: Date.now() });
      return;
    }
    const registry = this.listeners.get(event);
    if (!registry || registry.size === 0) {
      return;
    }
    this.isDispatching = true;
    try {
      registry.forEach((listener, original) => {
        try {
          listener.callback(payload);
        } catch (error) {
          this.log('error', `event handler for ${event} threw`, { error });
        } finally {
          if (listener.once) {
            registry.delete(original);
          }
        }
      });
    } finally {
      this.isDispatching = false;
      if (this.pending.length > 0) {
        const pendingItems = this.pending.splice(0, this.pending.length);
        pendingItems.forEach((item) => {
          this.dispatch(item.event, item.payload);
        });
      }
    }
  }

  private shouldDebounce<K extends CoreEventName>(event: K, payload: EventPayloadMap[K]): boolean {
    const debounceWindow = this.options.debounce?.[event];
    if (!debounceWindow || debounceWindow <= 0) {
      return false;
    }
    const hash = payloadHash(payload);
    const previous = this.debounceState.get(event);
    const now = Date.now();
    if (previous && previous.hash === hash && now - previous.timestamp <= debounceWindow) {
      return true;
    }
    this.debounceState.set(event, { hash, timestamp: now });
    return false;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, any>): void {
    if (!this.options.logger) {
      return;
    }
    try {
      this.options.logger(level, message, context);
    } catch (_) {
      // ignore logging failures
    }
  }
}
