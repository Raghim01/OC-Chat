import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import WebSocket from 'ws';
import { KeyObject, randomUUID } from 'crypto';
import {
  ChallengeEventFrame,
  ChallengePayload,
  ChatEventFrame,
  ChatHistoryPayload,
  ChatHistoryRequest,
  ChatRequest,
  ConnectRequest,
  GatewayFrame,
  HelloOkPayload,
  HistoryMessage,
  ResFrame,
} from './interfaces/ws.interfaces';
import { exec } from 'child_process';
import { promisify } from 'util';
import { deriveKeyPair, deriveDeviceId } from './utils/crypto';
import { buildConnectRequest } from './utils/auth';

const execAsync = promisify(exec);

@Injectable()
export class OpenClawService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenClawService.name);
  private readonly keyPair: { privateKey: KeyObject; publicKey: KeyObject };
  private readonly deviceId: string;
  private ws: WebSocket | null = null;
  private authenticated = false;
  private destroyed = false;
  private readonly sessions = new Map<string, (data: object) => void>();
  private readonly pendingRequests = new Map<
    string,
    (data: HistoryMessage[]) => void
  >();

  constructor() {
    const secret = process.env.DEVICE_SECRET;
    if (!secret) {
      this.logger.warn(
        'DEVICE_SECRET is not set — device identity will change on every restart',
      );
    }
    this.keyPair = deriveKeyPair(secret);
    this.deviceId = deriveDeviceId(this.keyPair.publicKey);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.ws?.close();
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  private connect(): void {
    const url = process.env.OPENCLAW_WS_URL;
    if (!url) {
      this.logger.error('OPENCLAW_WS_URL is not set — connection skipped');
      return;
    }

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.logger.log('OpenClaw WS open — awaiting connect.challenge');
    });

    this.ws.on('message', (raw) => {
      const message =
        typeof raw === 'string'
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString('utf-8')
            : null;

      if (!message) return;

      let frame: GatewayFrame;
      try {
        frame = JSON.parse(message) as GatewayFrame;
      } catch {
        this.logger.error(`Invalid JSON received: ${message}`);
        return;
      }

      this.handleFrame(frame);
    });

    this.ws.on('close', (code, reason) => {
      this.authenticated = false;
      this.logger.warn(
        `OpenClaw WS closed [${code}]: ${reason.toString() || '(no reason)'}`,
      );
      this.emitToAllSessions({ status: 'connecting' });
    });

    this.ws.on('error', (err) => {
      this.logger.error(`OpenClaw WS error: ${err.message}`);
    });
  }

  // ── Frame handling ─────────────────────────────────────────────────────────

  private handleFrame(frame: GatewayFrame): void {
    if (frame.type === 'res') {
      this.handleConnectionFrame(frame);
    } else if (frame.type === 'event') {
      const eventName = (frame as { event: string }).event;
      if (eventName === 'connect.challenge') this.handleConnectionFrame(frame);
      else if (eventName === 'chat') this.handleChatFrame(frame as unknown as ChatEventFrame);
    }
  }

  private handleConnectionFrame(frame: GatewayFrame): void {
    if (frame.type === 'event') {
      this.handleChallenge((frame as unknown as ChallengeEventFrame).payload);
      return;
    }

    if ((frame as ResFrame).ok === true) {
      const payload = (frame as ResFrame).payload;

      const helloOk = payload as unknown as HelloOkPayload;
      if (helloOk?.type === 'hello-ok') {
        this.authenticated = true;
        this.logger.log(
          `OpenClaw authenticated (protocol v${helloOk.protocol})`,
        );
        this.emitToAllSessions({ status: 'connected' });
        return;
      }

      const res = frame as ResFrame;
      if (this.pendingRequests.has(res.id)) {
        const resolve = this.pendingRequests.get(res.id)!;
        this.pendingRequests.delete(res.id);
        resolve((res.payload as unknown as ChatHistoryPayload).messages);
        return;
      }

      return;
    }

    if ((frame as ResFrame).ok === false) {
      const errFrame = frame as ResFrame;
      if (
        errFrame.error?.code === 'NOT_PAIRED' ||
        errFrame.error?.code === 'PAIRING_REQUIRED'
      ) {
        const requestId = errFrame.error.details?.requestId;
        if (requestId) {
          void this.approveAndReconnect(requestId);
        } else {
          this.logger.error(
            'Pairing required but no requestId in error details',
          );
        }
      }
    }
  }

  private handleChatFrame(frame: ChatEventFrame): void {
    const content = frame.payload?.message?.content?.[0]?.text ?? '';
    const isFinal =
      frame.payload?.final === true || frame.payload?.state === 'final';

    this.logger.log(`[stream] chunk="${content}" final=${isFinal}`);
    this.emitToAllSessions({ content, final: isFinal });
  }

  private emitToAllSessions(data: object): void {
    for (const emit of this.sessions.values()) {
      emit(data);
    }
  }

  private handleChallenge(payload: ChallengePayload): void {
    const { nonce } = payload;
    if (!nonce) {
      this.logger.error(
        'connect.challenge received without nonce — cannot authenticate',
      );
      return;
    }

    this.logger.log(`Received challenge nonce: ${nonce}`);
    this.sendRaw(
      buildConnectRequest({
        deviceId: this.deviceId,
        keyPair: this.keyPair,
        nonce,
      }),
    );
    this.logger.log('Sent connect request');
  }

  private async approveAndReconnect(requestId: string): Promise<void> {
    this.logger.log(`Pairing required — approving device request ${requestId}`);
    try {
      await this.approveDevice(requestId);
      this.logger.log('Device approved — reconnecting');
    } catch (err) {
      this.logger.error(`Failed to approve device: ${(err as Error).message}`);
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    if (!this.destroyed) this.connect();
  }

  private async approveDevice(requestId: string): Promise<string> {
    const container = process.env.OPENCLAW_CONTAINER ?? 'openclaw-gateway';
    const { stdout } = await execAsync(
      `docker exec ${container} openclaw devices approve ${requestId}`,
    );
    return stdout;
  }

  // ── Internal send ──────────────────────────────────────────────────────────

  private send(frame: GatewayFrame): void {
    if (!this.authenticated) {
      this.logger.error('Cannot send — not yet authenticated with OpenClaw');
      return;
    }
    this.sendRaw(frame);
  }

  private sendRaw(frame: GatewayFrame | ConnectRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.error('Cannot send — OpenClaw WS is not open');
      return;
    }
    this.ws.send(JSON.stringify(frame));
  }

  private getSessionKey(): string {
    const agentData = process.env.OPENROUTER_MODEL?.split('/') ?? [
      '',
      'main',
      'assistant',
    ];
    return `agent:${agentData[1]}:${agentData[2]}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getStatus(): { connected: boolean; url: string | undefined } {
    return {
      connected: this.authenticated,
      url: process.env.OPENCLAW_WS_URL,
    };
  }

  registerSession(sessionId: string, emit: (data: object) => void): () => void {
    this.sessions.set(sessionId, emit);
    this.logger.log(`[session] registered sessionId=${sessionId}`);
    emit({ status: this.authenticated ? 'connected' : 'connecting' });
    return () => {
      this.sessions.delete(sessionId);
      this.logger.log(`[session] unregistered sessionId=${sessionId}`);
    };
  }

  sendMessageStream(message: string, sessionId: string): boolean {
    if (!this.sessions.has(sessionId)) {
      this.logger.error(`[stream] no session for sessionId=${sessionId}`);
      return false;
    }

    const req: ChatRequest = {
      type: 'req',
      id: randomUUID(),
      method: 'chat.send',
      params: {
        message,
        sessionKey: this.getSessionKey(),
        idempotencyKey: randomUUID(),
      },
    };

    this.send(req);
    return true;
  }

  getHistory(limit = 50): Promise<HistoryMessage[]> {
    return new Promise((resolve) => {
      const id = randomUUID();
      this.pendingRequests.set(id, resolve);

      const req: ChatHistoryRequest = {
        type: 'req',
        id,
        method: 'chat.history',
        params: { sessionKey: this.getSessionKey(), limit },
      };
      this.send(req);
    });
  }
}
