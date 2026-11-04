import { describe, it, expect } from 'vitest';
import { parseAttachment, isMediaLibraryAvailable } from './mediaLibrary';

describe('parseAttachment', () => {
  it('reads an audio attachment as WordPress describes it', () => {
    expect(parseAttachment({
      url: 'https://artist.example/wp-content/uploads/2026/11/song.mp3',
      mime: 'audio/mpeg',
      filesizeInBytes: 5242880,
      fileLength: '3:45',
      meta: { length: 225 },
    })).toEqual({
      url: 'https://artist.example/wp-content/uploads/2026/11/song.mp3',
      mime: 'audio/mpeg',
      bytes: 5242880,
      durationSeconds: 225,
      width: undefined,
      height: undefined,
    });
  });

  it('falls back to fileLength when meta has no length, hours included', () => {
    expect(parseAttachment({ url: 'https://a.example/x.mp4', fileLength: '1:02:03' })?.durationSeconds).toBe(3723);
  });

  it('reads image dimensions', () => {
    const img = parseAttachment({ url: 'https://a.example/cover.jpg', mime: 'image/jpeg', width: 3000, height: '3000' });
    expect(img?.width).toBe(3000);
    expect(img?.height).toBe(3000);
  });

  it('leaves out values WordPress does not know', () => {
    const p = parseAttachment({ url: 'https://a.example/x.flac', filesizeInBytes: '', fileLength: 'n/a', meta: null });
    expect(p?.bytes).toBeUndefined();
    expect(p?.durationSeconds).toBeUndefined();
    expect(p?.mime).toBe('');
  });

  it('refuses an attachment without a web URL', () => {
    expect(parseAttachment({})).toBeNull();
    expect(parseAttachment({ url: 'javascript:alert(1)' })).toBeNull();
  });
});

describe('isMediaLibraryAvailable', () => {
  it('is false outside the WordPress build', () => {
    expect(isMediaLibraryAvailable()).toBe(false);
  });
});
