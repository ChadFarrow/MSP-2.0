// Frontend client for email magic-link auth (the non-Nostr feed-ownership path).
import { emailSessionStorage, type EmailSessionInfo } from './storage';

/** Current stored session, or null. */
export function getEmailSession(): EmailSessionInfo | null {
  return emailSessionStorage.load();
}

export function isEmailLoggedIn(): boolean {
  return Boolean(emailSessionStorage.load()?.session);
}

export function setEmailSession(info: EmailSessionInfo): void {
  emailSessionStorage.save(info);
}

export function clearEmailSession(): void {
  emailSessionStorage.clear();
}

/** Merge the X-Email-Session header into a headers object when logged in. */
export function withEmailAuth(headers: Record<string, string> = {}): Record<string, string> {
  const session = emailSessionStorage.load()?.session;
  return session ? { ...headers, 'X-Email-Session': `Bearer ${session}` } : headers;
}

/**
 * Request a magic link. Always resolves on a 200 (enumeration-safe); throws only on
 * transport/validation errors so the UI can show "check your inbox" without leaking
 * whether the address exists.
 */
export async function requestMagicLink(
  email: string,
  opts: { purpose?: 'login' | 'claim'; feedId?: string; editToken?: string } = {}
): Promise<void> {
  const response = await fetch('/api/auth/magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ...opts })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to send link' }));
    throw new Error(err.error || 'Failed to send link');
  }
}

/**
 * Redeem a magic-link token. On success, persists the session and returns it.
 */
export async function verifyMagicLink(token: string): Promise<EmailSessionInfo> {
  const response = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Invalid or expired link' }));
    throw new Error(err.error || 'Invalid or expired link');
  }
  const data = await response.json() as { session: string; emailHash: string };
  const info: EmailSessionInfo = {
    session: data.session,
    emailHash: data.emailHash,
    createdAt: Date.now()
  };
  emailSessionStorage.save(info);
  return info;
}

/**
 * The token from a pasted magic link — the whole URL from the email, or just
 * the token. Returns null when the text holds neither.
 *
 * Used by the WordPress plugin: the emailed link always points at MSP's own
 * domain (getVerifyOrigin refuses any other host, on purpose), so clicking it
 * would sign the user in on musicsideproject.com, not inside WordPress. The
 * plugin asks for the link to be pasted instead and redeems it here.
 */
export function extractMagicLinkToken(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const token = url.searchParams.get('token');
    return token && /^[A-Za-z0-9_-]{16,}$/.test(token) ? token : null;
  } catch {
    // Not a URL: accept a bare base64url token (43 chars from 32 bytes).
    return /^[A-Za-z0-9_-]{16,}$/.test(text) ? text : null;
  }
}
