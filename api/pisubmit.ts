import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthHeaders } from './_utils/podcastIndex.js';
import { getFeedUrlError } from './_utils/urlValidation.js';
import { guardFeedSubmission, wantsForce } from './_utils/feedReachability.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, force } = req.body;

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

  // See /api/pubnotify — same guard, so no client path can register an
  // unreachable feed regardless of which endpoint it goes through.
  const refusal = await guardFeedSubmission(url, { force: wantsForce(force) });
  if (refusal) {
    return res.status(400).json(refusal);
  }

  const authHeaders = getAuthHeaders();
  if (!authHeaders) {
    return res.status(500).json({ error: 'API credentials not configured' });
  }

  try {
    const submitUrl = `https://api.podcastindex.org/api/1.0/add/byfeedurl?url=${encodeURIComponent(url)}`;

    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: authHeaders
    });
    const data = await response.json();

    // Podcast Index returns status in the response body
    if (data.status === 'false' || data.status === false) {
      return res.status(400).json({
        error: data.description || 'Submit failed',
        details: data
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.description || 'Submit failed',
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      message: data.description || 'Feed submitted successfully',
      feedId: data.feedId || data.feed?.id
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to submit to Podcast Index',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
