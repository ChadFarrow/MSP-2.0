import { describe, it, expect } from 'vitest';
import { fromParties, publisherParties, samePublisher, withPublisherParty, withRel } from './publisherParties';
import { generateRssFeed } from './xmlGenerator';
import { parseRssFeed } from './xmlParser';
import { createEmptyAlbum } from '../types/feed';
import type { PublisherReference } from '../types/feed';

const party = (feedGuid: string, rel?: string): PublisherReference => ({
  feedGuid,
  feedUrl: `https://example.com/${feedGuid}.xml`,
  ...(rel === undefined ? {} : { rel })
});

// An album released by a label and credited to its artist: two parties
// inside one <podcast:publisher>, primary first (podcast-namespace PR #793).
const twoPartyAlbum = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Drift</title>
    <description>d</description>
    <podcast:medium>music</podcast:medium>
    <podcast:publisher>
      <podcast:remoteItem medium="publisher" rel="artist" feedGuid="artist-guid" feedUrl="https://example.com/artist-guid.xml" />
      <podcast:remoteItem medium="publisher" rel="label" feedGuid="label-guid" feedUrl="https://example.com/label-guid.xml" />
    </podcast:publisher>
  </channel>
</rss>`;

describe('publisherParties', () => {
  it('is empty for an album that names no publisher', () => {
    expect(publisherParties(createEmptyAlbum())).toEqual([]);
  });

  it('gives the primary party first, then the others in order', () => {
    expect(
      publisherParties({ publisher: party('a'), additionalPublishers: [party('b'), party('c')] })
    ).toEqual([party('a'), party('b'), party('c')]);
  });

  it('splits a list back into the two fields', () => {
    expect(fromParties([party('a')])).toEqual({ publisher: party('a'), additionalPublishers: undefined });
    expect(fromParties([party('a'), party('b')])).toEqual({
      publisher: party('a'),
      additionalPublishers: [party('b')],
    });
  });
});

describe('samePublisher', () => {
  it('matches on feedGuid when both have one', () => {
    expect(samePublisher(party('a'), { feedGuid: 'a' })).toBe(true);
    expect(samePublisher(party('a'), party('b'))).toBe(false);
  });

  it('matches on feedUrl when a feedGuid is missing', () => {
    expect(samePublisher({ feedGuid: '', feedUrl: 'https://example.com/a.xml' }, party('a'))).toBe(true);
  });
});

describe('withPublisherParty', () => {
  it('makes the party primary when the album names none', () => {
    expect(withPublisherParty({}, party('label', 'label'))).toEqual({
      publisher: party('label', 'label'),
      additionalPublishers: undefined,
    });
  });

  it('keeps the existing primary party and adds the new one after it', () => {
    // The label publishes its catalog. The album already names its artist.
    expect(withPublisherParty({ publisher: party('artist', 'artist') }, party('label', 'label'))).toEqual({
      publisher: party('artist', 'artist'),
      additionalPublishers: [party('label', 'label')],
    });
  });

  it('updates the same publisher in place, and keeps its position', () => {
    const album = { publisher: party('artist', 'artist'), additionalPublishers: [party('label')] };
    expect(withPublisherParty(album, party('label', 'label'))).toEqual({
      publisher: party('artist', 'artist'),
      additionalPublishers: [party('label', 'label')],
    });
  });
});

describe('several parties in <podcast:publisher>', () => {
  it('keeps every party of a third-party album through a parse/regenerate cycle', () => {
    // Download Feed and processCatalogFeed are parse→regenerate over someone
    // else's feed. Before this change, only the first party survived.
    const album = parseRssFeed(twoPartyAlbum);
    expect(publisherParties(album)).toEqual([party('artist-guid', 'artist'), party('label-guid', 'label')]);

    const regenerated = parseRssFeed(generateRssFeed(album));
    expect(publisherParties(regenerated)).toEqual([party('artist-guid', 'artist'), party('label-guid', 'label')]);
  });

  it('writes the parties inside one <podcast:publisher>, primary first', () => {
    const album = createEmptyAlbum();
    album.title = 'Drift';
    album.publisher = party('artist-guid', 'artist');
    album.additionalPublishers = [party('label-guid', 'label')];

    const xml = generateRssFeed(album);
    expect(xml.match(/<podcast:publisher>/g)).toHaveLength(1);
    const artistAt = xml.indexOf('feedGuid="artist-guid"');
    const labelAt = xml.indexOf('feedGuid="label-guid"');
    expect(artistAt).toBeGreaterThan(-1);
    expect(labelAt).toBeGreaterThan(artistAt);
  });

  it('a publish by the label keeps the artist that the album already names', () => {
    // The flow that publishPublisherFeed and Download Catalog run for each album.
    const album = parseRssFeed(twoPartyAlbum);
    Object.assign(album, withPublisherParty(album, party('label-guid', 'label')));
    expect(publisherParties(parseRssFeed(generateRssFeed(album)))).toEqual([
      party('artist-guid', 'artist'),
      party('label-guid', 'label'),
    ]);
  });
});

describe('withRel', () => {
  it('sets the role, and removes it for "Not stated" rather than writing an empty value', () => {
    expect(withRel(party('a'), 'label')).toEqual(party('a', 'label'));
    expect(withRel(party('a', 'label'), '')).not.toHaveProperty('rel');
  });
});
