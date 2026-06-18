import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { list, put } from '@vercel/blob';
import { encryptNsec, decryptNsec, userBlobPath, signJwt, sessionCookie } from '../_utils/authUtils.js';

interface GoogleTokenPayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

interface StoredKeyData {
  pubkey: string;
  encryptedNsec: string;
  email: string;
  displayName?: string;
  picture?: string;
  createdAt: string;
}

async function exchangeCodeForUser(
  code: string,
  redirectUri: string
): Promise<GoogleTokenPayload> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  const data = await res.json() as { id_token?: string };
  if (!data.id_token) throw new Error('No id_token returned by Google');
  // Decode payload (trusted — received directly from Google's token endpoint over HTTPS)
  const [, payloadB64] = data.id_token.split('.');
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as GoogleTokenPayload;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(302, `/?auth_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect(302, '/?auth_error=missing_params');
  }

  // Validate CSRF state from cookie
  const cookieHeader = req.headers.cookie ?? '';
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) continue;
    cookies[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
  }
  if (!cookies['msp-oauth-state'] || cookies['msp-oauth-state'] !== state) {
    return res.redirect(302, '/?auth_error=csrf_mismatch');
  }

  try {
    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
    const host = req.headers['host'] as string;
    const redirectUri = `${proto}://${host}/api/auth/google-callback`;

    const { sub: googleId, email, name: displayName, picture } = await exchangeCodeForUser(code, redirectUri);

    const blobPath = userBlobPath(googleId);
    let pubkey: string;
    let sk: Uint8Array | null = null;

    const { blobs } = await list({ prefix: blobPath });

    if (blobs.length > 0) {
      const blobRes = await fetch(blobs[0].url);
      const stored = await blobRes.json() as StoredKeyData;
      pubkey = stored.pubkey;
      sk = await decryptNsec(stored.encryptedNsec, googleId);
    } else {
      sk = generateSecretKey();
      pubkey = getPublicKey(sk);
      const encryptedNsec = await encryptNsec(sk, googleId);
      const data: StoredKeyData = {
        pubkey,
        encryptedNsec,
        email,
        displayName,
        picture,
        createdAt: new Date().toISOString(),
      };
      await put(blobPath, JSON.stringify(data), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
    }

    const npub = npubEncode(pubkey);
    const jwt = await signJwt({
      sub: googleId,
      email,
      pubkey,
      npub,
      displayName: displayName ?? email,
      picture: picture ?? null,
    });

    res.setHeader('Set-Cookie', [
      sessionCookie(jwt),
      'msp-oauth-state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
    ]);
    res.redirect(302, '/?auth=success');
  } catch (err) {
    console.error('[auth/google-callback]', err);
    res.redirect(302, '/?auth_error=server_error');
  }
}
