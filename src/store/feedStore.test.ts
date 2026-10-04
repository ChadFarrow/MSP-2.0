import { describe, it, expect, vi } from 'vitest';

// feedStore builds its initial state at import time from localStorage. There's no vitest
// config, so tests run in `node` where that global doesn't exist — stub it before the import
// (vi.hoisted runs first) to keep the suite output clean.
vi.hoisted(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; }
  } as Storage;
});

import { feedReducer, emptyFeedCheck } from './feedStore';
import type { FeedState } from './feedStore';
import { createEmptyAlbum, createEmptyPublisherFeed, createEmptyRemoteItem, createEmptyTrack } from '../types/feed';
import type { Album, RemoteItem } from '../types/feed';
import type { FeedIssue } from '../utils/feedChecks';
import { LINK_CHECK_LIMIT } from '../utils/linkCheck';

const ALBUM_PUB_DATE = 'Sat, 01 Feb 2025 00:00:00 GMT';

const makeState = (album: Album): FeedState => ({
  feedType: 'album',
  album,
  videoFeed: null,
  publisherFeed: null,
  isDirty: false,
  publisherFeedInstance: 0,
  feedCheck: emptyFeedCheck()
});

const albumWith = (pubDates: string[]): Album => {
  const album = createEmptyAlbum();
  album.pubDate = ALBUM_PUB_DATE;
  album.tracks = pubDates.map((pubDate, i) => ({
    ...createEmptyTrack(i + 1),
    title: `Track ${i + 1}`,
    pubDate
  }));
  return album;
};

const trackDates = (state: FeedState): string[] => state.album.tracks.map(t => t.pubDate);
const trackTimes = (state: FeedState): number[] => state.album.tracks.map(t => Date.parse(t.pubDate));
const descends = (times: number[]) => times.every((t, i) => i === 0 || t < times[i - 1]);

describe('feedReducer ADD_TRACK', () => {
  it('overrides the payload pubDate so added tracks descend', () => {
    // Editor.tsx dispatches a fully-built createEmptyTrack payload, whose pubDate is "now" —
    // the exact thing that made albums come out backwards. The reducer must win.
    let state = makeState(albumWith([]));
    for (let i = 0; i < 4; i++) {
      state = feedReducer(state, { type: 'ADD_TRACK', payload: createEmptyTrack(i + 1) });
    }
    expect(state.album.tracks).toHaveLength(4);
    expect(descends(trackTimes(state))).toBe(true);
  });

  it('starts the first track at the album pubDate', () => {
    const state = feedReducer(makeState(albumWith([])), {
      type: 'ADD_TRACK',
      payload: createEmptyTrack(1)
    });
    expect(state.album.tracks[0].pubDate).toBe(ALBUM_PUB_DATE);
  });

  it('appends below the existing tracks even when they carry real dates', () => {
    const state = feedReducer(makeState(albumWith(['Mon, 20 Jan 2025 00:00:00 GMT'])), {
      type: 'ADD_TRACK',
      payload: createEmptyTrack(2)
    });
    expect(descends(trackTimes(state))).toBe(true);
  });
});

describe('feedReducer REORDER_TRACKS', () => {
  it('moves the dates with the tracks', () => {
    const state = feedReducer(
      makeState(albumWith([
        'Sat, 01 Feb 2025 00:02:00 GMT',
        'Sat, 01 Feb 2025 00:01:00 GMT',
        'Sat, 01 Feb 2025 00:00:00 GMT'
      ])),
      { type: 'REORDER_TRACKS', payload: { fromIndex: 2, toIndex: 0 } }
    );
    expect(state.album.tracks.map(t => t.title)).toEqual(['Track 3', 'Track 1', 'Track 2']);
    expect(descends(trackTimes(state))).toBe(true);
  });

  it('still renumbers trackNumber and episode', () => {
    const state = feedReducer(
      makeState(albumWith([
        'Sat, 01 Feb 2025 00:02:00 GMT',
        'Sat, 01 Feb 2025 00:01:00 GMT',
        'Sat, 01 Feb 2025 00:00:00 GMT'
      ])),
      { type: 'REORDER_TRACKS', payload: { fromIndex: 2, toIndex: 0 } }
    );
    expect(state.album.tracks.map(t => t.trackNumber)).toEqual([1, 2, 3]);
    expect(state.album.tracks.map(t => t.episode)).toEqual([1, 2, 3]);
  });
});

