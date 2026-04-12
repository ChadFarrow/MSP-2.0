import { describe, it, expect } from 'vitest';
import { parseNostrMusicEvent } from './nostrMusicConverter';
import type { NostrEvent } from '../types/nostr';

function buildTrackEvent(overrides: { tags?: string[][]; content?: string } = {}): NostrEvent {
  const baseTags: string[][] = [
    ['d', 'track-guid-1'],
    ['title', 'Test Track'],
    ['url', 'https://example.com/track.mp3'],
    ['artist', 'Test Artist'],
    ['album', 'Test Album'],
    ['track_number', '1'],
  ];
  return {
    kind: 36787,
    pubkey: 'abc123',
    created_at: 1700000000,
    tags: overrides.tags ? [...baseTags, ...overrides.tags] : baseTags,
    content: overrides.content || '',
    id: 'evt1',
  };
}

describe('parseNostrMusicEvent', () => {
  it('returns null when required tags are missing', () => {
    const event: NostrEvent = {
      kind: 36787,
      pubkey: 'abc',
      created_at: 0,
      tags: [['d', 'id'], ['title', 'T']],
      content: '',
    };
    expect(parseNostrMusicEvent(event)).toBeNull();
  });

  describe('duration parsing', () => {
    it('parses a valid numeric duration', () => {
      const result = parseNostrMusicEvent(buildTrackEvent({ tags: [['duration', '225']] }));
      expect(result?.duration).toBe('225');
    });

    it('rejects non-numeric duration', () => {
      const result = parseNostrMusicEvent(buildTrackEvent({ tags: [['duration', 'garbage']] }));
      expect(result?.duration).toBeUndefined();
    });

    it('rejects duration with decimals', () => {
      const result = parseNostrMusicEvent(buildTrackEvent({ tags: [['duration', '3.5']] }));
      expect(result?.duration).toBeUndefined();
    });

    it('omits duration when tag is absent', () => {
      const result = parseNostrMusicEvent(buildTrackEvent());
      expect(result?.duration).toBeUndefined();
    });
  });

  describe('explicit parsing', () => {
    it('parses explicit=true', () => {
      const result = parseNostrMusicEvent(buildTrackEvent({ tags: [['explicit', 'true']] }));
      expect(result?.explicit).toBe(true);
    });

    it('ignores explicit when value is not "true"', () => {
      const result = parseNostrMusicEvent(buildTrackEvent({ tags: [['explicit', 'false']] }));
      expect(result?.explicit).toBeUndefined();
    });

    it('omits explicit when tag is absent', () => {
      const result = parseNostrMusicEvent(buildTrackEvent());
      expect(result?.explicit).toBeUndefined();
    });
  });

  describe('genre filtering', () => {
    it('excludes the "music" discriminator from genres', () => {
      const result = parseNostrMusicEvent(buildTrackEvent({
        tags: [['t', 'music'], ['t', 'rock'], ['t', 'indie']],
      }));
      expect(result?.genres).toEqual(['rock', 'indie']);
    });

    it('returns empty genres when only "music" tag exists', () => {
      const result = parseNostrMusicEvent(buildTrackEvent({ tags: [['t', 'music']] }));
      expect(result?.genres).toEqual([]);
    });
  });
});
