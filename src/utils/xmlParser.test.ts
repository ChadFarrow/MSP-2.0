import { describe, it, expect } from 'vitest';
import { parseRssFeed, parsePublisherRssFeed } from './xmlParser';
import { generateRssFeed, generatePublisherRssFeed } from './xmlGenerator';
import { createEmptyPublisherFeed } from '../types/feed';

// Helper to build minimal RSS XML for testing
function buildRssXml(enclosureUrl: string, podcastGuid?: string): string {
  const guidTag = podcastGuid ? `<podcast:guid>${podcastGuid}</podcast:guid>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Test Feed</title>
    <itunes:author>Test Artist</itunes:author>
    <description>A test feed</description>
    <language>en</language>
    <podcast:medium>music</podcast:medium>
    ${guidTag}
    <item>
      <title>Track 1</title>
      <guid isPermaLink="false">track-guid-1</guid>
      <enclosure url="${enclosureUrl}" length="1234" type="audio/mpeg"/>
      <itunes:duration>03:45</itunes:duration>
    </item>
  </channel>
</rss>`;
}

describe('OP3 prefix detection and stripping', () => {
  it('detects OP3 prefix and sets op3=true', () => {
    const xml = buildRssXml(
      'https://op3.dev/e,pg=test-guid/example.com/track1.mp3',
      'test-guid'
    );

    const album = parseRssFeed(xml);

    expect(album.op3).toBe(true);
  });

  it('strips OP3 prefix from enclosure URLs', () => {
    const xml = buildRssXml(
      'https://op3.dev/e,pg=test-guid/example.com/track1.mp3',
      'test-guid'
    );

    const album = parseRssFeed(xml);

    expect(album.tracks[0].enclosureUrl).toBe('https://example.com/track1.mp3');
    expect(album.tracks[0].enclosureUrl).not.toContain('op3.dev');
  });

  it('strips OP3 prefix without pg parameter', () => {
    const xml = buildRssXml('https://op3.dev/e/example.com/track1.mp3');

    const album = parseRssFeed(xml);

    expect(album.op3).toBe(true);
    expect(album.tracks[0].enclosureUrl).toBe('https://example.com/track1.mp3');
  });

  it('preserves HTTP protocol when stripping OP3 prefix', () => {
    const xml = buildRssXml(
      'https://op3.dev/e,pg=test-guid/http://example.com/track1.mp3',
      'test-guid'
    );

    const album = parseRssFeed(xml);

    expect(album.op3).toBe(true);
    expect(album.tracks[0].enclosureUrl).toBe('http://example.com/track1.mp3');
  });

  it('sets op3=false when no OP3 prefix', () => {
    const xml = buildRssXml('https://example.com/track1.mp3');

    const album = parseRssFeed(xml);

    expect(album.op3).toBe(false);
    expect(album.tracks[0].enclosureUrl).toBe('https://example.com/track1.mp3');
  });
});

