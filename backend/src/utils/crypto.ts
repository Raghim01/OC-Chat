import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
} from 'crypto';

export function deriveKeyPair(
  secret?: string,
): { privateKey: KeyObject; publicKey: KeyObject } {
  if (!secret) {
    return generateKeyPairSync('ed25519');
  }

  const seed = createHash('sha256').update(secret).digest();
  const der = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed,
  ]);
  const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  return { privateKey, publicKey: createPublicKey(privateKey) };
}

export function deriveDeviceId(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const rawPubKey = Buffer.from(jwk.x, 'base64url');
  return createHash('sha256').update(rawPubKey).digest('hex');
}
