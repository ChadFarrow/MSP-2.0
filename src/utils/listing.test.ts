import { describe, it, expect } from 'vitest';
import { generateRssFeed, generatePublisherRssFeed } from './xmlGenerator';
import { parseRssFeed, parsePublisherRssFeed } from './xmlParser';
import { listingFlags, listingOf } from './listing';
import { createEmptyAlbum, createEmptyPublisherFeed } from '../types/feed';

const albumFeed = (blocks: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Album</title>
    <description>d</description>
    <podcast:medium>music</podcast:medium>
    ${blocks}
  </channel>
</rss>`;

const count = (xml: string, re: RegExp) => (xml.match(re) || []).length;

describe('listing choices', () => {
  it('maps each choice to its tags', () => {
    expect(listingFlags('listed')).toEqual({ itunesBlock: false, podcastBlock: false });
    expect(listingFlags('directories')).toEqual({ itunesBlock: true, podcastBlock: false });
    expect(listingFlags('everywhere')).toEqual({ itunesBlock: true, podcastBlock: true });
  });

  it('reads each combination of tags back as its choice', () => {
    expect(listingOf({})).toBe('listed');
    expect(listingOf({ itunesBlock: true })).toBe('directories');
    expect(listingOf({ itunesBlock: true, podcastBlock: true })).toBe('everywhere');
    expect(listingOf({ podcastBlock: true })).toBe('custom');
  });
});

describe('generating the block tags', () => {
  const albumWith = (listing: 'listed' | 'directories' | 'everywhere') => {
    const album = createEmptyAlbum();
    album.title = 'Album';
    Object.assign(album, listingFlags(listing));
    return generateRssFeed(album);
  };

  it('writes no tag for "Listed"', () => {
    const xml = albumWith('listed');
    expect(xml).not.toContain('itunes:block');
    expect(xml).not.toContain('podcast:block');
  });

  it('writes only itunes:block for "Hidden from podcast directories"', () => {
    const xml = albumWith('directories');
    expect(xml).toContain('<itunes:block>Yes</itunes:block>');
    expect(xml).not.toContain('podcast:block');
  });

  it('writes both tags for "Hidden everywhere"', () => {
    const xml = albumWith('everywhere');
    expect(xml).toContain('<itunes:block>Yes</itunes:block>');
    expect(xml).toContain('<podcast:block>yes</podcast:block>');
  });
});

describe('parsing the block tags', () => {
  it('reads "Yes" in any case, and nothing else, as an itunes:block', () => {
    expect(parseRssFeed(albumFeed('<itunes:block>Yes</itunes:block>')).itunesBlock).toBe(true);
    expect(parseRssFeed(albumFeed('<itunes:block>yes</itunes:block>')).itunesBlock).toBe(true);
    expect(parseRssFeed(albumFeed('<itunes:block>No</itunes:block>')).itunesBlock).toBe(false);
    expect(parseRssFeed(albumFeed('')).itunesBlock).toBe(false);
  });

  it('reads only a plain podcast:block as podcastBlock, not one that names a service', () => {
    expect(parseRssFeed(albumFeed('<podcast:block>yes</podcast:block>')).podcastBlock).toBe(true);
    expect(parseRssFeed(albumFeed('<podcast:block>no</podcast:block>')).podcastBlock).toBe(false);
    expect(parseRssFeed(albumFeed('<podcast:block id="spotify">yes</podcast:block>')).podcastBlock).toBe(false);
  });
});

describe('parse/regenerate keeps each tag exactly once', () => {
  it('keeps one itunes:block and one plain podcast:block', () => {
    const source = albumFeed('<itunes:block>Yes</itunes:block>\n<podcast:block>yes</podcast:block>');
    const xml = generateRssFeed(parseRssFeed(source));

    expect(count(xml, /<itunes:block>/g)).toBe(1);
    expect(count(xml, /<podcast:block>yes<\/podcast:block>/g)).toBe(1);
  });

  it('passes a block that names a service through untouched, next to the plain one', () => {
    const source = albumFeed(
      '<podcast:block>yes</podcast:block>\n<podcast:block id="spotify">yes</podcast:block>'
    );
    const xml = generateRssFeed(parseRssFeed(source));

    expect(count(xml, /<podcast:block>yes<\/podcast:block>/g)).toBe(1);
    expect(count(xml, /<podcast:block id="spotify">yes<\/podcast:block>/g)).toBe(1);
  });

  it('keeps a named block when there is no plain one', () => {
    const source = albumFeed('<podcast:block id="musicindex">no</podcast:block>');
    const xml = generateRssFeed(parseRssFeed(source));

    expect(xml).toContain('<podcast:block id="musicindex">no</podcast:block>');
  });
});

describe('publisher feeds', () => {
  it('round-trip both tags through the publisher parser', () => {
    const feed = createEmptyPublisherFeed();
    feed.title = 'Some Label';
    Object.assign(feed, listingFlags('everywhere'));

    const reparsed = parsePublisherRssFeed(generatePublisherRssFeed(feed));

    expect(listingOf(reparsed)).toBe('everywhere');
  });

  it('do not write the plain podcast:block twice after a parse/regenerate', () => {
    const feed = createEmptyPublisherFeed();
    feed.title = 'Some Label';
    Object.assign(feed, listingFlags('everywhere'));

    const xml = generatePublisherRssFeed(parsePublisherRssFeed(generatePublisherRssFeed(feed)));

    expect(count(xml, /<podcast:block>yes<\/podcast:block>/g)).toBe(1);
  });
});
