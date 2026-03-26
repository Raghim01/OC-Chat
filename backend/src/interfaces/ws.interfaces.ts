export const PROTOCOL_VERSION = 3 as const;

export type GatewayScope =
  | 'operator.read'
  | 'operator.write'
  | 'operator.admin';

// ─── Base frames ──────────────────────────────────────────────────────────────

export interface ResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string; details?: { requestId?: string } };
}

export interface ReqFrame {
  type: 'req';
  id: string;
  method: string;
  params: unknown;
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
}

export type GatewayFrame = ResFrame | ReqFrame | EventFrame;

// ─── Connect ──────────────────────────────────────────────────────────────────

export interface ConnectRequest {
  type: 'req';
  id: string;
  method: 'connect';
  params: {
    minProtocol: typeof PROTOCOL_VERSION;
    maxProtocol: typeof PROTOCOL_VERSION;
    client: {
      id: string;
      version: string;
      platform: string;
      mode: 'cli';
      deviceFamily?: string;
    };
    role: 'operator';
    scopes: GatewayScope[];
    auth: { token: string | undefined; deviceToken?: string };
    device?: {
      id: string;
      publicKey: string;
      signature: string;
      signedAt: number;
      nonce: string;
    };
  };
}

// ─── Challenge ────────────────────────────────────────────────────────────────

export interface ChallengePayload {
  nonce: string;
  ts: number;
}

export interface ChallengeEventFrame {
  type: 'event';
  event: 'connect.challenge';
  payload: ChallengePayload;
}

// ─── Hello OK ─────────────────────────────────────────────────────────────────

export interface HelloOkPayload {
  type: 'hello-ok';
  protocol: typeof PROTOCOL_VERSION;
}

// ─── Chat event ───────────────────────────────────────────────────────────────

export interface ChatEventPayload {
  final?: boolean;
  state: string;
  message: { content?: { type: string; text: string }[] };
}

export interface ChatEventFrame {
  type: 'event';
  event: 'chat';
  payload: ChatEventPayload;
}

// ─── Chat request ─────────────────────────────────────────────────────────────

export interface ChatRequest {
  type: 'req';
  id: string;
  method: 'chat.send';
  params: { message: string; sessionKey: string; idempotencyKey: string };
}

// ─── Chat history ─────────────────────────────────────────────────────────────

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: { type: 'text' | 'thinking'; text?: string }[];
  timestamp: number;
  senderLabel?: string;
}

export interface ChatHistoryPayload {
  messages: HistoryMessage[];
}

export interface ChatHistoryRequest {
  type: 'req';
  id: string;
  method: 'chat.history';
  params: { sessionKey: string; limit: number };
}
