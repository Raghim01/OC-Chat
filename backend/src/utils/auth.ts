import { KeyObject, randomUUID, sign } from 'crypto';
import {
  ConnectRequest,
  GatewayScope,
  PROTOCOL_VERSION,
} from '../interfaces/ws.interfaces';
import { toBase64Url } from './encoding';

export function buildConnectRequest(params: {
  deviceId: string;
  keyPair: { privateKey: KeyObject; publicKey: KeyObject };
  nonce: string;
}): ConnectRequest {
  const { deviceId, keyPair, nonce } = params;

  const spki = keyPair.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
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

  const payload = [
    'v3', deviceId, clientId, clientMode, role,
    scopes, signedAt, token, nonce, platform, deviceFamily,
  ].join('|');

  const signature = toBase64Url(
    sign(null, Buffer.from(payload, 'utf-8'), keyPair.privateKey),
  );

  return {
    type: 'req',
    id: randomUUID(),
    method: 'connect',
    params: {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: { id: clientId, version: 'dev', platform, mode: clientMode, deviceFamily },
      role,
      scopes: scopes.split(',') as GatewayScope[],
      auth: { token },
      device: { id: deviceId, publicKey, signature, signedAt, nonce },
    },
  };
}
