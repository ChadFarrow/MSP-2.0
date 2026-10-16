import { describe, it, expect, vi } from 'vitest';
import { parseRssFeed, migrateStoredAlternateEnclosures } from './xmlParser';
import { albumStorage, videoStorage } from './storage';
import { generateRssFeed } from './xmlGenerator';
import { urlChange, createSizeMeasurer } from './alternateEnclosure';
import { createEmptyAlbum, createEmptyTrack } from '../types/feed';
import type { AlternateEnclosure, Track } from '../types/feed';

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

describe('alternate versions saved in localStorage', () => {
  // How master stored <podcast:alternateEnclosure> while it was not modelled:
  // the fast-xml-parser node, verbatim, in unknownItemElements.
  const storedTrack = (): Track => ({
    ...createEmptyTrack(1),
    enclosureUrl: 'https://example.com/1.mp3',
    unknownItemElements: {
      'podcast:alternateEnclosure': [
        { '@_type': 'audio/flac', '@_title': 'Lossless', 'podcast:source': { '@_uri': 'https://op3.dev/e/example.com/1.flac' } },
        { '@_length': '1', 'podcast:source': { '@_uri': 'https://example.com/no-type.flac' } },
      ],
      'podcast:chapters': { '@_url': 'https://example.com/ch.json', '@_type': 'application/json+chapters' },
    },
  });

  it('moves stored versions into the editable list and keeps the rest', () => {
    const track = migrateStoredAlternateEnclosures(storedTrack());
    expect(track.alternateEnclosures).toHaveLength(1);
    expect(track.alternateEnclosures![0]).toMatchObject({ type: 'audio/flac', title: 'Lossless', sources: [{ uri: 'https://example.com/1.flac' }] });
    expect(track.alternateEnclosures![0].id).toEqual(expect.any(String));
    expect(Object.keys(track.unknownItemElements!)).toEqual(['podcast:alternateEnclosure', 'podcast:chapters']);
    expect(track.unknownItemElements!['podcast:alternateEnclosure']).toMatchObject({ '@_length': '1' });

    const album = createEmptyAlbum();
    album.tracks = [track];
    const xml = generateRssFeed(album);
    expect(xml.match(/<podcast:alternateEnclosure[ >]/g)).toHaveLength(2);
  });

  it('changes nothing on a second run', () => {
    const once = migrateStoredAlternateEnclosures(storedTrack());
    const twice = migrateStoredAlternateEnclosures(structuredClone(once));
    expect(twice).toEqual(once);
  });

  it('gives a version an id if it has none, and keeps a January 2026 integrity', () => {
    const track = migrateStoredAlternateEnclosures({
      ...createEmptyTrack(1),
      alternateEnclosures: [{ type: 'video/mp4', sources: [{ uri: 'https://example.com/v.mp4' }], integrity: { type: 'sri', value: 'sha384-x' } } as unknown as AlternateEnclosure],
    });
    expect(track.alternateEnclosures![0].id).toEqual(expect.any(String));
    const album = createEmptyAlbum();
    album.tracks = [track];
    expect(generateRssFeed(album)).toContain('<podcast:integrity type="sri" value="sha384-x" />');
  });

  it('runs when an album is loaded', () => {
    const stored = { ...createEmptyAlbum(), tracks: [storedTrack()] };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(stored) });
    try {
      expect(albumStorage.load()!.tracks[0].alternateEnclosures).toHaveLength(1);
      expect(videoStorage.load()!.tracks[0].alternateEnclosures).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('urlChange', () => {
  const version = (partial: Partial<AlternateEnclosure> = {}): AlternateEnclosure => ({
    id: 'v', type: 'audio/mpeg', sources: [{ uri: 'https://example.com/1.mp3' }], ...partial
  });

  it('drops what described the old file: size, source contentType and integrity', () => {
    const patch = urlChange(version({
      length: '5000000',
      sources: [{ uri: 'https://example.com/1.mp4', contentType: 'video/mp4' }, { uri: 'ipfs://bafymirror' }],
      unknownElements: { 'podcast:integrity': { '@_type': 'sri', '@_value': 'sha384-x' }, 'podcast:future': { '@_a': '1' } }
    }), 'https://example.com/1.flac');
    expect(patch).toMatchObject({ length: undefined, sources: [{ uri: 'https://example.com/1.flac' }, { uri: 'ipfs://bafymirror' }] });
    expect(patch.sources![0]).not.toHaveProperty('contentType');
    expect(patch.unknownElements).toEqual({ 'podcast:future': { '@_a': '1' } });
  });

  it('keeps all of that when only the surrounding spaces change', () => {
    const enc = version({ length: '5000000', sources: [{ uri: 'https://example.com/1.flac', contentType: 'audio/flac' }] });
    const patch = urlChange(enc, ' https://example.com/1.flac ');
    expect(patch).not.toHaveProperty('length');
    expect(patch.sources).toEqual([{ uri: ' https://example.com/1.flac ', contentType: 'audio/flac' }]);
  });

  it('sets the type from a recognized extension, until the user picks one by hand', () => {
    expect(urlChange(version(), 'https://example.com/1.flac').type).toBe('audio/flac');
    expect(urlChange(version(), 'https://example.com/stream')).not.toHaveProperty('type');
    expect(urlChange(version({ type: 'audio/mp4', typeSetByHand: true }), 'https://example.com/1.m4a')).not.toHaveProperty('type');
  });

  it('gives an audio URL an audio type even on an imported video version', () => {
    expect(urlChange(version({ type: 'video/mp4' }), 'https://example.com/1.flac').type).toBe('audio/flac');
    expect(urlChange(version({ type: 'video/mp4' }), 'https://example.com/1.webm').type).toBe('video/webm');
  });
});

describe('createSizeMeasurer', () => {
  const v = (partial: Partial<AlternateEnclosure> = {}): AlternateEnclosure => ({
    id: 'v', type: 'audio/flac', sources: [{ uri: 'https://example.com/1.flac' }], ...partial
  });

  // A HEAD request the test answers by hand.
  function setup(list: AlternateEnclosure[]) {
    const state = { list, active: true };
    const writes: [string, string][] = [];
    const requests: { url: string; answer: (size: number | null) => void }[] = [];
    const measure = createSizeMeasurer({
      latest: () => state.list,
      active: () => state.active,
      write: (id, length) => writes.push([id, length]),
      detect: url => new Promise(resolve => requests.push({ url, answer: resolve }))
    });
    return { state, writes, requests, measure };
  }

  it('writes the measured size to the version', async () => {
    const { writes, requests, measure } = setup([v()]);
    const done = measure('v', ' https://example.com/1.flac ');
    requests[0].answer(31200000);
    await done;
    expect(requests.map(r => r.url)).toEqual(['https://example.com/1.flac']);
    expect(writes).toEqual([['v', '31200000']]);
  });

  it('sends one request when paste and blur ask for the same URL', async () => {
    const { requests, measure } = setup([v()]);
    const pasted = measure('v', 'https://example.com/1.flac');
    const blurred = measure('v', 'https://example.com/1.flac');
    expect(requests).toHaveLength(1);
    requests[0].answer(1);
    await Promise.all([pasted, blurred]);
  });

  it('writes nothing once the editor is gone', async () => {
    const { state, writes, requests, measure } = setup([v()]);
    const done = measure('v', 'https://example.com/1.flac');
    state.active = false; // track collapsed or removed, or another feed loaded
    requests[0].answer(1);
    await done;
    expect(writes).toEqual([]);
  });

  it('writes nothing if, meanwhile, the version went, its URL changed or a size was typed', async () => {
    for (const later of [[], [v({ sources: [{ uri: 'https://example.com/2.flac' }] })], [v({ length: '42' })]]) {
      const { state, writes, requests, measure } = setup([v()]);
      const done = measure('v', 'https://example.com/1.flac');
      state.list = later;
      requests[0].answer(1);
      await done;
      expect(writes).toEqual([]);
    }
  });

  it('does not measure a version that has a size, or a URL that is not a web address', async () => {
    const { requests, measure } = setup([v({ length: '42' }), v({ id: 'w', sources: [{ uri: 'ipfs://bafy' }] })]);
    await measure('v', 'https://example.com/1.flac');
    await measure('w', 'ipfs://bafy');
    expect(requests).toEqual([]);
  });
});
