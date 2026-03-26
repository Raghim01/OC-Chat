// ─── Protocol constants ───────────────────────────────────────────────────────

export const PROTOCOL_VERSION = 3 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

// ─── Roles & scopes ───────────────────────────────────────────────────────────

export type GatewayRole = 'operator';

export type GatewayScope =
  | 'operator.read'
  | 'operator.write'
  | 'operator.admin';

export type GatewayClientMode = 'cli';

// ─── Auth error codes ─────────────────────────────────────────────────────────

export type AuthErrorCode =
  | 'AUTH_TOKEN_MISSING'
  | 'AUTH_TOKEN_MISMATCH'
  | 'AUTH_DEVICE_TOKEN_MISMATCH'
  | 'NOT_PAIRED'
  | 'PAIRING_REQUIRED'
  | 'DEVICE_AUTH_NONCE_REQUIRED'
  | 'DEVICE_AUTH_SIGNATURE_INVALID'
  | 'DEVICE_AUTH_DEVICE_ID_MISMATCH';

export interface AuthErrorDetails {
  code?: string;
  requestId?: string;
  reason?: string;
}

// ─── Base frames ──────────────────────────────────────────────────────────────

export interface BaseFrame {
  type: 'req' | 'res' | 'event';
}

export interface ReqFrame<
  TMethod extends string = string,
  TParams = unknown,
> extends BaseFrame {
  type: 'req';
  id: string;
  method: string;
  params: TParams;
}

export interface ResFrame<
  TPayload = Record<string, unknown>,
> extends BaseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: TPayload;
  error?: { code: AuthErrorCode; message: string; details?: AuthErrorDetails };
}

export interface EventFrame<
  TEvent extends string = string,
  TPayload = Record<string, unknown>,
> extends BaseFrame {
  type: 'event';
  event: TEvent;
  payload: TPayload;
  seq?: number;
  stateVersion?: number;
}

// ─── Connect request ──────────────────────────────────────────────────────────

export interface ConnectClientInfo {
  id: string;
  version: string;
  platform: string;
  mode: GatewayClientMode;
  deviceFamily?: string;
}

export interface ConnectAuthInfo {
  token: string | undefined;
  deviceToken?: string;
}

/** Minimal device info when dangerouslyDisableDeviceAuth is enabled. */
export interface ConnectDeviceInfo {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
}

export interface ConnectParams {
  minProtocol: ProtocolVersion;
  maxProtocol: ProtocolVersion;
  client: ConnectClientInfo;
  role: GatewayRole;
  scopes: GatewayScope[];
  auth: ConnectAuthInfo;
  device?: ConnectDeviceInfo;
}

export type ConnectRequest = ReqFrame<'connect', ConnectParams>;

// ─── Connect response (hello-ok) ──────────────────────────────────────────────

export interface HelloOkPayload {
  type: 'hello-ok';
  protocol: ProtocolVersion;
  policy: { tickIntervalMs: number };
  auth: { deviceToken: string };
}

export type ConnectResponse = ResFrame<HelloOkPayload>;

// ─── Event payloads ───────────────────────────────────────────────────────────

export interface ChallengePayload {
  nonce: string;
  ts: number;
}

export interface ChatEventPayload {
  sessionKey: string;
  role: 'assistant' | 'user';
  content: string;
  state: string;
  delta?: boolean;
  final?: boolean;
  message: {
    content?: { type: 'string'; text: string }[];
  };
}

// ─── Typed event frames ───────────────────────────────────────────────────────

export type ChallengeEventFrame = EventFrame<
  'connect.challenge',
  ChallengePayload
>;
export type ChatEventFrame = EventFrame<'chat', ChatEventPayload>;

// ─── Chat request ─────────────────────────────────────────────────────────────

export interface ChatRequestParams {
  message: string;
  sessionKey: string;
  idempotencyKey: string;
}

export type ChatRequest = ReqFrame<'chat', ChatRequestParams>;

// ─── Chat history ─────────────────────────────────────────────────────────────

export interface ChatHistoryParams {
  sessionKey: string;
  limit: number;
}

export interface HistoryContentItem {
  type: 'text' | 'thinking';
  text?: string;
  thinking?: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: HistoryContentItem[];
  timestamp: number;
  senderLabel?: string;
}

export interface ChatHistoryPayload {
  messages: HistoryMessage[];
}

export type ChatHistoryRequest = ReqFrame<'chat.history', ChatHistoryParams>;

// ─── Union of all inbound frames ─────────────────────────────────────────────

export type GatewayFrame =
  | ChallengeEventFrame
  | ChatEventFrame
  | ChatRequest
  | ChatHistoryRequest
  | ConnectResponse
  | EventFrame
  | ResFrame;
