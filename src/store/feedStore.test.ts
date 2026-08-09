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

import { feedReducer } from './feedStore';
import type { FeedState } from './feedStore';
import { createEmptyAlbum, createEmptyTrack } from '../types/feed';
import type { Album } from '../types/feed';

const ALBUM_PUB_DATE = 'Sat, 01 Feb 2025 00:00:00 GMT';

const makeState = (album: Album): FeedState => ({
  feedType: 'album',
  album,
  videoFeed: null,
  publisherFeed: null,
  isDirty: false,
  publisherFeedInstance: 0
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
