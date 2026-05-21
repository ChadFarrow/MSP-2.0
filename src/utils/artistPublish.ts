import type { Album, PublisherFeed } from '../types/feed';
import { generateRssFeed, generatePublisherRssFeed, downloadXml, downloadText } from './xmlGenerator';
import {
  createHostedFeedWithNostr,
  updateHostedFeedWithNostr,
  getHostedFeedInfo,
  saveHostedFeedInfo,
  buildHostedUrl,
} from './hostedFeed';

export interface HostedFeedResult {
  feedId: string;
  url: string;
  podcastIndexId?: number;
}

export interface HostBothResult {
  album: HostedFeedResult;
  publisher: HostedFeedResult;
}

export type PublishStepId = 'album-host' | 'publisher-host' | 'verify-index';
export type PublishStepStatus = 'pending' | 'in-progress' | 'done' | 'failed';

export interface PublishStep {
  id: PublishStepId;
  status: PublishStepStatus;
  message?: string;
}

const hostOne = async (
  xml: string,
  title: string,
  podcastGuid: string,
  ownerPubkey: string
): Promise<HostedFeedResult> => {
  const existing = getHostedFeedInfo(podcastGuid);
  if (existing) {
    const updateResult = await updateHostedFeedWithNostr(existing.feedId, xml, title);
    saveHostedFeedInfo(podcastGuid, { ...existing, lastUpdated: Date.now() });
    return {
      feedId: existing.feedId,
      url: buildHostedUrl(existing.feedId),
      podcastIndexId: updateResult.podcastIndexId,
    };
  }
  const createResult = await createHostedFeedWithNostr(xml, title, podcastGuid);
  saveHostedFeedInfo(podcastGuid, {
    feedId: createResult.feedId,
    editToken: '',
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    ownerPubkey,
    linkedAt: Date.now(),
  });
  return {
    feedId: createResult.feedId,
    url: buildHostedUrl(createResult.feedId),
    podcastIndexId: createResult.podcastIndexId,
  };
};

export async function hostBothOnMSP(
  album: Album,
  publisherFeed: PublisherFeed,
  userPubkey: string,
  onStep?: (step: PublishStep) => void
): Promise<HostBothResult> {
  const now = new Date().toUTCString();
  const albumXml = generateRssFeed({ ...album, lastBuildDate: now });
  const pubXml = generatePublisherRssFeed({ ...publisherFeed, lastBuildDate: now });

  onStep?.({ id: 'album-host', status: 'in-progress' });
  let albumResult: HostedFeedResult;
  try {
    albumResult = await hostOne(albumXml, album.title || 'Album', album.podcastGuid, userPubkey);
    onStep?.({ id: 'album-host', status: 'done' });
  } catch (err) {
    onStep?.({ id: 'album-host', status: 'failed', message: err instanceof Error ? err.message : 'Failed to host album' });
    throw err;
  }

  onStep?.({ id: 'publisher-host', status: 'in-progress' });
  let publisherResult: HostedFeedResult;
  try {
    publisherResult = await hostOne(
      pubXml,
      publisherFeed.title || 'Publisher Catalog',
      publisherFeed.podcastGuid,
      userPubkey
    );
    onStep?.({ id: 'publisher-host', status: 'done' });
  } catch (err) {
    onStep?.({ id: 'publisher-host', status: 'failed', message: err instanceof Error ? err.message : 'Failed to host publisher' });
    throw err;
  }

  return { album: albumResult, publisher: publisherResult };
}

/**
 * Look up a feed in Podcast Index by its podcast:guid.
 * Returns true if PI has registered the feed and it's queryable.
 * Note: PI's `add/byfeedurl` returns a podcastIndexId immediately on submission,
 * but `byguid` lookups can lag by a few seconds while PI commits the registration.
 */
export async function verifyInPodcastIndex(podcastGuid: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/pisearch?q=${encodeURIComponent(podcastGuid)}`);
    if (!response.ok) return false;
    const data = await response.json();
    const feeds = Array.isArray(data.feeds) ? data.feeds : [];
    return feeds.some((f: { podcastGuid?: string }) => f.podcastGuid === podcastGuid);
  } catch {
    return false;
  }
}

/**
 * Poll PI until both feeds are found, or the timeout window elapses.
 * Resolves to `{ album, publisher }` booleans indicating which were found
 * within the polling window. Total wall-clock budget is ~22 seconds.
 */
export async function waitForBothFeedsInIndex(
  albumGuid: string,
  publisherGuid: string
): Promise<{ album: boolean; publisher: boolean }> {
  const delays = [3000, 4000, 5000, 5000, 5000]; // ~22 s total
  let albumFound = false;
  let publisherFound = false;

  for (const delay of delays) {
    await new Promise((r) => setTimeout(r, delay));
    if (!albumFound) albumFound = await verifyInPodcastIndex(albumGuid);
    if (!publisherFound) publisherFound = await verifyInPodcastIndex(publisherGuid);
    if (albumFound && publisherFound) break;
  }

  return { album: albumFound, publisher: publisherFound };
}

export function downloadArtistFeedPackage(album: Album, publisherFeed: PublisherFeed): void {
  const now = new Date().toUTCString();
  const slug = (album.author || publisherFeed.author || 'artist')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const albumXml = generateRssFeed({ ...album, lastBuildDate: now });
  const pubXml = generatePublisherRssFeed({ ...publisherFeed, lastBuildDate: now });
  const instructions = [
    'MSP 2.0 — Feed Package Next Steps',
    '==================================',
    '',
    'You have downloaded two RSS feed files:',
    `  1. ${slug}-album-feed.xml       (medium=music, your album tracks)`,
    `  2. ${slug}-publisher-feed.xml   (medium=publisher, your catalog)`,
    '',
    'STEP 1 — Host both files',
    '  Upload both XML files to your web host, CDN, or GitHub Pages.',
    '  Example:',
    '    Album feed:     https://yourdomain.com/album-feed.xml',
    '    Publisher feed: https://yourdomain.com/publisher-feed.xml',
    '',
    'STEP 2 — Submit both feeds to Podcast Index',
    '  Open MSP 2.0 in Artist mode → Save → Submit to PodcastIndex.',
    '  Paste each hosted URL (album, then publisher) and submit.',
    '',
    '  Faster path: if you log in with Nostr, use Save →',
    '  "Host on MSP (album + publisher)" — MSP hosts both feeds at',
    '  predictable URLs and auto-submits them to Podcast Index in one click.',
    '',
    'STEP 3 — Cross-link by URL (optional)',
    '  The two feeds are already cross-linked by GUID. If you want',
    '  hosted URL cross-references too, open MSP 2.0, switch to Album',
    '  mode, paste your publisher feed URL into the Publisher Feed',
    '  section, then re-download and re-upload the album XML.',
    '',
    `Album GUID:     ${album.podcastGuid}`,
    `Publisher GUID: ${publisherFeed.podcastGuid}`,
    '',
    'These GUIDs are already cross-referenced in both files. Keep this file —',
    'GUIDs never change and can be used to re-link feeds if needed.',
  ].join('\n');

  downloadXml(albumXml, `${slug}-album-feed.xml`);
  setTimeout(() => downloadXml(pubXml, `${slug}-publisher-feed.xml`), 400);
  setTimeout(() => downloadText(instructions, `${slug}-next-steps.txt`), 800);
}
