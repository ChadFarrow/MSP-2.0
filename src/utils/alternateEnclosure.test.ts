import { describe, it, expect } from 'vitest';
import { parseRssFeed } from './xmlParser';
import { generateRssFeed } from './xmlGenerator';
import { createEmptyAlbum, createEmptyTrack } from '../types/feed';
import type { AlternateEnclosure } from '../types/feed';

function feedWithItem(itemExtras: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Test Feed</title>
    <itunes:author>Test Artist</itunes:author>
    <description>A test feed</description>
    <language>en</language>
    <podcast:medium>music</podcast:medium>
    <item>
      <title>Track 1</title>
      <guid isPermaLink="false">track-guid-1</guid>
      <enclosure url="https://example.com/1.mp3" length="5000000" type="audio/mpeg"/>
      <itunes:duration>03:45</itunes:duration>
      ${itemExtras}
    </item>
  </channel>
</rss>`;
}

const THREE_VERSIONS = `
      <podcast:alternateEnclosure type="audio/mpeg" length="5000000" default="true">
        <podcast:source uri="https://example.com/1.mp3" />
      </podcast:alternateEnclosure>
      <podcast:alternateEnclosure type="video/mp4" length="58390859" height="1080" title="Music Video" rel="video">
        <podcast:source uri="https://example.com/1.mp4" />
        <podcast:source uri="ipfs://bafyexample" contentType="video/mp4" />
        <podcast:integrity type="sri" value="sha384-abc" />
      </podcast:alternateEnclosure>
      <podcast:alternateEnclosure type="audio/flac" bitrate="1411200" title="Lossless" lang="en-US" codecs="flac">
        <podcast:source uri="https://example.com/1.flac" />
        <podcast:integrity type="pgp-signature" value="-----BEGIN PGP SIGNATURE-----" />
      </podcast:alternateEnclosure>`;

// Ids are minted fresh on every parse, so compare everything else.
const strip = (encs: AlternateEnclosure[] | undefined) => (encs || []).map(enc => ({ ...enc, id: '' }));

describe('podcast:alternateEnclosure', () => {
  it('parses every version on an item, with all its sources', () => {
    const encs = parseRssFeed(feedWithItem(THREE_VERSIONS)).tracks[0].alternateEnclosures!;
    expect(encs).toHaveLength(3);
    expect(encs[0]).toMatchObject({ type: 'audio/mpeg', default: true });
    expect(encs[1]).toMatchObject({
      type: 'video/mp4', length: '58390859', height: '1080', title: 'Music Video', rel: 'video',
      sources: [{ uri: 'https://example.com/1.mp4' }, { uri: 'ipfs://bafyexample', contentType: 'video/mp4' }],
    });
    expect(encs[2]).toMatchObject({
      type: 'audio/flac', bitrate: '1411200', lang: 'en-US', codecs: 'flac',
    });
    expect(new Set(encs.map(e => e.id)).size).toBe(3);
  });

  it('round-trips several versions unchanged', () => {
    const first = parseRssFeed(feedWithItem(THREE_VERSIONS));
    const again = parseRssFeed(generateRssFeed(first));
    expect(strip(again.tracks[0].alternateEnclosures)).toEqual(strip(first.tracks[0].alternateEnclosures));
  });

  it('is not also passed through as an unknown element', () => {
    const xml = generateRssFeed(parseRssFeed(feedWithItem(THREE_VERSIONS)));
    expect(xml.match(/<podcast:alternateEnclosure /g)).toHaveLength(3);
  });

  it('leaves out a version whose own URL is blank, even if it has other addresses', () => {
    // The editor shows only the first source. Writing the version from a hidden
    // mirror would publish an address the user can't see or change.
    const album = createEmptyAlbum();
    const track = createEmptyTrack(1);
    track.alternateEnclosures = [{
      id: 'a', type: 'audio/flac',
      sources: [{ uri: '  ' }, { uri: 'ipfs://bafymirror' }],
    }];
    album.tracks = [track];
    expect(generateRssFeed(album)).not.toContain('podcast:alternateEnclosure');
  });

  it('keeps every integrity element and unknown child unchanged', () => {
    const xml = generateRssFeed(parseRssFeed(feedWithItem(`
      <podcast:alternateEnclosure type="audio/flac">
        <podcast:source uri="https://example.com/1.flac" />
        <podcast:integrity type="sri" value="sha384-abc" />
        <podcast:integrity type="blake3" value="b3-def" />
        <podcast:future note="1" />
      </podcast:alternateEnclosure>`)));
    expect(xml).toContain('<podcast:integrity type="sri" value="sha384-abc" />');
    expect(xml).toContain('<podcast:integrity type="blake3" value="b3-def" />');
    expect(xml).toContain('<podcast:future note="1" />');
  });

  it('declares the namespace of a carried-through child', () => {
    const source = feedWithItem(`
      <podcast:alternateEnclosure type="audio/flac">
        <podcast:source uri="https://example.com/1.flac" />
        <media:hash algo="md5">abc</media:hash>
      </podcast:alternateEnclosure>`).replace('<rss ', '<rss xmlns:media="http://search.yahoo.com/mrss/" ');
    const xml = generateRssFeed(parseRssFeed(source));
    expect(xml).toContain('<media:hash algo="md5">abc</media:hash>');
    expect(xml).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
  });

  it('writes back a version it cannot read, once, and does not offer it for editing', () => {
    const album = parseRssFeed(feedWithItem(`
      <podcast:alternateEnclosure length="1"><podcast:source uri="https://example.com/no-type.flac" /></podcast:alternateEnclosure>
      <podcast:alternateEnclosure type="audio/flac" length="2" />
      <podcast:alternateEnclosure type="audio/flac"><podcast:source uri="https://example.com/ok.flac" /></podcast:alternateEnclosure>`));
    expect(album.tracks[0].alternateEnclosures!.map(e => e.sources[0].uri)).toEqual(['https://example.com/ok.flac']);
    const xml = generateRssFeed(album);
    expect(xml.match(/<podcast:alternateEnclosure[ >]/g)).toHaveLength(3);
    expect(xml).toContain('<podcast:source uri="https://example.com/no-type.flac" />');
    expect(xml).toContain('<podcast:alternateEnclosure type="audio/flac" length="2" />');
    // A second round trip changes nothing.
    expect(generateRssFeed(parseRssFeed(xml))).toBe(xml);
  });

  it('leaves out a version with no address at all', () => {
    const album = createEmptyAlbum();
    const track = createEmptyTrack(1);
    track.alternateEnclosures = [{ id: 'a', type: 'video/mp4', sources: [{ uri: '' }] }];
    album.tracks = [track];
    expect(generateRssFeed(album)).not.toContain('podcast:alternateEnclosure');
  });

  it('escapes attribute values', () => {
    const album = createEmptyAlbum();
    const track = createEmptyTrack(1);
    track.alternateEnclosures = [{
      id: 'a', type: 'video/mp4', title: 'A "B" & C',
      sources: [{ uri: 'https://example.com/v.mp4?a=1&b=2' }],
    }];
    album.tracks = [track];
    const xml = generateRssFeed(album);
    expect(xml).toContain('title="A &quot;B&quot; &amp; C"');
    expect(xml).toContain('uri="https://example.com/v.mp4?a=1&amp;b=2"');
  });
});

describe('podcast:alternateEnclosure with OP3', () => {
  const OLD_GUID = '11111111-1111-4111-8111-111111111111';
  const NEW_GUID = '22222222-2222-4222-8222-222222222222';
  const op3Feed = feedWithItem(`
      <podcast:alternateEnclosure type="audio/flac">
        <podcast:source uri="https://op3.dev/e,pg=${OLD_GUID}/example.com/1.flac" />
        <podcast:source uri="ipfs://bafymirror" />
      </podcast:alternateEnclosure>`)
    .replace('https://example.com/1.mp3', `https://op3.dev/e,pg=${OLD_GUID}/example.com/1.mp3`);

  it('strips the prefix from alternate sources on import', () => {
    const album = parseRssFeed(op3Feed);
    expect(album.op3).toBe(true);
    expect(album.tracks[0].alternateEnclosures![0].sources.map(s => s.uri)).toEqual(['https://example.com/1.flac', 'ipfs://bafymirror']);
  });

  it('prefixes web sources with the current GUID when OP3 is on, and none when it is off', () => {
    const album = parseRssFeed(op3Feed);
    album.podcastGuid = NEW_GUID; // as a template does
    const on = generateRssFeed(album);
    expect(on).toContain(`<podcast:source uri="https://op3.dev/e,pg=${NEW_GUID}/example.com/1.flac" />`);
    expect(on).toContain('<podcast:source uri="ipfs://bafymirror" />');
    expect(on).not.toContain(OLD_GUID);
    const off = generateRssFeed({ ...album, op3: false });
    expect(off).toContain('<podcast:source uri="https://example.com/1.flac" />');
    expect(off).not.toContain('op3.dev');
  });
});
