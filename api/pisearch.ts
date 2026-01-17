import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const API_KEY = process.env.PODCASTINDEX_API_KEY;
const API_SECRET = process.env.PODCASTINDEX_API_SECRET;

function getAuthHeaders() {
  if (!API_KEY || !API_SECRET) return null;

  const apiHeaderTime = Math.floor(Date.now() / 1000);
  const hash = crypto
    .createHash('sha1')
    .update(API_KEY + API_SECRET + apiHeaderTime)
    .digest('hex');

  return {
    'X-Auth-Key': API_KEY,
    'X-Auth-Date': apiHeaderTime.toString(),
    'Authorization': hash,
    'User-Agent': 'MSP2.0/1.0 (Music Side Project Studio)'
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Missing q parameter' });
  }

  const authHeaders = getAuthHeaders();
  if (!authHeaders) {
    return res.status(500).json({ error: 'API credentials not configured' });
  }

  try {
    const searchUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(q)}`;
    const response = await fetch(searchUrl, { headers: authHeaders });
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.description || 'Search failed',
        details: data
      });
    }

    const feeds = (data.feeds || []).map((feed: {
      id: number;
      title: string;
      podcastGuid: string;
      url: string;
      image: string;
    }) => ({
      id: feed.id,
      title: feed.title,
      podcastGuid: feed.podcastGuid,
      url: feed.url,
      image: feed.image
    }));

    return res.status(200).json({ feeds });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to search Podcast Index',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
