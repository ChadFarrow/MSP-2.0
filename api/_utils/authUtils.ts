import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { VercelRequest } from '@vercel/node';

async function deriveEncryptionKey(userId: string): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(secret), 'HKDF', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(userId),
      info: enc.encode('msp-managed-keypair-v1'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptNsec(sk: Uint8Array, userId: string): Promise<string> {
  const key = await deriveEncryptionKey(userId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, sk);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return Buffer.from(combined).toString('base64');
}

export async function decryptNsec(encrypted: string, userId: string): Promise<Uint8Array> {
  const key = await deriveEncryptionKey(userId);
  const combined = Buffer.from(encrypted, 'base64');
  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}

// Unguessable prefix used to list() a user's keypair blob. Has no `.json`
// extension so it still matches the name produced by put(addRandomSuffix: true),
// which inserts `-<random>` before the extension.
export function userBlobPrefix(googleId: string): string {
  const hash = bytesToHex(sha256(new TextEncoder().encode(googleId)));
  return `auth/users/${hash}`;
}

// Deterministic object name passed to put(). With addRandomSuffix the stored
// name becomes `${userBlobPath}` with `-<random>` inserted before `.json`.
export function userBlobPath(googleId: string): string {
  return `${userBlobPrefix(googleId)}.json`;
}

// The record persisted to Blob. Intentionally excludes PII (email / displayName
// / picture): those are carried in the signed session JWT and re-fetched fresh
// from Google on each login, so they must never sit in a public blob.
export interface StoredKeyRecord {
  pubkey: string;
  encryptedNsec: string;
  createdAt: string;
}

export function buildStoredKeyRecord(
  pubkey: string,
  encryptedNsec: string,
  createdAt: string
): StoredKeyRecord {
  return { pubkey, encryptedNsec, createdAt };
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJwt(payload: Record<string, unknown>, expiresInSeconds = 30 * 86400): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds })).toString('base64url');
  const signingInput = `${header}.${body}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${Buffer.from(sig).toString('base64url')}`;
}

export async function verifyJwt(token: string): Promise<Record<string, unknown>> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const [header, body, sig] = parts;
  const signingInput = `${header}.${body}`;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC', key,
    Buffer.from(sig, 'base64url'),
    new TextEncoder().encode(signingInput)
  );
  if (!valid) throw new Error('Invalid JWT signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  if (exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired');
  return payload;
}

export function getSessionToken(req: VercelRequest): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) continue;
    cookies[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
  }
  return cookies['msp-session'] ?? null;
}

export function sessionCookie(jwt: string, maxAgeSeconds = 30 * 86400): string {
  return `msp-session=${jwt}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}; Path=/`;
}

export function clearSessionCookie(): string {
  return 'msp-session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';
}
