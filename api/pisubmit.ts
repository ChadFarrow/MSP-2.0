import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthHeaders } from './_utils/podcastIndex.js';
import { getFeedUrlError } from './_utils/urlValidation.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

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
    const text = await response.text();

    // PI sometimes returns an empty body for feeds it silently rejects
    // (e.g., medium=publisher feeds). Surface the raw HTTP context so the
    // caller can distinguish "submitted ok" from "submission ignored".
    if (!text) {
      return res.status(response.ok ? 200 : response.status).json({
        success: false,
        error: 'Podcast Index returned an empty response',
        details: {
          httpStatus: response.status,
          contentType: response.headers.get('content-type') || null,
          contentLength: response.headers.get('content-length') || null
        }
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: 'Podcast Index returned a non-JSON response',
        details: {
          httpStatus: response.status,
          contentType: response.headers.get('content-type') || null,
          body: text.slice(0, 500)
        }
      });
    }

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
