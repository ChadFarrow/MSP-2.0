// SSRF guards shared by the endpoints that fetch user-supplied URLs.
//
// /api/proxy-feed returns the fetched *body* to the browser, so it keeps a
// domain allowlist on top of these checks. /api/verify-feed-url returns only a
// verdict and therefore has no allowlist — which makes the checks here its only
// line of defence. Treat them accordingly.
import { lookup } from 'node:dns/promises';
import type { VercelRequest } from '@vercel/node';

/**
 * True when a hostname points at a private, loopback, or link-local address —
 * the targets an SSRF attacker would aim at (cloud metadata, internal services).
 * String-based check on the literal host; covers IPv4 literals, IPv6 loopback,
 * and obvious internal names. Hostnames that resolve to private IPs via DNS are
 * not caught here — use assertPublicHttpUrl, which also resolves.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }

  // IPv6 loopback / unique-local / link-local
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return true;
  }

  // IPv4 literal checks
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // loopback
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;// 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  }

  return false;
}

/** True when a resolved IP literal is one we must never connect to. */
function isPrivateAddress(address: string, family: number): boolean {
  if (family === 4) return isPrivateHost(address);

  const ip = address.toLowerCase();
  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  // IPv4-mapped IPv6 (::ffff:169.254.169.254) — unwrap and re-check.
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateHost(mapped[1]);
  return false;
}

export type UrlSafetyResult =
  | { ok: true; url: URL }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Full pre-flight for fetching a user-supplied URL: protocol, literal host, and
 * — unlike the string-only check above — the addresses the hostname actually
 * resolves to. Without the DNS step an attacker just points their own domain at
 * 169.254.169.254 and walks straight past isPrivateHost.
 *
 * Call this on every redirect hop too, not only the first URL.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<UrlSafetyResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, error: 'Invalid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, status: 400, error: 'Unsupported URL protocol' };
  }

  if (isPrivateHost(url.hostname)) {
    return { ok: false, status: 403, error: 'Address not allowed' };
  }

  try {
    const resolved = await lookup(url.hostname, { all: true });
    if (resolved.some(({ address, family }) => isPrivateAddress(address, family))) {
      return { ok: false, status: 403, error: 'Address not allowed' };
    }
  } catch {
    // Name doesn't resolve. Report it as unreachable rather than unsafe — the
    // caller turns this into "that URL didn't load", which is what it means.
    return { ok: false, status: 400, error: 'Could not resolve host' };
  }

  return { ok: true, url };
}

/** Client IP for rate limiting, from the proxy header Vercel sets. */
export function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  return 'unknown';
}
