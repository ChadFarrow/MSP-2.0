import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // Validate URL format
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    const podcastIndexUrl = `https://api.podcastindex.org/api/1.0/hub/pubnotify?url=${encodeURIComponent(url)}`;
    const response = await fetch(podcastIndexUrl, {
      headers: {
        'User-Agent': 'MSP2.0/1.0 (Music Side Project Studio)'
      }
    });
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.description || 'Failed to notify Podcast Index',
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Feed submitted to Podcast Index',
      details: data
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to contact Podcast Index',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
