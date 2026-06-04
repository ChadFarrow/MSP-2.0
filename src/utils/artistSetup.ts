import type { FeedAction } from '../store/feedStore';
import type { Album, PublisherFeed } from '../types/feed';
import { createEmptyAlbum, createEmptyPublisherFeed, createEmptyRemoteItem } from '../types/feed';

interface CurrentFeeds {
  album?: Album;
  publisherFeed?: PublisherFeed | null;
}

/**
 * Build the action sequence needed to put state into a valid artist-mode shape:
 * a cross-linked album + publisher pair where the album's publisher.feedGuid
 * matches the publisher's podcastGuid, and the publisher's remoteItems contain
 * a reference to the album.
 *
 * When `regenerateGuids` is true, both feeds are created fresh — current state
 * is ignored. When false, existing GUIDs are preserved and only missing pieces
 * or stale cross-links are reconciled.
 *
 * SET_FEED_TYPE is always last because SET_ALBUM and SET_PUBLISHER_FEED reset
 * feedType implicitly.
 */
export function buildArtistSetupActions(
  current: CurrentFeeds,
  options: { regenerateGuids?: boolean } = {}
): FeedAction[] {
  if (options.regenerateGuids) {
    const albumGuid = crypto.randomUUID();
    const publisherGuid = crypto.randomUUID();
    return [
      {
        type: 'SET_PUBLISHER_FEED',
        payload: {
          ...createEmptyPublisherFeed(),
          podcastGuid: publisherGuid,
          remoteItems: [{ ...createEmptyRemoteItem(), feedGuid: albumGuid }],
        },
      },
      {
        type: 'SET_ALBUM',
        payload: {
          ...createEmptyAlbum(),
          podcastGuid: albumGuid,
          publisher: { feedGuid: publisherGuid },
        },
      },
      { type: 'SET_FEED_TYPE', payload: 'artist' },
    ];
  }

  const albumGuid = current.album?.podcastGuid || crypto.randomUUID();
  const publisherGuid = current.publisherFeed?.podcastGuid || crypto.randomUUID();
  const actions: FeedAction[] = [];

  if (!current.publisherFeed) {
    actions.push({
      type: 'SET_PUBLISHER_FEED',
      payload: {
        ...createEmptyPublisherFeed(),
        podcastGuid: publisherGuid,
        remoteItems: [{ ...createEmptyRemoteItem(), feedGuid: albumGuid }],
      },
    });
  } else if (!current.publisherFeed.remoteItems.some(item => item.feedGuid === albumGuid)) {
    // Publisher exists but its catalog doesn't yet reference this album — link them.
    // Without this, the hosted publisher XML would carry a stale remoteItem and
    // Podcast Index would never associate the two feeds.
    actions.push({
      type: 'UPDATE_PUBLISHER_FEED',
      payload: {
        remoteItems: [
          ...current.publisherFeed.remoteItems,
          { ...createEmptyRemoteItem(), feedGuid: albumGuid },
        ],
      },
    });
  }

  if (!current.album) {
    actions.push({
      type: 'SET_ALBUM',
      payload: {
        ...createEmptyAlbum(),
        podcastGuid: albumGuid,
        publisher: { feedGuid: publisherGuid },
      },
    });
  } else if (current.album.publisher?.feedGuid !== publisherGuid) {
    actions.push({
      type: 'UPDATE_ALBUM',
      payload: { publisher: { feedGuid: publisherGuid } },
    });
  }

  actions.push({ type: 'SET_FEED_TYPE', payload: 'artist' });
  return actions;
}