// Helper to build RSS XML with raw channel-level podcast:person tags
function buildRssWithPersonTags(personTags: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Test Feed</title>
    <itunes:author>Test Artist</itunes:author>
    <description>A test feed</description>
    <language>en</language>
    <podcast:medium>music</podcast:medium>
    ${personTags}
    <item>
      <title>Track 1</title>
      <guid isPermaLink="false">track-guid-1</guid>
      <enclosure url="https://example.com/track1.mp3" length="1234" type="audio/mpeg"/>
      <itunes:duration>03:45</itunes:duration>
    </item>
  </channel>
</rss>`;
}

describe('Person tag merging with npub', () => {
  const npubA = 'npub1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const npubB = 'npub1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  it('keeps same-name persons with different npubs as distinct entries', () => {
    const tags = `
      <podcast:person href="https://example.com" img="https://example.com/p.jpg" npub="${npubA}" group="music" role="vocalist">Alex</podcast:person>
      <podcast:person href="https://example.com" img="https://example.com/p.jpg" npub="${npubB}" group="music" role="vocalist">Alex</podcast:person>
    `;
    const album = parseRssFeed(buildRssWithPersonTags(tags));

    expect(album.persons).toHaveLength(2);
    const npubs = album.persons.map(p => p.npub).sort();
    expect(npubs).toEqual([npubA, npubB].sort());
  });

  it('merges same-name + same-npub tags with different roles into one person', () => {
    const tags = `
      <podcast:person npub="${npubA}" group="music" role="vocalist">Alex</podcast:person>
      <podcast:person npub="${npubA}" group="music" role="guitarist">Alex</podcast:person>
    `;
    const album = parseRssFeed(buildRssWithPersonTags(tags));

    expect(album.persons).toHaveLength(1);
    expect(album.persons[0].npub).toBe(npubA);
    expect(album.persons[0].roles).toHaveLength(2);
    expect(album.persons[0].roles.map(r => r.role).sort()).toEqual(['guitarist', 'vocalist']);
  });

  it('leaves npub undefined when attribute is absent', () => {
    const tags = `
      <podcast:person group="music" role="vocalist">Alex</podcast:person>
    `;
    const album = parseRssFeed(buildRssWithPersonTags(tags));

    expect(album.persons).toHaveLength(1);
    expect(album.persons[0].npub).toBeUndefined();
  });
});

describe('value recipient type detection on import', () => {
  // Build a minimal RSS feed with a channel-level value block whose recipients
  // are provided verbatim. Mirrors feeds produced by the old node-only tool.
  function buildRssWithValueBlock(recipients: string, method = 'keysend'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Test Feed</title>
    <itunes:author>Test Artist</itunes:author>
    <description>A test feed</description>
    <language>en</language>
    <podcast:medium>music</podcast:medium>
    <podcast:guid>test-guid</podcast:guid>
    <podcast:value type="lightning" method="${method}" suggested="0.00000005000">
      ${recipients}
    </podcast:value>
    <item>
      <title>Track 1</title>
      <guid isPermaLink="false">track-guid-1</guid>
      <enclosure url="https://example.com/track1.mp3" length="1234" type="audio/mpeg"/>
      <itunes:duration>03:45</itunes:duration>
    </item>
  </channel>
</rss>`;
  }

  // A generic, non-MSP node pubkey (the legacy MSP pubkey would be migrated to an lnaddress).
  const NODE_PUBKEY = '02aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

  it('corrects type="node" to "lnaddress" when the address contains @', () => {
    const xml = buildRssWithValueBlock(
      `<podcast:valueRecipient name="gless" type="node" address="gless@coinos.io" split="99"/>`
    );

    const album = parseRssFeed(xml);

    expect(album.value.recipients[0].type).toBe('lnaddress');
  });

  it('keeps type="node" for a node pubkey address', () => {
    const xml = buildRssWithValueBlock(
      `<podcast:valueRecipient name="Node" type="node" address="${NODE_PUBKEY}" split="1"/>`
    );

    const album = parseRssFeed(xml);

    expect(album.value.recipients[0].type).toBe('node');
  });

  it('detects lnaddress when the type attribute is missing entirely', () => {
    const xml = buildRssWithValueBlock(
      `<podcast:valueRecipient name="gless" address="gless@coinos.io" split="99"/>`
    );

    const album = parseRssFeed(xml);

    expect(album.value.recipients[0].type).toBe('lnaddress');
  });

  it('round-trips a node-only feed into method="lnaddress" output', () => {
    const xml = buildRssWithValueBlock(
      `<podcast:valueRecipient name="Node" type="node" address="${NODE_PUBKEY}" split="1"/>
       <podcast:valueRecipient name="gless" type="node" address="gless@coinos.io" split="99"/>`
    );

    const album = parseRssFeed(xml);
    const regenerated = generateRssFeed(album);

    expect(regenerated).toContain('method="lnaddress"');
    expect(regenerated).toContain('address="gless@coinos.io" split="99" type="lnaddress"');
  });
});

