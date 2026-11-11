import { describe, it, expect } from 'vitest';
import { createEmptyTrack } from '../types/feed';
import { orderFiles, planTracksFromFiles, trackFieldsFromFile } from './bulkTracks';
import type { PickedMedia } from './mediaLibrary';

const file = (n: number, extra: Partial<PickedMedia> = {}): PickedMedia => ({
  url: `https://artist.example/wp-content/uploads/2026/11/song-${n}.mp3`,
  mime: 'audio/mpeg',
  bytes: 1000 * n,
  durationSeconds: 60 * n,
  title: `Song ${n}`,
  ...extra,
});

describe('orderFiles', () => {
  it('sorts by the tags’ track numbers when every file has a distinct one', () => {
    const files = [file(3, { trackNumber: 3 }), file(1, { trackNumber: 1 }), file(2, { trackNumber: 2 })];
    expect(orderFiles(files).map((f) => f.title)).toEqual(['Song 1', 'Song 2', 'Song 3']);
  });

  it('keeps the picked order when a number is missing or repeated', () => {
    const missing = [file(2, { trackNumber: 2 }), file(1)];
    expect(orderFiles(missing).map((f) => f.title)).toEqual(['Song 2', 'Song 1']);
    const repeated = [file(2, { trackNumber: 1 }), file(1, { trackNumber: 1 })];
    expect(orderFiles(repeated).map((f) => f.title)).toEqual(['Song 2', 'Song 1']);
  });
});

describe('trackFieldsFromFile', () => {
  it('maps what WordPress knows onto the track', () => {
    expect(trackFieldsFromFile(file(4), false)).toEqual({
      title: 'Song 4',
      enclosureUrl: 'https://artist.example/wp-content/uploads/2026/11/song-4.mp3',
      enclosureType: 'audio/mpeg',
      enclosureLength: '4000',
      duration: '00:04:00',
    });
  });

  it('names the track from the file when it has no title, and leaves unknowns empty', () => {
    const f = trackFieldsFromFile({ url: 'https://a.example/up/My_Big-Song.flac', mime: '' }, false);
    expect(f.title).toBe('My Big Song');
    expect(f.enclosureType).toBe('audio/flac');
    expect(f.enclosureLength).toBe('');
    expect(f.duration).toBe('');
  });
});

describe('trackFieldsFromFile for one track', () => {
  it('keeps the track title but drops the old file’s size and length', () => {
    const track = { ...createEmptyTrack(1), title: 'My Name For It', enclosureUrl: 'https://a.example/old.mp3', enclosureLength: '999', duration: '00:09:59' };
    const f = trackFieldsFromFile({ url: 'https://a.example/new.mp3', mime: 'audio/mpeg', title: 'Tag Title' }, false, track);
    expect(f.title).toBeUndefined();
    expect(f).toMatchObject({ enclosureUrl: 'https://a.example/new.mp3', enclosureLength: '', duration: '' });
  });

  it('takes the file title when the track has none', () => {
    expect(trackFieldsFromFile(file(2), false, createEmptyTrack(1)).title).toBe('Song 2');
  });
});

describe('planTracksFromFiles', () => {
  it('fills the blank first track of a new album, then appends the rest', () => {
    const plan = planTracksFromFiles([createEmptyTrack(1)], [file(1), file(2), file(3)], false);
    expect(plan.fill).toEqual([{ index: 0, track: expect.objectContaining({ title: 'Song 1' }) }]);
    expect(plan.add.map((t) => [t.trackNumber, t.title])).toEqual([[2, 'Song 2'], [3, 'Song 3']]);
    expect(new Set(plan.add.map((t) => t.guid)).size).toBe(2);
  });

  it('never overwrites a track that has a title or a file', () => {
    const named = { ...createEmptyTrack(1), title: 'Intro' };
    const withFile = { ...createEmptyTrack(2), enclosureUrl: 'https://a.example/x.mp3' };
    const plan = planTracksFromFiles([named, withFile], [file(1)], false);
    expect(plan.fill).toEqual([]);
    expect(plan.add.map((t) => t.trackNumber)).toEqual([3]);
  });

  it('uses video types in a video feed', () => {
    const plan = planTracksFromFiles([], [{ url: 'https://a.example/clip.mp4', mime: '' }], true);
    expect(plan.add[0].enclosureType).toBe('video/mp4');
  });
});
