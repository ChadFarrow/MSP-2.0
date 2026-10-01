import { describe, it, expect } from 'vitest';
import { generateRssFeed, generatePublisherRssFeed } from './xmlGenerator';
import { parseRssFeed, parsePublisherRssFeed } from './xmlParser';
import { createEmptyAlbum, createEmptyPublisherFeed } from '../types/feed';

const albumFeed = (block: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Album</title>
    <description>d</description>
    <podcast:medium>music</podcast:medium>
    ${block}
  </channel>
</rss>`;

describe('itunes:block on an album', () => {
  it('writes the tag when the switch is on', () => {
    const album = createEmptyAlbum();
    album.title = 'Album';
    album.itunesBlock = true;

    expect(generateRssFeed(album)).toContain('<itunes:block>Yes</itunes:block>');
  });

  it('writes no tag when the switch is off or was never set', () => {
    const album = createEmptyAlbum();
    album.title = 'Album';

    expect(generateRssFeed(album)).not.toContain('itunes:block');
    album.itunesBlock = false;
    expect(generateRssFeed(album)).not.toContain('itunes:block');
  });

  it('reads "Yes" in any case as on', () => {
    expect(parseRssFeed(albumFeed('<itunes:block>Yes</itunes:block>')).itunesBlock).toBe(true);
    expect(parseRssFeed(albumFeed('<itunes:block>yes</itunes:block>')).itunesBlock).toBe(true);
  });

  it('reads any other value as off, as Apple does', () => {
    expect(parseRssFeed(albumFeed('<itunes:block>No</itunes:block>')).itunesBlock).toBe(false);
    expect(parseRssFeed(albumFeed('')).itunesBlock).toBe(false);
  });

  it('keeps exactly one tag through a parse/regenerate cycle', () => {
    // itunes:block used to round-trip as an unknown channel element. Now that it
    // is modelled it must not also pass through, or the file gets two tags.
    const regenerated = generateRssFeed(parseRssFeed(albumFeed('<itunes:block>Yes</itunes:block>')));

    expect(regenerated.match(/<itunes:block>/g)).toHaveLength(1);
  });
});

describe('itunes:block on a publisher feed', () => {
  it('round-trips through the publisher parser', () => {
    const feed = createEmptyPublisherFeed();
    feed.title = 'Some Label';
    feed.itunesBlock = true;

    const xml = generatePublisherRssFeed(feed);

    expect(xml).toContain('<itunes:block>Yes</itunes:block>');
    expect(parsePublisherRssFeed(xml).itunesBlock).toBe(true);
  });
});