describe('legacy MSP 1.0 recipient migration on import', () => {
  const LEGACY_MSP_PUBKEY = '035ad2c954e264004986da2d9499e1732e5175e1dcef2453c921c6cdcc3536e9d8';

  // RSS feed with a channel-level value block (raw recipients) and a track that
  // optionally carries its own value block.
  function buildRss(channelRecipients: string, trackRecipients?: string): string {
    const trackValue = trackRecipients
      ? `<podcast:value type="lightning" method="keysend">${trackRecipients}</podcast:value>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Test Feed</title>
    <itunes:author>Test Artist</itunes:author>
    <description>A test feed</description>
    <language>en</language>
    <podcast:medium>music</podcast:medium>
    <podcast:guid>test-guid</podcast:guid>
    <podcast:value type="lightning" method="keysend">${channelRecipients}</podcast:value>
    <item>
      <title>Track 1</title>
      <guid isPermaLink="false">track-guid-1</guid>
      <enclosure url="https://example.com/track1.mp3" length="1234" type="audio/mpeg"/>
      <itunes:duration>03:45</itunes:duration>
      ${trackValue}
    </item>
  </channel>
</rss>`;
  }

  it('swaps the old MSP node recipient to the MSP 2.0 lnaddress identity', () => {
    const xml = buildRss(
      `<podcast:valueRecipient name="Music Side Project" type="node" address="${LEGACY_MSP_PUBKEY}" split="1"/>`
    );

    const r = parseRssFeed(xml).value.recipients[0];

    expect(r.name).toBe('MSP 2.0');
    expect(r.address).toBe('musicsideproject@getalby.com');
    expect(r.type).toBe('lnaddress');
  });

  it('preserves the existing split when migrating', () => {
    const xml = buildRss(
      `<podcast:valueRecipient name="Music Side Project" type="node" address="${LEGACY_MSP_PUBKEY}" split="5"/>`
    );

    expect(parseRssFeed(xml).value.recipients[0].split).toBe(5);
  });

  it('matches the legacy pubkey case-insensitively', () => {
    const xml = buildRss(
      `<podcast:valueRecipient name="Whatever" type="node" address="${LEGACY_MSP_PUBKEY.toUpperCase()}" split="1"/>`
    );

    expect(parseRssFeed(xml).value.recipients[0].address).toBe('musicsideproject@getalby.com');
  });

  it('leaves an unrelated node recipient untouched', () => {
    const other = '02aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
    const xml = buildRss(
      `<podcast:valueRecipient name="Some Artist" type="node" address="${other}" split="1"/>`
    );

    const r = parseRssFeed(xml).value.recipients[0];

    expect(r.name).toBe('Some Artist');
    expect(r.address).toBe(other);
    expect(r.type).toBe('node');
  });

  it('migrates the legacy recipient inside a track-level value block too', () => {
    const xml = buildRss(
      `<podcast:valueRecipient name="Artist" type="node" address="02aa" split="1"/>`,
      `<podcast:valueRecipient name="Music Side Project" type="node" address="${LEGACY_MSP_PUBKEY}" split="1"/>`
    );

    const trackRecipient = parseRssFeed(xml).tracks[0].value?.recipients[0];

    expect(trackRecipient?.address).toBe('musicsideproject@getalby.com');
    expect(trackRecipient?.type).toBe('lnaddress');
  });
});

describe('podcast:image parsing', () => {
  const wrap = (channelExtra: string, itemExtra: string) => `<?xml version="1.0"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Test</title>
    ${channelExtra}
    <item>
      <title>Song</title>
      <guid isPermaLink="false">g1</guid>
      ${itemExtra}
    </item>
  </channel>
</rss>`;

  it('parses a channel-level podcast:image into album.podcastImages with numeric dims and aspectRatio', () => {
    const xml = wrap('<podcast:image href="https://x.com/c.jpg" purpose="canvas" alt="bg" aspect-ratio="16/9" width="1920" height="1080" type="image/jpeg" />', '');
    const album = parseRssFeed(xml);
    expect(album.podcastImages).toEqual([
      { href: 'https://x.com/c.jpg', purpose: 'canvas', alt: 'bg', aspectRatio: '16/9', width: 1920, height: 1080, type: 'image/jpeg' },
    ]);
  });

  it('parses multiple item-level podcast:image entries into track.podcastImages', () => {
    const xml = wrap('', '<podcast:image href="https://x.com/a.jpg" purpose="banner" /><podcast:image href="https://x.com/b.jpg" purpose="social" />');
    const album = parseRssFeed(xml);
    expect(album.tracks[0].podcastImages).toEqual([
      { href: 'https://x.com/a.jpg', purpose: 'banner' },
      { href: 'https://x.com/b.jpg', purpose: 'social' },
    ]);
  });

  it('still parses the legacy podcast:images tag into trackArtUrl', () => {
    const xml = wrap('', '<podcast:images srcset="https://x.com/legacy.jpg" width="3000" height="3000" />');
    const album = parseRssFeed(xml);
    expect(album.tracks[0].trackArtUrl).toBe('https://x.com/legacy.jpg');
  });

  it('round-trips podcastImages through generate -> parse', () => {
    const album = parseRssFeed(wrap('', ''));
    album.podcastImages = [{ href: 'https://x.com/c.jpg', purpose: 'canvas', aspectRatio: '16/9', width: 1920, height: 1080 }];
    album.tracks[0].podcastImages = [{ href: 'https://x.com/t.png', purpose: 'banner' }];
    const reparsed = parseRssFeed(generateRssFeed(album));
    expect(reparsed.podcastImages).toEqual(album.podcastImages);
    expect(reparsed.tracks[0].podcastImages).toEqual(album.tracks[0].podcastImages);
  });
});

