import type { VercelRequest, VercelResponse } from '@vercel/node';
import { lookupPodcastIndexId } from './_utils/feedUtils.js';

// Read-only resolver: maps a feed's podcast:guid to its numeric Podcast Index page
// (https://podcastindex.org/podcast/<id>) via the byguid API. NO side effects (no
// pubnotify ping, no podping, no add/byfeedurl) — unlike /api/pubnotify — so it's
// safe to POLL while PI finishes indexing a freshly published feed.
//
// Why the numeric page: PI's web /search?q= matches title/author/owner, NEVER the
// podcast:guid, so a guid search can't surface a specific feed. /podcast/<id> is the
// only reliable deep link, and byguid can lag a few minutes after publish.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guid = typeof req.query.guid === 'string' ? req.query.guid.trim() : '';
  if (!guid) {
    return res.status(400).json({ error: 'Missing guid' });
  }

  try {
    const id = await lookupPodcastIndexId(guid);
    if (id) {
      return res.status(200).json({
        podcastIndexId: id,
        podcastIndexUrl: `https://podcastindex.org/podcast/${id}`,
      });
    }
    // Not indexed yet (or PI keys unset) — caller keeps polling / uses a fallback.
    return res.status(200).json({ podcastIndexId: null, podcastIndexUrl: null });
  } catch {
    return res.status(200).json({ podcastIndexId: null, podcastIndexUrl: null });
  }
}
