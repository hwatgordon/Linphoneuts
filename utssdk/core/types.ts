export type TransportKind = 'udp' | 'tcp' | 'tls';

export type RegistrationState = 'none' | 'progress' | 'ok' | 'failed';

export type CallState = 'incoming' | 'outgoing' | 'connected' | 'ended' | 'error';

export type MessageEvent = 'received' | 'sent' | 'failed';

export type AudioRoute = 'system' | 'earpiece' | 'speaker' | 'bluetooth';

export type AudioRouteState = 'system' | 'earpiece' | 'speaker' | 'bluetooth' | 'unknown';

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
