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
}

export type RegistrationHandler = (state: RegistrationState, detail?: any) => void;
export type CallHandler = (state: CallState, detail?: any) => void;
export type MessageHandler = (event: MessageEvent, payload: MessagePayload) => void;
export type AudioRouteHandler = (route: AudioRouteState) => void;

/**
 * Initializes the telephony stack with SIP credentials.
 */
export declare function init(config: SipConfig): Promise<void>;

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

export declare function onRegistration(handler: RegistrationHandler): void;
export declare function offRegistration(handler: RegistrationHandler): void;

export declare function onCall(handler: CallHandler): void;
export declare function offCall(handler: CallHandler): void;

export declare function onMessage(handler: MessageHandler): void;
export declare function offMessage(handler: MessageHandler): void;

export declare function onAudioRouteChanged(handler: AudioRouteHandler): void;
export declare function offAudioRouteChanged(handler: AudioRouteHandler): void;
