/**
 * TypeScript declaration file for the unified UTS VoIP API.
 */

export type TransportKind = 'udp' | 'tcp' | 'tls';

export type RegistrationState = 'none' | 'progress' | 'ok' | 'failed';

export type CallState = 'incoming' | 'outgoing' | 'connected' | 'ended' | 'error';

export type MessageEvent = 'received' | 'sent' | 'failed';

export type AudioRoute = 'system' | 'earpiece' | 'speaker' | 'bluetooth';

export type AudioRouteState = 'earpiece' | 'speaker' | 'bluetooth' | 'unknown';

export interface SipConfig {
  sipServer: string;
  username: string;
  password: string;
  transport?: TransportKind;
  displayName?: string;
}

export interface MessagePayload {
  from?: string;
  to?: string;
  text: string;
}

export interface NormalizedError {
  code: string;
  message: string;
  detail?: any;
}

export interface DeviceDescriptor {
  id: string;
  label: string;
  type: 'audio-input' | 'audio-output' | 'other' | string;
  isDefault?: boolean;
  isConnected?: boolean;
}

export type ConnectivityStatus = 'unknown' | 'offline' | 'online' | 'degraded';

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

export declare class EventBus {
  constructor(options?: any);
  isReady(): boolean;
  setReady(ready: boolean): void;
  on<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  once<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  off<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  emit<K extends CoreEventName>(event: K, payload: EventPayloadMap[K]): void;
  removeAll(event?: CoreEventName): void;
}

export interface CoreServiceManager {
  init(config: SipConfig): Promise<void>;
  dispose(): Promise<void>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  dial(number: string): Promise<void>;
  hangup(): Promise<void>;
  answer(): Promise<void>;
  sendDtmf(tone: string): Promise<void>;
  sendMessage(to: string, text: string): Promise<void>;
  setAudioRoute(route: AudioRoute): Promise<void>;
  on<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  once<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  off<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  removeAll(event?: CoreEventName): void;
  emit<K extends CoreEventName>(event: K, payload: EventPayloadMap[K]): void;
  getConfig(): SipConfig | null;
  getRegistrationState(): RegistrationState;
  getEvents(): EventBus;
}

export declare const GLOBAL_SHIM_REGISTRY: string;

export declare const events: {
  isReady(): boolean;
  setReady(ready: boolean): void;
  on<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  once<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  off<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
  emit<K extends CoreEventName>(event: K, payload: EventPayloadMap[K]): void;
  removeAll(event?: CoreEventName): void;
};

/**
 * Initializes the telephony stack with SIP credentials.
 */
export declare function init(config: SipConfig): Promise<void>;

/**
 * Disposes the current telephony instance and clears resources.
 */
export declare function dispose(): Promise<void>;

/**
 * Registers the SIP account on the active platform implementation.
 */
export declare function register(): Promise<void>;

/**
 * Unregisters the SIP account from the active platform implementation.
 */
export declare function unregister(): Promise<void>;

export declare const call: {
  /**
   * Initiates an outgoing call to the specified number.
   */
  dial(number: string): Promise<void>;
  /**
   * Terminates the current call session.
   */
  hangup(): Promise<void>;
  /**
   * Answers an incoming call.
   */
  answer(): Promise<void>;
  /**
   * Sends a DTMF tone during an active call.
   */
  sendDtmf(tone: string): Promise<void>;
};

export declare const message: {
  /**
   * Sends an instant message using the underlying SIP stack.
   */
  send(to: string, text: string): Promise<void>;
};

export declare const audio: {
  /**
   * Sets the audio route preference. When set to `system`, the OS default routing is restored.
   */
  setRoute(route: AudioRoute): Promise<void>;
};

export declare function on<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
export declare function once<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
export declare function off<K extends CoreEventName>(event: K, handler: EventHandler<K>): void;
export declare function removeAll(event?: CoreEventName): void;
export declare function emit<K extends CoreEventName>(event: K, payload: EventPayloadMap[K]): void;

export type RegistrationListener = (state: RegistrationState, detail?: any, error?: NormalizedError | null) => void;
export type CallListener = (state: CallState, detail?: any, error?: NormalizedError | null) => void;
export type MessageListener = (event: MessageEvent, payload: MessagePayload, error?: NormalizedError | null) => void;
export type AudioRouteListener = (route: AudioRouteState, reason?: string) => void;
export type DeviceChangeListener = (payload: DeviceChangeEventPayload) => void;
export type ConnectivityListener = (payload: ConnectivityEventPayload) => void;

export declare function onRegistration(handler: RegistrationListener): void;
export declare function offRegistration(handler: RegistrationListener): void;

export declare function onCall(handler: CallListener): void;
export declare function offCall(handler: CallListener): void;

export declare function onMessage(handler: MessageListener): void;
export declare function offMessage(handler: MessageListener): void;

export declare function onAudioRouteChanged(handler: AudioRouteListener): void;
export declare function offAudioRouteChanged(handler: AudioRouteListener): void;

export declare function onDeviceChange(handler: DeviceChangeListener): void;
export declare function offDeviceChange(handler: DeviceChangeListener): void;

export declare function onConnectivity(handler: ConnectivityListener): void;
export declare function offConnectivity(handler: ConnectivityListener): void;

export declare const coreService: CoreServiceManager;

export default coreService;
