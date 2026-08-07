import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isPrivateHost, getClientIp } from './_utils/httpGuards.js';
import { checkRateLimit } from './_utils/rateLimiter.js';
import {
  checkFeedReachability,
  type CheckReason,
  type FeedReachability
} from './_utils/feedReachability.js';

/**
 * Reachability pre-flight for a caller-supplied feed URL.
 *
 * GET /api/check-feed-url?url=<encoded>
 *
 * Answers one question: could a crawler like Podcast Index actually fetch this?
 * Motivation: a feed behind Cloudflare Bot Fight Mode (or any WAF that challenges
 * non-browser clients) returns 403 to PI's crawler, so the feed registers but never
 * indexes — silently, from the user's point of view. See CLAUDE.md.
 *
 * Deliberately NOT `/api/proxy-feed`: that endpoint enforces a podcast-host
 * allowlist and would reject exactly the arbitrary self-hosted domains this check
 * exists to test. To stay clear of being an open proxy, this one returns a verdict
 * and never the feed body.
 */

const RATE_LIMIT = { limit: 30, windowMs: 3600_000 };
/** Longer than the submit guard's — nothing is waiting on this but a hint. */
const TIMEOUT_MS = 10_000;

export type { CheckReason };
export type CheckFeedUrlResult = FeedReachability;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Unsupported URL protocol' });
  }

  if (isPrivateHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host not allowed' });
  }

  const rate = checkRateLimit(`check-feed-url:${getClientIp(req)}`, RATE_LIMIT);
  if (!rate.allowed) {
    res.setHeader('Retry-After', Math.ceil(rate.retryAfterMs / 1000));
    return res.status(429).json({ error: 'Too many reachability checks. Try again later.' });
  }

  // Same implementation the submit guards use, so this advisory and the refusal
  // can never disagree about the same feed.
  const result = await checkFeedReachability(parsedUrl.toString(), TIMEOUT_MS);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json(result);
}
