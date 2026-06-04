import { describe, it, expect } from 'vitest';
import { buildArtistSetupActions } from './artistSetup';
import { createEmptyAlbum, createEmptyPublisherFeed } from '../types/feed';
import type { Album, PublisherFeed } from '../types/feed';

describe('buildArtistSetupActions', () => {
  describe('regenerateGuids: true', () => {
    it('returns SET_PUBLISHER_FEED, SET_ALBUM, SET_FEED_TYPE in order', () => {
      const actions = buildArtistSetupActions({}, { regenerateGuids: true });
      expect(actions.map(a => a.type)).toEqual([
        'SET_PUBLISHER_FEED',
        'SET_ALBUM',
        'SET_FEED_TYPE',
      ]);
    });

    it('cross-links the freshly generated GUIDs', () => {
      const actions = buildArtistSetupActions({}, { regenerateGuids: true });
      const publisherAction = actions[0] as { type: 'SET_PUBLISHER_FEED'; payload: PublisherFeed };
      const albumAction = actions[1] as { type: 'SET_ALBUM'; payload: Album };

      const publisherGuid = publisherAction.payload.podcastGuid;
      const albumGuid = albumAction.payload.podcastGuid;

      expect(albumAction.payload.publisher?.feedGuid).toBe(publisherGuid);
      expect(publisherAction.payload.remoteItems[0].feedGuid).toBe(albumGuid);
    });

    it('ignores existing state when regenerating', () => {
      const existing: Album = { ...createEmptyAlbum(), podcastGuid: 'should-be-discarded' };
      const actions = buildArtistSetupActions({ album: existing }, { regenerateGuids: true });
      const albumAction = actions[1] as { type: 'SET_ALBUM'; payload: Album };
      expect(albumAction.payload.podcastGuid).not.toBe('should-be-discarded');
    });

    it('ends with SET_FEED_TYPE: artist', () => {
      const actions = buildArtistSetupActions({}, { regenerateGuids: true });
      expect(actions[actions.length - 1]).toEqual({ type: 'SET_FEED_TYPE', payload: 'artist' });
    });
  });

  describe('reconcile (regenerateGuids: false)', () => {
    it('creates both feeds when neither exists', () => {
      const actions = buildArtistSetupActions({});
      expect(actions.map(a => a.type)).toEqual([
        'SET_PUBLISHER_FEED',
        'SET_ALBUM',
        'SET_FEED_TYPE',
      ]);
    });

    it('preserves existing album GUID and creates a matching publisher', () => {
      const album: Album = { ...createEmptyAlbum(), podcastGuid: 'album-abc' };
      const actions = buildArtistSetupActions({ album });
      const publisherAction = actions.find(a => a.type === 'SET_PUBLISHER_FEED') as
        | { type: 'SET_PUBLISHER_FEED'; payload: PublisherFeed }
        | undefined;
      expect(publisherAction).toBeDefined();
      expect(publisherAction!.payload.remoteItems[0].feedGuid).toBe('album-abc');
      // album already has a podcastGuid but its publisher.feedGuid is empty — should be updated
      const albumUpdate = actions.find(a => a.type === 'UPDATE_ALBUM');
      expect(albumUpdate).toBeDefined();
    });

    it('preserves existing publisher GUID and creates a matching album', () => {
      const publisherFeed: PublisherFeed = { ...createEmptyPublisherFeed(), podcastGuid: 'pub-xyz' };
      const actions = buildArtistSetupActions({ publisherFeed });
      const albumAction = actions.find(a => a.type === 'SET_ALBUM') as
        | { type: 'SET_ALBUM'; payload: Album }
        | undefined;
      expect(albumAction).toBeDefined();
      expect(albumAction!.payload.publisher?.feedGuid).toBe('pub-xyz');
    });

    it('appends current album to publisher remoteItems when missing', () => {
      const album: Album = {
        ...createEmptyAlbum(),
        podcastGuid: 'album-id',
        publisher: { feedGuid: 'pub-id' },
      };
      const publisherFeed: PublisherFeed = {
        ...createEmptyPublisherFeed(),
        podcastGuid: 'pub-id',
        remoteItems: [{ feedGuid: 'some-other-album', feedUrl: '', title: '', medium: 'music' }],
      };
      const actions = buildArtistSetupActions({ album, publisherFeed });
      const pubUpdate = actions.find(a => a.type === 'UPDATE_PUBLISHER_FEED') as
        | { type: 'UPDATE_PUBLISHER_FEED'; payload: Partial<PublisherFeed> }
        | undefined;
      expect(pubUpdate).toBeDefined();
      expect(pubUpdate!.payload.remoteItems).toHaveLength(2);
      expect(pubUpdate!.payload.remoteItems![1].feedGuid).toBe('album-id');
    });

    it('emits no UPDATE actions when feeds are already cross-linked', () => {
      const album: Album = {
        ...createEmptyAlbum(),
        podcastGuid: 'album-id',
        publisher: { feedGuid: 'pub-id' },
      };
      const publisherFeed: PublisherFeed = {
        ...createEmptyPublisherFeed(),
        podcastGuid: 'pub-id',
        remoteItems: [{ feedGuid: 'album-id', feedUrl: '', title: '', medium: 'music' }],
      };
      const actions = buildArtistSetupActions({ album, publisherFeed });
      expect(actions).toEqual([{ type: 'SET_FEED_TYPE', payload: 'artist' }]);
    });

    it('fixes album publisher.feedGuid when stale', () => {
      const album: Album = {
        ...createEmptyAlbum(),
        podcastGuid: 'album-id',
        publisher: { feedGuid: 'wrong-pub-id' },
      };
      const publisherFeed: PublisherFeed = {
        ...createEmptyPublisherFeed(),
        podcastGuid: 'correct-pub-id',
        remoteItems: [{ feedGuid: 'album-id', feedUrl: '', title: '', medium: 'music' }],
      };
      const actions = buildArtistSetupActions({ album, publisherFeed });
      const albumUpdate = actions.find(a => a.type === 'UPDATE_ALBUM') as
        | { type: 'UPDATE_ALBUM'; payload: Partial<Album> }
        | undefined;
      expect(albumUpdate).toBeDefined();
      expect(albumUpdate!.payload.publisher?.feedGuid).toBe('correct-pub-id');
    });

    it('always ends with SET_FEED_TYPE: artist', () => {
      const actions = buildArtistSetupActions({});
      expect(actions[actions.length - 1]).toEqual({ type: 'SET_FEED_TYPE', payload: 'artist' });
    });
  });
});
