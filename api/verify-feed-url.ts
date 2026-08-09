import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './_utils/rateLimiter.js';
import { getFeedUrlError, normalizeFeedUrl } from './_utils/urlValidation.js';
import { getClientIp } from './_utils/urlSafety.js';
import { probeFeedUrl, VERIFY_TIMEOUT_MS } from './_utils/feedProbe.js';

/**
 * Confirm a feed URL actually resolves to something feed-shaped, before MSP hands
 * it to Podcast Index.
 *
 * GET /api/verify-feed-url?url=<encoded>
 * → 200 { reachable, status?, looksLikeFeed?, finalUrl?, reason? }
 *
 * Why this exists next to /api/proxy-feed: proxy-feed returns the fetched body to
 * the browser, so it carries a domain allowlist — which makes it useless here,
 * because the musicians who need checking are precisely the ones self-hosting on
 * a domain that will never be on a list. This endpoint returns a *verdict only*
 * and never the bytes, which is what lets it safely drop the allowlist.
 *
 * DO NOT make this return response content. The allowlist is absent on the
 * explicit condition that nothing fetched here reaches the caller. The probing —
 * two differently shaped requests, per-hop SSRF checks, capped body sniff — lives
 * in _utils/feedProbe.ts and is shared with the submit guard so the advisory
 * warning and the refusal can never disagree.
 */

const RATE_LIMIT = { limit: 30, windowMs: 3600_000 };
// The limiter is keyed by a plain string shared across endpoints, so namespace it.
const RATE_LIMIT_PREFIX = 'verify-feed-url:';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url: rawUrl } = req.query as { url?: string };

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const url = normalizeFeedUrl(rawUrl);
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const urlError = getFeedUrlError(url);
  if (urlError) {
    return res.status(400).json({ error: urlError });
  }

  const rate = checkRateLimit(`${RATE_LIMIT_PREFIX}${getClientIp(req)}`, RATE_LIMIT);
  if (!rate.allowed) {
    res.setHeader('Retry-After', Math.ceil(rate.retryAfterMs / 1000));
    return res.status(429).json({ error: 'Too many verification requests. Try again later.' });
  }

  const result = await probeFeedUrl(url, { timeoutMs: VERIFY_TIMEOUT_MS });

  // A blocked address is a refusal by MSP (403), whereas a host that simply
  // doesn't resolve is a verdict about the user's URL (200 + reachable:false).
  // They read very differently to the person who pasted it.
  if (result.refuseWithStatus === 403) {
    return res.status(403).json({ error: result.outcome.reason });
  }

  return res.status(200).json(result.outcome);
}
