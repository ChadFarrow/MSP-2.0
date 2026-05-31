import type { Album, PublisherFeed } from '../types/feed';
import { generateRssFeed, generatePublisherRssFeed } from './xmlGenerator';
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

export type PublishStepId = 'album-host' | 'publisher-host';
export type PublishStepStatus = 'pending' | 'in-progress' | 'done' | 'failed';

export interface PublishStep {
  id: PublishStepId;
  status: PublishStepStatus;
  message?: string;
}

export interface HostBothResult {
  album: HostedFeedResult;
  publisher: HostedFeedResult;
  patchedAlbum: Album;
  patchedPublisherFeed: PublisherFeed;
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

  // Precompute hosted URLs so we can inject cross-links before upload.
  const computedAlbumUrl = buildHostedUrl(album.podcastGuid);
  const computedPublisherUrl = buildHostedUrl(publisherFeed.podcastGuid);

  const patchedAlbum: Album = {
    ...album,
    lastBuildDate: now,
    publisher: album.publisher
      ? { ...album.publisher, feedUrl: album.publisher.feedUrl || computedPublisherUrl }
      : { feedGuid: publisherFeed.podcastGuid, feedUrl: computedPublisherUrl },
  };

  const patchedPublisherFeed: PublisherFeed = {
    ...publisherFeed,
    lastBuildDate: now,
    remoteItems: publisherFeed.remoteItems.map((item) =>
      item.feedGuid === album.podcastGuid && !item.feedUrl
        ? { ...item, feedUrl: computedAlbumUrl }
        : item
    ),
  };

  const albumXml = generateRssFeed(patchedAlbum);
  const pubXml = generatePublisherRssFeed(patchedPublisherFeed);

  onStep?.({ id: 'album-host', status: 'in-progress' });
  let albumResult: HostedFeedResult;
  try {
    albumResult = await hostOne(albumXml, patchedAlbum.title || 'Album', album.podcastGuid, userPubkey);
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
      patchedPublisherFeed.title || 'Publisher Catalog',
      publisherFeed.podcastGuid,
      userPubkey
    );
    onStep?.({ id: 'publisher-host', status: 'done' });
  } catch (err) {
    onStep?.({ id: 'publisher-host', status: 'failed', message: err instanceof Error ? err.message : 'Failed to host publisher' });
    throw err;
  }

  return {
    album: albumResult,
    publisher: publisherResult,
    patchedAlbum,
    patchedPublisherFeed,
  };
}
