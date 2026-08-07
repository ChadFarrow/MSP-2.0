/**
 * Shared SSRF guards for endpoints that fetch a caller-supplied URL.
 *
 * Kept separate from `urlValidation.ts` on purpose: that file is a deliberate
 * mirror of `src/utils/urlValidation.ts` (the feed-URL character rules) and has
 * to stay character-for-character in sync with it. These guards are server-only.
 */

/**
 * True when a hostname points at a private, loopback, or link-local address —
 * the targets an SSRF attacker would aim at (cloud metadata, internal services).
 * String-based check on the literal host; covers IPv4 literals, IPv6 loopback,
 * and obvious internal names. Hostnames that resolve to private IPs via DNS are
 * not caught here.
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

/** First-hop client IP from the proxy headers Vercel sets. */
export function getClientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  return 'unknown';
}