describe('feedReducer FIX_TRACK_ORDER', () => {
  it('repairs an album whose tracks carry ascending creation timestamps', () => {
    // Exactly what issue #94 reported: built in MSP before this fix.
    const state = feedReducer(
      makeState(albumWith([
        'Sat, 01 Feb 2025 00:00:00 GMT',
        'Sat, 01 Feb 2025 00:01:00 GMT',
        'Sat, 01 Feb 2025 00:02:00 GMT'
      ])),
      { type: 'FIX_TRACK_ORDER' }
    );
    expect(state.album.tracks.map(t => t.title)).toEqual(['Track 1', 'Track 2', 'Track 3']);
    expect(trackDates(state)).toEqual([
      'Sat, 01 Feb 2025 00:02:00 GMT',
      'Sat, 01 Feb 2025 00:01:00 GMT',
      'Sat, 01 Feb 2025 00:00:00 GMT'
    ]);
  });

  it('flips an imported newest-first feed and then fixes its dates', () => {
    const album = albumWith([
      'Mon, 20 Jan 2025 00:00:00 GMT',
      'Mon, 13 Jan 2025 00:00:00 GMT',
      'Mon, 06 Jan 2025 00:00:00 GMT'
    ]);
    album.tracks.forEach((track, i) => { track.episode = album.tracks.length - i; });

    const state = feedReducer(makeState(album), { type: 'FIX_TRACK_ORDER' });

    expect(state.album.tracks.map(t => t.title)).toEqual(['Track 3', 'Track 2', 'Track 1']);
    expect(state.album.tracks.map(t => t.episode)).toEqual([1, 2, 3]);
    expect(descends(trackTimes(state))).toBe(true);
  });

  it('spreads an import whose tracks all share one date', () => {
    const state = feedReducer(
      makeState(albumWith([ALBUM_PUB_DATE, ALBUM_PUB_DATE, ALBUM_PUB_DATE])),
      { type: 'FIX_TRACK_ORDER' }
    );
    expect(descends(trackTimes(state))).toBe(true);
  });

  it('leaves an already-correct album alone', () => {
    const album = albumWith([
      'Sat, 01 Feb 2025 00:02:00 GMT',
      'Sat, 01 Feb 2025 00:01:00 GMT',
      'Sat, 01 Feb 2025 00:00:00 GMT'
    ]);
    const state = feedReducer(makeState(album), { type: 'FIX_TRACK_ORDER' });
    expect(state.album.tracks.map(t => t.title)).toEqual(['Track 1', 'Track 2', 'Track 3']);
    expect(trackDates(state)).toEqual(album.tracks.map(t => t.pubDate));
  });

  it('marks the feed dirty so the fix gets saved', () => {
    const state = feedReducer(
      makeState(albumWith([ALBUM_PUB_DATE, ALBUM_PUB_DATE])),
      { type: 'FIX_TRACK_ORDER' }
    );
    expect(state.isDirty).toBe(true);
  });
});

describe('feedReducer video feeds', () => {
  it('applies the same date ordering to the video feed', () => {
    const video = albumWith([]);
    video.medium = 'video';
    const state = feedReducer(
      { ...makeState(createEmptyAlbum()), feedType: 'video', videoFeed: video },
      { type: 'ADD_TRACK', payload: createEmptyTrack(1, 'video/mp4') }
    );
    expect(state.videoFeed!.tracks[0].pubDate).toBe(ALBUM_PUB_DATE);
  });
});

describe('feedReducer publisher role', () => {
  const remote = (feedGuid: string, rel?: string): RemoteItem => ({
    ...createEmptyRemoteItem(),
    feedGuid,
    ...(rel === undefined ? {} : { rel })
  });
  const publisherState = (items: RemoteItem[]): FeedState => ({
    ...makeState(createEmptyAlbum()),
    feedType: 'publisher',
    publisherFeed: { ...createEmptyPublisherFeed(), remoteItems: items }
  });

  it('sets the role on every catalog item', () => {
    const state = feedReducer(
      publisherState([remote('a'), remote('b', 'artist')]),
      { type: 'SET_PUBLISHER_ROLE', payload: 'label' }
    );
    expect(state.publisherFeed!.remoteItems.map(i => i.rel)).toEqual(['label', 'label']);
    expect(state.isDirty).toBe(true);
  });

  it('removes rel from every item for "Not stated"', () => {
    const state = feedReducer(
      publisherState([remote('a', 'label'), remote('b', 'label')]),
      { type: 'SET_PUBLISHER_ROLE', payload: '' }
    );
    expect(state.publisherFeed!.remoteItems.every(i => !('rel' in i))).toBe(true);
  });

  it('gives a new catalog item the role the catalog states', () => {
    const state = feedReducer(
      publisherState([remote('a', 'artist')]),
      { type: 'ADD_REMOTE_ITEM', payload: remote('b') }
    );
    expect(state.publisherFeed!.remoteItems[1].rel).toBe('artist');
  });

  it('leaves a new item without a role when the catalog states none or differs', () => {
    const none = feedReducer(publisherState([remote('a')]), { type: 'ADD_REMOTE_ITEM', payload: remote('b') });
    const mixed = feedReducer(
      publisherState([remote('a', 'artist'), remote('b', 'label')]),
      { type: 'ADD_REMOTE_ITEM', payload: remote('c') }
    );
    expect(none.publisherFeed!.remoteItems[1]).not.toHaveProperty('rel');
    expect(mixed.publisherFeed!.remoteItems[2]).not.toHaveProperty('rel');
  });
});

