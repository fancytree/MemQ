import type { UpstreamSession } from './upstream.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_ENVELOPE_LENGTH = 65536;
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('Invalid envelope');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
function context(owner: string, grant: string): Uint8Array<ArrayBuffer> {
  if (!owner || !grant) throw new Error('Invalid envelope context');
  return encoder.encode(JSON.stringify(['memq-session-v1', owner, grant]));
}
async function keyFromSecret(secret: string): Promise<CryptoKey> {
  const bytes = decode(secret);
  if (bytes.byteLength !== 32) throw new Error('Invalid envelope key');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function isSession(value: unknown, owner: string): value is UpstreamSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return session.userId === owner && typeof session.accessToken === 'string' && !!session.accessToken &&
    typeof session.refreshToken === 'string' && !!session.refreshToken &&
    typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt) && session.expiresAt > 0;
}

/** The key must be a randomly generated 32-byte secret, supplied by the Worker. */
export async function sealSession(secret: string, owner: string, grant: string, session: UpstreamSession): Promise<string> {
  if (!isSession(session, owner)) throw new Error('Invalid session');
  const plaintext = encoder.encode(JSON.stringify(session));
  // v1 + separators + a 12-byte nonce and a 16-byte AES-GCM tag.
  // Reject before storing anything that openSession would be unable to read.
  if (20 + Math.ceil((plaintext.byteLength + 16) * 4 / 3) > MAX_ENVELOPE_LENGTH) throw new Error('Session too large');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context(owner, grant) }, await keyFromSecret(secret), plaintext);
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}

/** Decryption errors intentionally do not expose credential or cryptographic details. */
export async function openSession(secret: string, owner: string, grant: string, envelope: string): Promise<UpstreamSession> {
  try {
    const parts = envelope.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1' || envelope.length > MAX_ENVELOPE_LENGTH) throw new Error();
    const iv = decode(parts[1]);
    const ciphertext = decode(parts[2]);
    if (iv.byteLength !== 12 || ciphertext.byteLength < 16) throw new Error();
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: context(owner, grant) }, await keyFromSecret(secret), ciphertext);
    const session: unknown = JSON.parse(decoder.decode(plaintext));
    if (!isSession(session, owner)) throw new Error();
    return session;
  } catch { throw new Error('Invalid session envelope'); }
}
