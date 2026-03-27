import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
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
  ConfigGetRequest,
  ConfigPatchRequest,
  ConfigPayload,
  ConnectRequest,
  EventFrame,
  GatewayFrame,
  HelloOkPayload,
  HistoryMessage,
  ResFrame,
} from '../interfaces/ws.interfaces';
import { exec } from 'child_process';
import { promisify } from 'util';
import { deriveKeyPair, deriveDeviceId } from '../utils/crypto';
import { buildConnectRequest } from '../utils/auth';

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
    { resolve: (data: unknown) => void; reject: (err: Error) => void }
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
    const url = process.env.OPENCLAW_WS_URL || 'ws://openclaw-gateway:18789';

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

      this.rejectAllPending('Connection closed');

      this.emitToAllSessions({ status: 'connecting' });

      if (!this.destroyed) {
        this.logger.log('Reconnecting in 3s…');
        setTimeout(() => {
          if (!this.destroyed) this.connect();
        }, 3000);
      }
    });

    this.ws.on('error', (err) => {
      this.logger.error(`OpenClaw WS error: ${err.message}`);
      this.emitToAllSessions({ error: `Gateway error: ${err.message}` });
    });
  }

  // ── Frame handling ─────────────────────────────────────────────────────────

  private handleFrame(frame: GatewayFrame): void {
    if (frame.type === 'res') {
      this.handleConnectionFrame(frame);
    } else if (frame.type === 'event') {
      const eventName = (frame as { event: string }).event;

      if (eventName === 'connect.challenge') this.handleConnectionFrame(frame);
      if (eventName === 'health') this.handleHealthFrame(frame);
      if (eventName === 'chat')
        this.handleChatFrame(frame as unknown as ChatEventFrame);
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
        const entry = this.pendingRequests.get(res.id)!;
        this.pendingRequests.delete(res.id);
        entry.resolve(res.payload);
        return;
      }

      return;
    }

    if ((frame as ResFrame).ok === false) {
      const errFrame = frame as ResFrame;

      if (this.pendingRequests.has(errFrame.id)) {
        const entry = this.pendingRequests.get(errFrame.id)!;
        this.pendingRequests.delete(errFrame.id);
        entry.reject(new Error(errFrame.error?.message ?? 'Request failed'));
        return;
      }

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

  private handleHealthFrame(frame: GatewayFrame): void {
    const ok = (frame as EventFrame).payload.ok;
    if (!ok) {
      this.logger.warn('OpenClaw gateway reported unhealthy');
    }
  }

  private handleChatFrame(frame: ChatEventFrame): void {
    if (frame.payload?.state === 'error') {
      const errorMessage = frame.payload.errorMessage ?? 'Unknown error';
      this.logger.error(`[stream] error: ${errorMessage}`);
      this.emitToAllSessions({ error: errorMessage, final: true });
      return;
    }

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

  private rejectAllPending(message: string): void {
    for (const entry of this.pendingRequests.values()) {
      entry.reject(new Error(message));
    }
    this.pendingRequests.clear();
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
    try {
      this.sendRaw(
        buildConnectRequest({
          deviceId: this.deviceId,
          keyPair: this.keyPair,
          nonce,
        }),
      );
      this.logger.log('Sent connect request');
    } catch (err) {
      this.logger.error(
        `Failed to send connect request: ${(err as Error).message}`,
      );
    }
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

  // ── Public API ─────────────────────────────────────────────────────────────

  getStatus(): { connected: boolean; url: string | undefined } {
    return {
      connected: this.authenticated,
      url: process.env.OPENCLAW_WS_URL || 'ws://openclaw-gateway:18789',
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

  async getHistory(limit = 50): Promise<HistoryMessage[]> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();

      const req: ChatHistoryRequest = {
        type: 'req',
        id,
        method: 'chat.history',
        params: { sessionKey: this.getSessionKey(), limit },
      };

      try {
        this.send(req);
      } catch (err) {
        reject(err);
        return;
      }

      this.pendingRequests.set(id, {
        resolve: (data) => resolve((data as ChatHistoryPayload).messages),
        reject,
      });
    });
  }

  async getConfig(): Promise<ConfigPayload> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();

      const req: ConfigGetRequest = {
        type: 'req',
        id,
        method: 'config.get',
        params: {} as Record<string, never>,
      };

      try {
        this.send(req as unknown as GatewayFrame);
      } catch (err) {
        reject(err);
        return;
      }

      this.pendingRequests.set(id, {
        resolve: (data) => resolve(data as ConfigPayload),
        reject,
      });
    });
  }

  async patchConfig(raw: string): Promise<ConfigPayload> {
    const { hash: baseHash } = await this.getConfig();

    return new Promise((resolve, reject) => {
      const id = randomUUID();

      const req: ConfigPatchRequest = {
        type: 'req',
        id,
        method: 'config.patch',
        params: { raw, baseHash },
      };

      try {
        this.send(req as unknown as GatewayFrame);
      } catch (err) {
        reject(err);
        return;
      }

      this.pendingRequests.set(id, {
        resolve: (data) => resolve(data as ConfigPayload),
        reject,
      });
    });
  }

  // ── Internal send ──────────────────────────────────────────────────────────

  private send(frame: GatewayFrame): void {
    if (!this.authenticated) {
      throw new ServiceUnavailableException('OpenClaw not authenticated');
    }
    this.sendRaw(frame);
  }

  private sendRaw(frame: GatewayFrame | ConnectRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new ServiceUnavailableException('OpenClaw WS is not open');
    }
    this.ws.send(JSON.stringify(frame));
  }

  private getSessionKey(): string {
    const envAgentData = process.env.OPENROUTER_MODEL?.split('/');
    const sessionKey = envAgentData
      ? `agent:${envAgentData[1]}:${envAgentData[2]}`
      : 'agent:main:id';

    return sessionKey;
  }
}
