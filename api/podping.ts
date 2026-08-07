import type { VercelRequest, VercelResponse } from '@vercel/node';
import { notifyPodping, isPodpingConfigured } from './_utils/feedUtils.js';
import { checkRateLimit } from './_utils/rateLimiter.js';
import { getFeedUrlError } from './_utils/urlValidation.js';
import { guardFeedSubmission, wantsForce } from './_utils/feedReachability.js';

const RATE_LIMIT = { limit: 10, windowMs: 3600_000 };

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  return 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const source = req.method === 'GET' ? req.query : req.body ?? {};
  const { url, reason, medium, force } = source as {
    url?: string;
    reason?: string;
    medium?: string;
    force?: unknown;
  };

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const urlError = getFeedUrlError(url);
  if (urlError) {
    return res.status(400).json({ error: urlError });
  }

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip, RATE_LIMIT);
  if (!rate.allowed) {
    res.setHeader('Retry-After', Math.ceil(rate.retryAfterMs / 1000));
    return res.status(429).json({ error: 'Too many podping requests. Try again later.' });
  }

  if (!isPodpingConfigured()) {
    return res.status(501).json({ error: 'Podping not configured on this deployment' });
  }

  // A podping for an unfetchable feed is worse than useless: it lands on Hive,
  // every indexer dutifully tries to crawl, and they all get the same 403 — while
  // the user sees "✅ Podping received" and assumes it worked. Checked after the
  // config gate so an unconfigured deployment doesn't probe for nothing.
  const refusal = await guardFeedSubmission(url, { force: wantsForce(force) });
  if (refusal) {
    return res.status(400).json(refusal);
  }

  const result = await notifyPodping(url, { reason, medium });
  if (!result.ok) {
    return res.status(result.status ?? 502).json({
      error: result.error ?? 'Podping submission failed'
    });
  }

  return res.status(200).json({ success: true });
}
