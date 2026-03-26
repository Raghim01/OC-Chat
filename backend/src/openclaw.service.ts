import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import WebSocket from 'ws';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  randomUUID,
  sign,
} from 'crypto';
import {
  ChallengeEventFrame,
  ChallengePayload,
  ChatEventFrame,
  ChatRequest,
  ConnectRequest,
  GatewayFrame,
  GatewayScope,
  HelloOkPayload,
  PROTOCOL_VERSION,
  ResFrame,
} from './interfaces/ws.interfaces';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
// ─── Persisted identity ───────────────────────────────────────────────────────

interface PersistedIdentity {
  privateKeyPem: string;
  publicKeyPem: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type MessageHandler = (event: string, frame: GatewayFrame) => void;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class OpenClawService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenClawService.name);
  private readonly keyPair: { privateKey: KeyObject; publicKey: KeyObject };
  private readonly deviceId: string;
  private readonly rawPubKey: Buffer;
  private deviceToken: string | null = null;
  private ws: WebSocket | null = null;
  private authenticated = false;
  private destroyed = false;
  private readonly messageHandlers: MessageHandler[] = [];

  constructor() {
    this.keyPair = this.deriveKeyPair();
    const jwk = this.keyPair.publicKey.export({ format: 'jwk' }) as {
      x: string;
    };
    this.rawPubKey = Buffer.from(jwk.x, 'base64url');
    this.deviceId = createHash('sha256').update(this.rawPubKey).digest('hex');
  }

  // ── Identity ───────────────────────────────────────────────────────────────

  private deriveKeyPair(): { privateKey: KeyObject; publicKey: KeyObject } {
    const secret = process.env.DEVICE_SECRET;
    if (!secret) {
      this.logger.warn(
        'DEVICE_SECRET is not set — device identity will change on every restart',
      );
      return generateKeyPairSync('ed25519');
    }

    // Derive a stable 32-byte seed from the secret, wrap it in a PKCS#8 DER
    // envelope (fixed 16-byte header for Ed25519), then import as a private key.
    const seed = createHash('sha256').update(secret).digest();
    const der = Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      seed,
    ]);
    const privateKey = createPrivateKey({
      key: der,
      format: 'der',
      type: 'pkcs8',
    });
    return { privateKey, publicKey: createPublicKey(privateKey) };
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
    });

    this.ws.on('error', (err) => {
      this.logger.error(`OpenClaw WS error: ${err.message}`);
      // 'error' is always followed by 'close', so reconnect is handled there
    });
  }
  // ── Frame handling ─────────────────────────────────────────────────────────

  private handleFrame(frame: GatewayFrame): void {
    if (
      frame.type === 'event' &&
      (frame as ChallengeEventFrame).event === 'connect.challenge'
    ) {
      this.handleChallenge((frame as ChallengeEventFrame).payload);
      return;
    }

    if (frame.type === 'res' && (frame as ResFrame).ok === true) {
      const payload = (frame as ResFrame<HelloOkPayload>).payload;
      if (payload?.type === 'hello-ok') {
        this.authenticated = true;
        this.logger.log(
          `OpenClaw authenticated (protocol v${payload.protocol})`,
        );
      }
    }

    if (frame.type === 'res' && (frame as ResFrame).ok === false) {
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
        return;
      }
    }

    const eventName =
      frame.type === 'event'
        ? (frame as ChallengeEventFrame).event
        : frame.type;

    for (const handler of this.messageHandlers) {
      handler(eventName, frame);
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

    const connectReq = this.buildConnectRequest(nonce);

    this.sendRaw(connectReq);
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

    // The gateway closes the WS after NOT_PAIRED; wait for it to settle
    // before opening a new connection.
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    if (!this.destroyed) {
      this.connect();
    }
  }

  private async approveDevice(requestId: string): Promise<string> {
    const container = process.env.OPENCLAW_CONTAINER ?? 'openclaw-gateway';

    const { stdout } = await execAsync(
      `docker exec ${container} openclaw devices approve ${requestId}`,
    );

    return stdout;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Send a typed frame to OpenClaw. Requires active authentication. */
  send(frame: GatewayFrame): void {
    if (!this.authenticated) {
      this.logger.error('Cannot send — not yet authenticated with OpenClaw');
      return;
    }

    this.sendRaw(frame);
  }

  /** Send without the auth guard — used internally for the handshake. */
  private sendRaw(frame: GatewayFrame | ConnectRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.error('Cannot send — OpenClaw WS is not open');
      return;
    }

    this.ws.send(JSON.stringify(frame));
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  getStatus(): { connected: boolean; url: string | undefined } {
    return {
      connected: this.authenticated,
      url: process.env.OPENCLAW_WS_URL,
    };
  }

  sendMessage(message: string, timeoutMs = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
      let accumulated = '';

      const cleanup = () => {
        const idx = this.messageHandlers.indexOf(handler);
        if (idx !== -1) this.messageHandlers.splice(idx, 1);
      };

      const timer = setTimeout(() => {
        cleanup();
        // reject(new Error('OpenClaw response timed out'));
      }, timeoutMs);

      const handler: MessageHandler = (event, frame) => {
        if (event !== 'chat') return;

        const { payload } = frame as ChatEventFrame;
        accumulated += payload.content ?? '';

        if (payload.final) {
          clearTimeout(timer);
          cleanup();
          resolve(accumulated);
        }
      };

      this.messageHandlers.push(handler);

      const req: ChatRequest = {
        type: 'req',
        id: randomUUID(),
        method: 'chat.send',
        params: {
          message,
          sessionKey: 'agent:aizasybfnu_7lyogd9ffeely8xugushbskquyi:id',
          idempotencyKey: randomUUID(),
        },
      };

      this.send(req);
    });
  }

  async sendMessageStream(
    message: string,
    onChunk: (content: string, final: boolean) => void,
    timeoutMs = 30_000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullResponse = '';

      const cleanup = () => {
        const idx = this.messageHandlers.indexOf(handler);
        if (idx !== -1) this.messageHandlers.splice(idx, 1);
        clearTimeout(timer);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('OpenClaw response timed out'));
      }, timeoutMs);

      const handler: MessageHandler = (event, frame) => {
        if (event !== 'chat') return;

        const payload = (frame as ChatEventFrame).payload;

        console.log(payload.message?.content);

        const content = payload?.message?.content?.[0]?.text ?? '';
        const isFinal = payload?.final === true || payload?.state === 'final';

        // ✅ aggregate
        if (content) {
          fullResponse += content;
        }

        // ✅ log
        this.logger.log(`[stream] chunk="${content}" final=${isFinal}`);

        // ✅ stream outward
        onChunk(content, isFinal);

        if (isFinal) {
          cleanup();
          resolve(fullResponse);
        }
      };

      this.messageHandlers.push(handler);

      const req: ChatRequest = {
        type: 'req',
        id: randomUUID(),
        method: 'chat.send',
        params: {
          message,
          sessionKey: 'agent:main:id',
          idempotencyKey: randomUUID(),
        },
      };

      this.send(req);
    });
  }

  private buildConnectRequest(nonce: string): ConnectRequest {
    const spki = this.keyPair.publicKey.export({
      format: 'der',
      type: 'spki',
    }) as Buffer;

    const rawKey = Buffer.from(spki.subarray(spki.length - 32));
    const publicKey = toBase64Url(rawKey);

    const signedAt = Date.now();
    const token = process.env.AUTH_TOKEN ?? '';
    const clientId = 'cli';
    const clientMode = 'cli';
    const role = 'operator';
    const scopes = 'operator.read,operator.write,operator.admin';
    const platform = 'node';
    const deviceFamily = 'server';

    // v3 payload: adds platform and deviceFamily after nonce
    const payload = [
      'v3',
      this.deviceId,
      clientId,
      clientMode,
      role,
      scopes,
      signedAt,
      token,
      nonce,
      platform,
      deviceFamily,
    ].join('|');

    const signature = toBase64Url(
      sign(null, Buffer.from(payload, 'utf-8'), this.keyPair.privateKey),
    );

    return {
      type: 'req',
      id: randomUUID(),
      method: 'connect',
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: clientId,
          version: 'dev',
          platform,
          mode: clientMode,
          deviceFamily,
        },
        role,
        scopes: scopes.split(',') as GatewayScope[],
        auth: { token },
        device: {
          id: this.deviceId,
          publicKey,
          signature,
          signedAt,
          nonce,
        },
      },
    };
  }
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