describe('feedReducer feed check', () => {
  const imported = (): Album => ({
    ...albumWith([ALBUM_PUB_DATE, ALBUM_PUB_DATE]),
    imageUrl: 'https://example.com/art.jpg',
    tracks: albumWith([ALBUM_PUB_DATE, ALBUM_PUB_DATE]).tracks.map((t, i) => ({ ...t, enclosureUrl: `https://example.com/${i}.mp3` }))
  });
  const finding: FeedIssue = { code: 'transcripts-multiple', level: 'should', area: 'tracks', message: 'two transcripts', itemIndex: 1 };

  const openAfterImport = () => {
    const state = feedReducer(makeState(createEmptyAlbum()), { type: 'SET_ALBUM', payload: imported() });
    return feedReducer(state, { type: 'OPEN_FEED_CHECK', payload: { sourceFindings: [finding] } });
  };

  it('opens, binds findings to tracks by document order, and starts a link run', () => {
    const state = openAfterImport();
    expect(state.feedCheck.open).toBe(true);
    expect(state.feedCheck.feedType).toBe('album');
    expect(state.feedCheck.sourceFindings[0].trackId).toBe(state.album.tracks[1].id);
    expect(state.feedCheck.linkRun?.id).toBe(1);
    expect(state.feedCheck.linkRun?.targets.map(t => t.url)).toEqual([
      'https://example.com/art.jpg', 'https://example.com/0.mp3', 'https://example.com/1.mp3'
    ]);
  });

  it('checks at most LINK_CHECK_LIMIT links in one run', () => {
    const big = { ...imported(), tracks: Array.from({ length: 150 }, (_, i) => ({ ...createEmptyTrack(i + 1), enclosureUrl: `https://example.com/${i}.mp3` })) };
    const state = feedReducer(feedReducer(makeState(createEmptyAlbum()), { type: 'SET_ALBUM', payload: big }), { type: 'OPEN_FEED_CHECK' });
    expect(state.feedCheck.linkRun?.targets).toHaveLength(LINK_CHECK_LIMIT);
    expect(state.feedCheck.linkRun?.targets[0].url).toBe('https://example.com/art.jpg');
  });

  it('keeps findings and results when closed and reopened', () => {
    let state = openAfterImport();
    state = feedReducer(state, { type: 'LINK_CHECK_RESULT', payload: { runId: 1, url: 'https://example.com/0.mp3', result: { status: 'broken' } } });
    state = feedReducer(state, { type: 'CLOSE_FEED_CHECK' });
    expect(state.feedCheck.open).toBe(false);
    state = feedReducer(state, { type: 'OPEN_FEED_CHECK' });
    expect(state.feedCheck.linkRun?.id).toBe(1);
    expect(state.feedCheck.links['https://example.com/0.mp3']).toEqual({ status: 'broken' });
    expect(state.feedCheck.sourceFindings).toHaveLength(1);
  });

  it('ignores a result from an earlier run', () => {
    let state = openAfterImport();
    state = feedReducer(state, { type: 'RUN_LINK_CHECK' });
    expect(state.feedCheck.linkRun?.id).toBe(2);
    const stale = feedReducer(state, { type: 'LINK_CHECK_RESULT', payload: { runId: 1, url: 'https://example.com/0.mp3', result: { status: 'broken' } } });
    expect(stale).toBe(state);
  });

  it('Check again clears the previous results', () => {
    let state = openAfterImport();
    state = feedReducer(state, { type: 'LINK_CHECK_RESULT', payload: { runId: 1, url: 'https://example.com/0.mp3', result: { status: 'ok' } } });
    state = feedReducer(state, { type: 'RUN_LINK_CHECK' });
    expect(state.feedCheck.links).toEqual({});
  });

  it('resets on every whole-feed swap but never reuses a run id', () => {
    const swaps = [
      { type: 'SET_ALBUM' as const, payload: imported() },
      { type: 'SET_VIDEO_FEED' as const, payload: imported() },
      { type: 'SET_PUBLISHER_FEED' as const, payload: createEmptyPublisherFeed() },
      { type: 'CREATE_NEW_VIDEO_FEED' as const },
      { type: 'CREATE_NEW_PUBLISHER_FEED' as const },
      { type: 'RESET' as const }
    ];
    for (const swap of swaps) {
      const state = feedReducer(openAfterImport(), swap);
      expect(state.feedCheck).toEqual({ ...emptyFeedCheck(), runSeq: 1 });
    }
    const reopened = feedReducer(feedReducer(openAfterImport(), { type: 'RESET' }), { type: 'OPEN_FEED_CHECK' });
    expect(reopened.feedCheck.linkRun?.id).toBe(2);
  });

  it('drops the findings and checks again after a switch to another feed type', () => {
    let state = openAfterImport();
    state = feedReducer(state, { type: 'SET_FEED_TYPE', payload: 'publisher' });
    state = feedReducer({ ...state, publisherFeed: createEmptyPublisherFeed() }, { type: 'OPEN_FEED_CHECK' });
    expect(state.feedCheck.feedType).toBe('publisher');
    expect(state.feedCheck.sourceFindings).toEqual([]);
    expect(state.feedCheck.linkRun?.id).toBe(2);
  });
});
