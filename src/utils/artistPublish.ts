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

export interface VerifyProgress {
  album: boolean;
  publisher: boolean;
  attempt: number;
  totalAttempts: number;
  /** Seconds until the next check. Null when polling has ended. */
  nextCheckIn: number | null;
}

export interface CancellationToken {
  cancelled: boolean;
}

/**
 * Schedule of delays between PI byguid checks.
 *
 * PI typically takes 30 s to a few minutes to commit new submissions to its
 * byguid index. Checking faster than that just burns API calls without finding
 * anything, so the schedule starts at 20 s and backs off from there. Total
 * wall-clock budget is ~10 minutes.
 */
const POLL_DELAYS_MS = [
  20000, 20000, 30000, // first ~70 s
  30000, 30000, 30000, // 90 s more (~2.5 min)
  60000, 60000, 60000, 60000, // 4 more min (~6.5 min)
  120000, 120000, // 4 more min (~10.5 min)
];

/**
 * Poll PI until both feeds are found, or the schedule is exhausted.
 * Calls onProgress after every check. Each call passes a `nextCheckIn` (seconds)
 * so the UI can render a countdown to the next attempt — or null when polling stops.
 * Aborts immediately if `cancelToken.cancelled` flips to true.
 */
export async function waitForBothFeedsInIndex(
  albumGuid: string,
  publisherGuid: string,
  onProgress?: (p: VerifyProgress) => void,
  cancelToken?: CancellationToken
): Promise<VerifyProgress> {
  const total = POLL_DELAYS_MS.length;
  let albumFound = false;
  let publisherFound = false;

  for (let i = 0; i < POLL_DELAYS_MS.length; i++) {
    const delay = POLL_DELAYS_MS[i];

    // Tell the UI how long until the next check (so it can show a countdown).
    onProgress?.({
      album: albumFound,
      publisher: publisherFound,
      attempt: i,
      totalAttempts: total,
      nextCheckIn: Math.round(delay / 1000),
    });

    await new Promise((r) => setTimeout(r, delay));
    if (cancelToken?.cancelled) break;

    if (!albumFound) albumFound = await verifyInPodcastIndex(albumGuid);
    if (!publisherFound) publisherFound = await verifyInPodcastIndex(publisherGuid);

    const isFinal = albumFound && publisherFound;
    onProgress?.({
      album: albumFound,
      publisher: publisherFound,
      attempt: i + 1,
      totalAttempts: total,
      nextCheckIn: isFinal || i === POLL_DELAYS_MS.length - 1 ? null : Math.round(POLL_DELAYS_MS[i + 1] / 1000),
    });

    if (isFinal) break;
  }

  return {
    album: albumFound,
    publisher: publisherFound,
    attempt: POLL_DELAYS_MS.length,
    totalAttempts: total,
    nextCheckIn: null,
  };
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