describe('podcast:image on publisher feeds', () => {
  it('round-trips publisher podcastImages through generate -> parse', () => {
    const publisher = createEmptyPublisherFeed();
    publisher.title = 'Test Label';
    publisher.podcastImages = [
      { href: 'https://x.com/logo-wide.jpg', purpose: 'banner', aspectRatio: '4/1', width: 2000, height: 500 },
    ];
    const reparsed = parsePublisherRssFeed(generatePublisherRssFeed(publisher));
    expect(reparsed.podcastImages).toEqual(publisher.podcastImages);
  });
});

describe('enclosure length normalization on import', () => {
  const feedWithLength = (length: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Test Feed</title>
    <description>A test feed</description>
    <podcast:medium>music</podcast:medium>
    <item>
      <title>Track 1</title>
      <guid isPermaLink="false">track-guid-1</guid>
      <enclosure url="https://example.com/track.mp3" length="${length}" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

  it('keeps a plausible file size', () => {
    expect(parseRssFeed(feedWithLength('74784')).tracks[0].enclosureLength).toBe('74784');
  });

  it("drops MSP's legacy 33-byte placeholder so it gets re-measured", () => {
    expect(parseRssFeed(feedWithLength('33')).tracks[0].enclosureLength).toBe('');
  });

  it('drops zero and non-numeric lengths', () => {
    expect(parseRssFeed(feedWithLength('0')).tracks[0].enclosureLength).toBe('');
    expect(parseRssFeed(feedWithLength('')).tracks[0].enclosureLength).toBe('');
    expect(parseRssFeed(feedWithLength('unknown')).tracks[0].enclosureLength).toBe('');
  });
});

describe('publisher feed sourceUrl from atom:link rel="self"', () => {
  const publisherXml = (links: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title>Horseheads</title>
    <description>A label</description>
    <podcast:medium>publisher</podcast:medium>
    <podcast:guid>d1f4a0f6-0000-4000-8000-000000000001</podcast:guid>
    ${links}
    <podcast:remoteItem feedGuid="a1" feedUrl="https://example.com/album.xml" medium="music"/>
  </channel>
</rss>`;

  it('populates sourceUrl from the self link so a file import knows its own URL', () => {
    const feed = parsePublisherRssFeed(publisherXml(
      '<atom:link href="https://example.com/horseheads.xml" rel="self" type="application/rss+xml"/>'
    ));
    expect(feed.sourceUrl).toBe('https://example.com/horseheads.xml');
  });

  it('ignores non-self links', () => {
    const feed = parsePublisherRssFeed(publisherXml(
      '<atom:link href="https://example.com/hub" rel="hub"/>'
    ));
    expect(feed.sourceUrl).toBeUndefined();
  });

  it('picks the self link out of a list of links', () => {
    const feed = parsePublisherRssFeed(publisherXml(
      '<atom:link href="https://example.com/hub" rel="hub"/><atom:link href="https://example.com/horseheads.xml" rel="self"/>'
    ));
    expect(feed.sourceUrl).toBe('https://example.com/horseheads.xml');
  });

  it('leaves sourceUrl unset when there is no atom:link at all', () => {
    expect(parsePublisherRssFeed(publisherXml('')).sourceUrl).toBeUndefined();
  });

  it('still preserves the atom:link element for round-trip output', () => {
    const feed = parsePublisherRssFeed(publisherXml(
      '<atom:link href="https://example.com/horseheads.xml" rel="self"/>'
    ));
    expect(generatePublisherRssFeed(feed)).toContain('https://example.com/horseheads.xml');
  });
});

describe('podcast:remoteItem title attribute', () => {
  const pubWrap = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>James Goulding</title>
    <description>d</description>
    <podcast:medium>publisher</podcast:medium>
    <podcast:guid>ff83e8b5-7648-44d0-aa3c-4912f491066a</podcast:guid>
    ${items}
  </channel>
</rss>`;

  const ALBUM_GUID = '048d73a2-5ca3-4593-8d8d-bca7d9e72d4a';
  const ALBUM_URL = 'https://headstarts.uk/msp/James-Goulding/Please-Stand-By/Please_Stand_By.xml';

  it('reads title from the attribute, as the spec defines it', () => {
    // The shape Fountain emits. Reading only element text meant every
    // conforming publisher feed imported with no album titles at all.
    const feed = parsePublisherRssFeed(pubWrap(
      `<podcast:remoteItem feedGuid="${ALBUM_GUID}" feedUrl="${ALBUM_URL}" medium="music" title="Please Stand By"/>`
    ));
    expect(feed.remoteItems[0].title).toBe('Please Stand By');
  });

  it('still reads a title written as element text (feeds MSP wrote before this)', () => {
    const feed = parsePublisherRssFeed(pubWrap(
      `<podcast:remoteItem feedGuid="${ALBUM_GUID}" feedUrl="${ALBUM_URL}" medium="music">Please Stand By</podcast:remoteItem>`
    ));
    expect(feed.remoteItems[0].title).toBe('Please Stand By');
  });

  it('prefers the attribute when a feed carries both', () => {
    const feed = parsePublisherRssFeed(pubWrap(
      `<podcast:remoteItem feedGuid="${ALBUM_GUID}" medium="music" title="From attribute">From text</podcast:remoteItem>`
    ));
    expect(feed.remoteItems[0].title).toBe('From attribute');
  });

  it('emits title as a self-closing attribute, never as element text', () => {
    const feed = parsePublisherRssFeed(pubWrap(
      `<podcast:remoteItem feedGuid="${ALBUM_GUID}" feedUrl="${ALBUM_URL}" medium="music">Please Stand By</podcast:remoteItem>`
    ));
    const xml = generatePublisherRssFeed(feed);

    expect(xml).toContain('title="Please Stand By"');
    expect(xml).not.toContain('>Please Stand By</podcast:remoteItem>');
    expect(xml).toMatch(/<podcast:remoteItem [^>]*\/>/);
  });

  it('round-trips the legacy text form into the spec form without losing feedImg', () => {
    const IMG = 'https://headstarts.uk/msp/James-Goulding/Please-Stand-By/psb.jpeg';
    const feed = parsePublisherRssFeed(pubWrap(
      `<podcast:remoteItem feedGuid="${ALBUM_GUID}" feedUrl="${ALBUM_URL}" medium="music" feedImg="${IMG}">Please Stand By</podcast:remoteItem>`
    ));
    const reparsed = parsePublisherRssFeed(generatePublisherRssFeed(feed));

    expect(reparsed.remoteItems[0]).toEqual({
      feedGuid: ALBUM_GUID,
      feedUrl: ALBUM_URL,
      medium: 'music',
      title: 'Please Stand By',
      image: IMG
    });
  });
});

describe('podcast:publisher parsing', () => {
  const wrap = (publisherXml: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Album</title>
    <description>d</description>
    <podcast:medium>music</podcast:medium>
    ${publisherXml}
  </channel>
</rss>`;

  const GUID = 'ff83e8b5-7648-44d0-aa3c-4912f491066a';
  const URL = 'https://headstarts.uk/msp/publisher-feeds/James_Goulding.xml';

  it('reads the canonical nested form', () => {
    const album = parseRssFeed(wrap(
      `<podcast:publisher><podcast:remoteItem medium="publisher" feedGuid="${GUID}" feedUrl="${URL}"/></podcast:publisher>`
    ));
    expect(album.publisher).toEqual({ feedGuid: GUID, feedUrl: URL });
  });

  it('reads attributes written directly on podcast:publisher', () => {
    // Out of spec, but it occurs in the wild. This used to return undefined, and
    // because 'podcast:publisher' is a known channel key it was excluded from
    // unknownChannelElements too — so a parse/regenerate deleted it outright.
    const album = parseRssFeed(wrap(
      `<podcast:publisher medium="publisher" feedGuid="${GUID}" feedUrl="${URL}"/>`
    ));
    expect(album.publisher).toEqual({ feedGuid: GUID, feedUrl: URL });
  });

  it('survives more than one nested remoteItem', () => {
    // fast-xml-parser returns an array here, and getAttr yields '' for an array,
    // so this used to drop the publisher entirely rather than take the first.
    const album = parseRssFeed(wrap(
      `<podcast:publisher>
         <podcast:remoteItem medium="publisher" feedGuid="${GUID}" feedUrl="${URL}"/>
         <podcast:remoteItem medium="publisher" feedGuid="second-guid" feedUrl="https://example.com/other.xml"/>
       </podcast:publisher>`
    ));
    expect(album.publisher).toEqual({ feedGuid: GUID, feedUrl: URL });
  });

  it('normalizes a malformed publisher to the canonical nested form on output', () => {
    const album = parseRssFeed(wrap(
      `<podcast:publisher medium="publisher" feedGuid="${GUID}" feedUrl="${URL}"/>`
    ));
    expect(generateRssFeed(album)).toContain(
      `<podcast:publisher>\n            <podcast:remoteItem medium="publisher" feedGuid="${GUID}" feedUrl="${URL}" />\n        </podcast:publisher>`
    );
  });

  it('leaves publisher undefined when there is nothing to read', () => {
    const album = parseRssFeed(wrap('<podcast:publisher></podcast:publisher>'));
    expect(album.publisher).toBeUndefined();
  });

  it('reads a bare channel-level remoteItem with medium="publisher"', () => {
    const album = parseRssFeed(wrap(
      `<podcast:remoteItem medium="publisher" feedGuid="${GUID}" feedUrl="${URL}"/>`
    ));
    expect(album.publisher).toEqual({ feedGuid: GUID, feedUrl: URL });
  });

  it('emits exactly one publisher reference for a bare remoteItem, even after an overwrite', () => {
    // The Download Catalog flows set album.publisher unconditionally after
    // parsing. If the bare remoteItem had merely been passed through as an
    // unknown element it would be re-emitted next to the generated
    // <podcast:publisher> block, and Download Feed rewrites somebody else's
    // file — so this is corruption, not just noise.
    const album = parseRssFeed(wrap(
      `<podcast:remoteItem medium="publisher" feedGuid="${GUID}" feedUrl="${URL}"/>`
    ));
    album.publisher = { feedGuid: 'new-guid', feedUrl: 'https://example.com/pub.xml' };

    const xml = generateRssFeed(album);
    expect(xml.match(/medium="publisher"/g)).toHaveLength(1);
    expect(xml).toContain('new-guid');
    expect(xml).not.toContain(GUID);
  });

  it('still round-trips a podroll alongside a bare publisher remoteItem', () => {
    // Only the publisher-medium entry is consumed; other mediums are podroll and
    // must survive untouched.
    const album = parseRssFeed(wrap(
      `<podcast:remoteItem medium="publisher" feedGuid="${GUID}" feedUrl="${URL}"/>
    <podcast:remoteItem feedGuid="aaaaaaaa-0000-0000-0000-000000000001" medium="music"/>
    <podcast:remoteItem feedGuid="aaaaaaaa-0000-0000-0000-000000000002" medium="music"/>`
    ));

    const xml = generateRssFeed(album);
    expect(xml.match(/medium="publisher"/g)).toHaveLength(1);
    expect(xml).toContain('aaaaaaaa-0000-0000-0000-000000000001');
    expect(xml).toContain('aaaaaaaa-0000-0000-0000-000000000002');
  });
});

describe('harmless extras round-trip', () => {
  // A feed carrying spec-valid tags MSP doesn't edit. Each one used to be
  // dropped on import, so a parse→regenerate quietly deleted it.
  function buildFeedWithExtras(explicit = 'true'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Extras</title>
    <itunes:author>Artist</itunes:author>
    <description>A feed with extras</description>
    <language>en</language>
    <podcast:medium>music</podcast:medium>
    <podcast:guid>c7d1b2a0-1111-4222-8333-444455556666</podcast:guid>
    <podcast:locked>yes</podcast:locked>
    <podcast:txt purpose="npub">npub1artist</podcast:txt>
    <podcast:txt purpose="applepodcastsverify">abc-123</podcast:txt>
    <itunes:category text="Music">
      <itunes:category text="Music History"/>
    </itunes:category>
    <itunes:explicit>${explicit}</itunes:explicit>
    <podcast:value type="lightning" method="lnaddress">
      <podcast:valueRecipient name="Artist" address="artist@getalby.com" split="95" type="lnaddress"/>
      <podcast:valueRecipient name="Host" address="host@getalby.com" split="5" type="lnaddress" fee="true"/>
    </podcast:value>
    <item>
      <title>Track 1</title>
      <guid isPermaLink="false">track-guid-1</guid>
      <enclosure url="https://example.com/t1.mp3" length="123456" type="audio/mpeg"/>
      <itunes:duration>03:45</itunes:duration>
      <podcast:value type="lightning" method="lnaddress">
        <podcast:valueRecipient name="Artist" address="artist@getalby.com" split="95" type="lnaddress"/>
        <podcast:valueRecipient name="Host" address="host@getalby.com" split="5" type="lnaddress" fee="true"/>
        <podcast:valueTimeSplit startTime="60" duration="30" remotePercentage="90">
          <podcast:remoteItem feedGuid="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" itemGuid="guest-track"/>
        </podcast:valueTimeSplit>
      </podcast:value>
    </item>
  </channel>
</rss>`;
  }

  it('keeps the recipient fee attribute', () => {
    const album = parseRssFeed(buildFeedWithExtras());
    expect(album.value.recipients[1].fee).toBe(true);
    expect(album.value.recipients[0].fee).toBeUndefined();
    const xml = generateRssFeed(album);
    expect(xml).toContain('name="Host" address="host@getalby.com" split="5" type="lnaddress" fee="true" />');
    expect(xml).not.toContain('name="Artist" address="artist@getalby.com" split="95" type="lnaddress" fee=');
  });

  it('keeps <podcast:valueTimeSplit> inside the item value block', () => {
    const album = parseRssFeed(buildFeedWithExtras());
    const track = album.tracks[0];
    // The item block differs from the channel's only by its time split, so it must
    // still count as an override — otherwise the channel block is written instead.
    expect(track.overrideValue).toBe(true);
    const xml = generateRssFeed(album);
    const item = xml.slice(xml.indexOf('<item>'), xml.indexOf('</item>'));
    expect(item).toMatch(
      /<podcast:value [^>]*>\s*<podcast:valueRecipient name="Artist"[^>]*\/>\s*<podcast:valueRecipient name="Host"[^>]*fee="true" \/>\s*<podcast:valueTimeSplit startTime="60" duration="30" remotePercentage="90">\s*<podcast:remoteItem feedGuid="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" itemGuid="guest-track" \/>\s*<\/podcast:valueTimeSplit>\s*<\/podcast:value>/
    );
  });

  it('writes the npub txt once and keeps every other podcast:txt', () => {
    const album = parseRssFeed(buildFeedWithExtras());
    expect(album.artistNpub).toBe('npub1artist');
    const xml = generateRssFeed(album);
    expect(xml.match(/purpose="npub"/g)).toHaveLength(1);
    expect(xml).toContain('<podcast:txt purpose="applepodcastsverify">abc-123</podcast:txt>');
  });

  it('keeps a second npub txt rather than dropping it', () => {
    const xml = buildFeedWithExtras().replace(
      '<podcast:txt purpose="applepodcastsverify">abc-123</podcast:txt>',
      '<podcast:txt purpose="npub">npub1other</podcast:txt>'
    );
    const out = generateRssFeed(parseRssFeed(xml));
    expect(out).toContain('<podcast:txt purpose="npub">npub1artist</podcast:txt>');
    expect(out).toContain('<podcast:txt purpose="npub">npub1other</podcast:txt>');
    expect(out.match(/purpose="npub"/g)).toHaveLength(2);
  });

  it('keeps every podcast:txt on a publisher feed', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Label</title>
    <podcast:medium>publisher</podcast:medium>
    <podcast:guid>c7d1b2a0-1111-4222-8333-444455556666</podcast:guid>
    <podcast:txt purpose="applepodcastsverify">abc-123</podcast:txt>
    <podcast:txt>free text</podcast:txt>
  </channel>
</rss>`;
    const out = generatePublisherRssFeed(parsePublisherRssFeed(xml));
    expect(out).toContain('<podcast:txt purpose="applepodcastsverify">abc-123</podcast:txt>');
    expect(out).toContain('<podcast:txt>free text</podcast:txt>');
  });

  it('keeps nested itunes:category subcategories', () => {
    const album = parseRssFeed(buildFeedWithExtras());
    expect(album.categories).toEqual(['Music']);
    expect(album.subcategories).toEqual({ Music: ['Music History'] });
    const xml = generateRssFeed(album);
    expect(xml).toMatch(
      /<itunes:category text="Music">\s*<itunes:category text="Music History" \/>\s*<\/itunes:category>/
    );
  });

  it('writes a plain category self-closing when it has no subcategories', () => {
    const album = parseRssFeed(buildFeedWithExtras());
    album.subcategories = undefined;
    expect(generateRssFeed(album)).toContain('<itunes:category text="Music" />');
  });

  it('reads the legacy itunes:explicit words', () => {
    for (const word of ['yes', 'Yes', 'explicit', 'true']) {
      expect(parseRssFeed(buildFeedWithExtras(word)).explicit).toBe(true);
    }
    for (const word of ['no', 'clean', 'false']) {
      expect(parseRssFeed(buildFeedWithExtras(word)).explicit).toBe(false);
    }
  });

  it('reads the legacy explicit words at item level too', () => {
    const xml = buildFeedWithExtras().replace(
      '<itunes:duration>03:45</itunes:duration>',
      '<itunes:duration>03:45</itunes:duration>\n      <itunes:explicit>yes</itunes:explicit>'
    );
    expect(parseRssFeed(xml).tracks[0].explicit).toBe(true);
  });

  it('passes number-shaped values through exactly as written', () => {
    const xml = buildFeedWithExtras()
      .replace('abc-123', '0012345')
      .replace('itemGuid="guest-track"', 'itemGuid="0012345"')
      .replace('<itunes:duration>03:45</itunes:duration>',
        '<itunes:duration>03:45</itunes:duration>\n      <custom:id xmlns:custom="https://example.com/ns" big="12345678901234567890123">5e10</custom:id>');
    const out = generateRssFeed(parseRssFeed(xml));
    expect(out).toContain('<podcast:txt purpose="applepodcastsverify">0012345</podcast:txt>');
    expect(out).toContain('itemGuid="0012345"');
    expect(out).toContain('big="12345678901234567890123"');
    expect(out).toContain('>5e10</custom:id>');
  });

  it('survives a category named like a built-in object key', () => {
    const xml = buildFeedWithExtras().replace(
      '<itunes:category text="Music">',
      '<itunes:category text="constructor"><itunes:category text="Sub"/></itunes:category>\n    <itunes:category text="Music">'
    );
    const album = parseRssFeed(xml);
    expect(album.subcategories).toEqual({ constructor: ['Sub'], Music: ['Music History'] });
    expect(generateRssFeed(album)).toMatch(/<itunes:category text="constructor">\s*<itunes:category text="Sub" \/>/);
    album.subcategories = { Music: ['Music History'] };
    expect(generateRssFeed(album)).toContain('<itunes:category text="constructor" />');
  });

  it('keeps <podcast:locked> when the feed names no owner', () => {
    const album = parseRssFeed(buildFeedWithExtras());
    expect(album.locked).toBe(true);
    expect(album.lockedOwner).toBe('');
    expect(generateRssFeed(album)).toContain('<podcast:locked>yes</podcast:locked>');
  });
});
