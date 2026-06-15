// MSP 2.0 - XML Generator for Demu RSS Feeds
import type { Album, Track, Person, ValueBlock, ValueRecipient, Funding, PublisherFeed, RemoteItem, PublisherReference, BaseChannelData, PodcastImage } from '../types/feed';
import { formatRFC822Date } from './dateUtils';

// Escape XML special characters
const escapeXml = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// Generate indent
const indent = (level: number): string => '    '.repeat(level);

// Common namespace declarations for RSS extensions
const NAMESPACE_URIS: Record<string, string> = {
  'content': 'http://purl.org/rss/1.0/modules/content/',
  'dc': 'http://purl.org/dc/elements/1.1/',
  'atom': 'http://www.w3.org/2005/Atom',
  'media': 'http://search.yahoo.com/mrss/',
  'sy': 'http://purl.org/rss/1.0/modules/syndication/',
  'slash': 'http://purl.org/rss/1.0/modules/slash/',
  'rawvoice': 'http://www.rawvoice.com/rawvoiceRssModule/',
  'googleplay': 'http://www.google.com/schemas/play-podcasts/1.0',
  'spotify': 'http://www.spotify.com/ns/rss',
  'psc': 'http://podlove.org/simple-chapters',
  'wfw': 'http://wellformedweb.org/CommentAPI/',
  'cc': 'http://creativecommons.org/ns#'
};

// Collect namespace prefixes from unknown elements recursively
const collectNamespacePrefixes = (obj: unknown, prefixes: Set<string>): void => {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectNamespacePrefixes(item, prefixes);
    }
    return;
  }

  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    // Check if key has a namespace prefix (e.g., "content:encoded")
    const colonIndex = key.indexOf(':');
    if (colonIndex > 0 && !key.startsWith('@_')) {
      const prefix = key.slice(0, colonIndex);
      // Only add if it's not already a known namespace (podcast, itunes)
      if (prefix !== 'podcast' && prefix !== 'itunes') {
        prefixes.add(prefix);
      }
    }
    // Recurse into nested objects
    collectNamespacePrefixes(record[key], prefixes);
  }
};

// Collect all namespaces needed for unknown elements in an album
const collectAlbumNamespaces = (album: { unknownChannelElements?: Record<string, unknown>; tracks: { unknownItemElements?: Record<string, unknown> }[] }): Set<string> => {
  const prefixes = new Set<string>();

  if (album.unknownChannelElements) {
    collectNamespacePrefixes(album.unknownChannelElements, prefixes);
  }

  for (const track of album.tracks) {
    if (track.unknownItemElements) {
      collectNamespacePrefixes(track.unknownItemElements, prefixes);
    }
  }

  return prefixes;
};

// Generate xmlns declarations for additional namespaces
const generateNamespaceDeclarations = (prefixes: Set<string>): string => {
  const declarations: string[] = [];
  for (const prefix of prefixes) {
    const uri = NAMESPACE_URIS[prefix];
    if (uri) {
      declarations.push(`xmlns:${prefix}="${uri}"`);
    }
  }
  return declarations.join(' ');
};

// Convert parsed XML object back to XML string (for unknown/unsupported elements)
const generateUnknownXml = (elements: Record<string, unknown>, level: number): string => {
  const lines: string[] = [];

  for (const [tagName, value] of Object.entries(elements)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      // Multiple elements with same tag name
      for (const item of value) {
        lines.push(generateSingleElementXml(tagName, item, level));
      }
    } else {
      lines.push(generateSingleElementXml(tagName, value, level));
    }
  }

  return lines.join('\n');
};

// Generate XML for a single element (handles attributes, text content, and nested elements)
const generateSingleElementXml = (tagName: string, value: unknown, level: number): string => {
  if (value === null || value === undefined) return '';

  // Simple text value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${indent(level)}<${tagName}>${escapeXml(String(value))}</${tagName}>`;
  }

  // Object with potential attributes and nested content
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const attrs: string[] = [];
    const children: string[] = [];
    let textContent = '';

    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@_')) {
        // Attribute
        const attrName = key.slice(2);
        attrs.push(`${attrName}="${escapeXml(String(val))}"`);
      } else if (key === '#text') {
        // Text content
        textContent = String(val);
      } else if (val !== null && val !== undefined) {
        // Nested element
        if (Array.isArray(val)) {
          for (const item of val) {
            children.push(generateSingleElementXml(key, item, level + 1));
          }
        } else {
          children.push(generateSingleElementXml(key, val, level + 1));
        }
      }
    }

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

    if (children.length === 0 && !textContent) {
      // Self-closing tag
      return `${indent(level)}<${tagName}${attrStr} />`;
    } else if (children.length === 0) {
      // Tag with text content only
      return `${indent(level)}<${tagName}${attrStr}>${escapeXml(textContent)}</${tagName}>`;
    } else {
      // Tag with nested elements
      const lines: string[] = [];
      lines.push(`${indent(level)}<${tagName}${attrStr}>`);
      if (textContent) {
        lines.push(`${indent(level + 1)}${escapeXml(textContent)}`);
      }
      lines.push(...children);
      lines.push(`${indent(level)}</${tagName}>`);
      return lines.join('\n');
    }
  }

  return '';
};

// Generate person XML - outputs one <podcast:person> tag per role
const generatePersonXml = (person: Person, level: number): string => {
  // Generate one tag per role (per Podcasting 2.0 spec)
  return person.roles.map(role => {
    const attrs: string[] = [];
    if (person.href) attrs.push(`href="${escapeXml(person.href)}"`);
    if (person.img) attrs.push(`img="${escapeXml(person.img)}"`);
    if (person.npub) attrs.push(`npub="${escapeXml(person.npub)}"`);
    attrs.push(`group="${escapeXml(role.group)}"`);
    attrs.push(`role="${escapeXml(role.role)}"`);
    return `${indent(level)}<podcast:person ${attrs.join(' ')}>${escapeXml(person.name)}</podcast:person>`;
  }).join('\n');
};

// Generate value recipient XML
const generateRecipientXml = (recipient: ValueRecipient, level: number): string => {
  const attrs = [
    `name="${escapeXml(recipient.name)}"`,
    `address="${escapeXml(recipient.address)}"`,
    `split="${recipient.split}"`,
    `type="${recipient.type}"`
  ];
  if (recipient.customKey) attrs.push(`customKey="${escapeXml(recipient.customKey)}"`);
  if (recipient.customValue) attrs.push(`customValue="${escapeXml(recipient.customValue)}"`);

  return `${indent(level)}<podcast:valueRecipient ${attrs.join(' ')} />`;
};

// Generate value block XML
const generateValueXml = (value: ValueBlock, level: number): string => {
  if (!value.recipients.length) return '';

  // Determine method based on recipient types
  // If any recipient uses lnaddress, method should be lnaddress
  const hasLnAddress = value.recipients.some(r => r.type === 'lnaddress');
  const method = hasLnAddress ? 'lnaddress' : 'keysend';

  const lines: string[] = [];
  const attrs = [
    `type="${value.type}"`,
    `method="${method}"`
  ];
  if (value.suggested) attrs.push(`suggested="${value.suggested}"`);

  lines.push(`${indent(level)}<podcast:value ${attrs.join(' ')}>`);
  lines.push(`${indent(level + 1)}<!-- Each "podcast:valueRecipient" tag defines one payment recipient: their name, Lightning address or node pubkey, and their percentage share of the split. Splits are proportional — they don't need to add up to 100, but whole numbers are recommended. -->`);
  value.recipients.forEach(r => lines.push(generateRecipientXml(r, level + 1)));
  lines.push(`${indent(level)}</podcast:value>`);

  return lines.join('\n');
};

// Generate funding XML
const generateFundingXml = (funding: Funding, level: number): string => {
  if (!funding.url) return '';
  return `${indent(level)}<podcast:funding url="${escapeXml(funding.url)}">${escapeXml(funding.text)}</podcast:funding>`;
};

// Generate remote item XML (for publisher feeds and podroll)
const generateRemoteItemXml = (item: RemoteItem, level: number): string => {
  const attrs: string[] = [];
  if (item.feedGuid) attrs.push(`feedGuid="${escapeXml(item.feedGuid)}"`);
  if (item.feedUrl) attrs.push(`feedUrl="${escapeXml(item.feedUrl)}"`);
  if (item.itemGuid) attrs.push(`itemGuid="${escapeXml(item.itemGuid)}"`);
  attrs.push(`medium="${escapeXml(item.medium || 'music')}"`);
  if (item.image) attrs.push(`feedImg="${escapeXml(item.image)}"`);

  if (item.title) {
    return `${indent(level)}<podcast:remoteItem ${attrs.join(' ')}>${escapeXml(item.title)}</podcast:remoteItem>`;
  }
  return `${indent(level)}<podcast:remoteItem ${attrs.join(' ')} />`;
};

// Generate publisher reference XML (for albums that reference their publisher)
const generatePublisherXml = (publisher: PublisherReference, level: number): string => {
  if (!publisher.feedGuid && !publisher.feedUrl) return '';

  const lines: string[] = [];
  lines.push(`${indent(level)}<podcast:publisher>`);

  const attrs: string[] = [`medium="publisher"`];
  if (publisher.feedGuid) attrs.push(`feedGuid="${escapeXml(publisher.feedGuid)}"`);
  if (publisher.feedUrl) attrs.push(`feedUrl="${escapeXml(publisher.feedUrl)}"`);

  lines.push(`${indent(level + 1)}<podcast:remoteItem ${attrs.join(' ')} />`);
  lines.push(`${indent(level)}</podcast:publisher>`);

  return lines.join('\n');
};

// Generate a single <podcast:image> element (without indentation). Returns null when href is empty.
const generatePodcastImageXml = (image: PodcastImage): string | null => {
  if (!image.href) return null;
  const attrs = [`href="${escapeXml(image.href)}"`];
  if (image.purpose) attrs.push(`purpose="${escapeXml(image.purpose)}"`);
  if (image.alt) attrs.push(`alt="${escapeXml(image.alt)}"`);
  if (image.aspectRatio) attrs.push(`aspect-ratio="${escapeXml(image.aspectRatio)}"`);
  if (image.width) attrs.push(`width="${image.width}"`);
  if (image.height) attrs.push(`height="${image.height}"`);
  if (image.type) attrs.push(`type="${escapeXml(image.type)}"`);
  return `<podcast:image ${attrs.join(' ')} />`;
};

// Generate common channel elements shared between Album and PublisherFeed
const generateCommonChannelElements = (data: BaseChannelData, medium: string, level: number): string[] => {
  const lines: string[] = [];

  // This function is shared by album/video feeds and publisher (label/catalog) feeds.
  // Comments that describe an album-centric concept are reworded for publisher feeds.
  const isPublisher = medium === 'publisher';

  // Title
  lines.push(isPublisher
    ? `${indent(level)}<!-- The "title" tag will contain the name of your publisher or label catalog. -->`
    : `${indent(level)}<!-- The "title" tag will contain the name of your album. -->`);
  lines.push(`${indent(level)}<title>${escapeXml(data.title)}</title>`);

  // Author
  lines.push(isPublisher
    ? `${indent(level)}<!-- The "itunes:author" tag describes the label or publisher name. -->`
    : `${indent(level)}<!-- The "itunes:author" tag describes the artist or band name. -->`);
  lines.push(`${indent(level)}<itunes:author>${escapeXml(data.author)}</itunes:author>`);

  // Description
  lines.push(isPublisher
    ? `${indent(level)}<!-- The "description" tag gives listeners a brief overview of this publisher or label catalog. -->`
    : `${indent(level)}<!-- The "description" tag gives listeners a brief overview of the album. -->`);
  lines.push(`${indent(level)}<description>`);
  lines.push(`${indent(level + 1)}${escapeXml(data.description)}`);
  lines.push(`${indent(level)}</description>`);

  // Link
  if (data.link) {
    lines.push(`${indent(level)}<!-- The "link" tag holds the main link for listeners to visit — usually your band website. -->`);
    lines.push(`${indent(level)}<link>${escapeXml(data.link)}</link>`);
  }

  // Language
  lines.push(`${indent(level)}<!-- The "language" tag describes the language the feed is written in. See https://www.rssboard.org/rss-language-codes for a full list of language codes. -->`);
  lines.push(`${indent(level)}<language>${data.language}</language>`);

  // Generator
  lines.push(`${indent(level)}<!-- The "generator" tag describes the tool used to create this feed. -->`);
  lines.push(`${indent(level)}<generator>MSP 2.0 - Music Side Project Studio</generator>`);

  // Dates
  lines.push(`${indent(level)}<!-- The "pubDate" is when the most recent item in the feed was published. Dates must be in RFC-822 format. -->`);
  lines.push(`${indent(level)}<pubDate>${formatRFC822Date(data.pubDate)}</pubDate>`);
  lines.push(`${indent(level)}<!-- The "lastBuildDate" is when this feed was last rebuilt, also in RFC-822 format. -->`);
  lines.push(`${indent(level)}<lastBuildDate>${formatRFC822Date(data.lastBuildDate)}</lastBuildDate>`);

  // Locked
  if (data.locked && data.lockedOwner) {
    lines.push(`${indent(level)}<!-- The "podcast:locked" tag prevents other platforms from claiming this feed without permission. See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#locked -->`);
    lines.push(`${indent(level)}<podcast:locked owner="${escapeXml(data.lockedOwner)}">yes</podcast:locked>`);
  }

  // GUID
  if (data.podcastGuid) {
    lines.push(`${indent(level)}<!-- The "podcast:guid" tag is a Globally Unique ID for the feed itself. It should never change once set. Generate one at https://tools.rssblue.com/podcast-guid. See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#guid -->`);
    lines.push(`${indent(level)}<podcast:guid>${escapeXml(data.podcastGuid)}</podcast:guid>`);
  }

  // Artist Npub (only for Album feeds)
  if ((data as Album).artistNpub) {
    lines.push(`${indent(level)}<!-- The "podcast:txt" tag stores supplemental text metadata. Here it holds the artist's Nostr public key, enabling identity verification and social features. -->`);
    lines.push(`${indent(level)}<podcast:txt purpose="npub">${escapeXml((data as Album).artistNpub!)}</podcast:txt>`);
  }

  // Categories (default to Music for music feeds)
  const categories = data.categories.length > 0 ? data.categories : ['Music'];
  lines.push(`${indent(level)}<!-- The "itunes:category" tags describe which categories your feed falls under. You may include up to 3. See https://podcasters.apple.com/support/1691-apple-podcasts-categories -->`);
  categories.forEach(cat => {
    lines.push(`${indent(level)}<itunes:category text="${escapeXml(cat)}" />`);
  });

  // Keywords
  if (data.keywords) {
    lines.push(`${indent(level)}<!-- The "itunes:keywords" tag contains search terms to help listeners discover your music. -->`);
    lines.push(`${indent(level)}<itunes:keywords>${escapeXml(data.keywords)}</itunes:keywords>`);
  }

  // Contact
  if (data.managingEditor) {
    lines.push(`${indent(level)}<!-- The "managingEditor" tag provides the email of the person responsible for editorial content. -->`);
    lines.push(`${indent(level)}<managingEditor>${escapeXml(data.managingEditor)}</managingEditor>`);
  }
  if (data.webMaster) {
    lines.push(`${indent(level)}<!-- The "webMaster" tag provides the email of the person responsible for the technical side of the feed. -->`);
    lines.push(`${indent(level)}<webMaster>${escapeXml(data.webMaster)}</webMaster>`);
  }

  // Image
  if (data.imageUrl) {
    lines.push(`${indent(level)}<!-- The RSS "image" tag displays your album artwork to podcast aggregators. Child tags: url (image file location), title, link (band website), and description. -->`);
    lines.push(`${indent(level)}<image>`);
    lines.push(`${indent(level + 1)}<url>${escapeXml(data.imageUrl)}</url>`);
    lines.push(`${indent(level + 1)}<title>${escapeXml(data.imageTitle || data.title)}</title>`);
    if (data.imageLink) {
      lines.push(`${indent(level + 1)}<link>${escapeXml(data.imageLink)}</link>`);
    }
    if (data.imageDescription) {
      lines.push(`${indent(level + 1)}<description>${escapeXml(data.imageDescription)}</description>`);
    }
    lines.push(`${indent(level)}</image>`);
    lines.push(`${indent(level)}<!-- The "itunes:image" tag is the Apple Podcasts-compatible image reference for your album artwork. -->`);
    lines.push(`${indent(level)}<itunes:image href="${escapeXml(data.imageUrl)}" />`);
  }

  // Podcasting 2.0 additional images
  const podcastImgTags = (data.podcastImages || []).map(img => generatePodcastImageXml(img)).filter((t): t is string => t !== null);
  if (podcastImgTags.length > 0) {
    lines.push(`${indent(level)}<!-- The "podcast:image" tags provide additional artwork in different aspect ratios (e.g. a wide canvas background, a banner, or a social card). See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#images -->`);
    podcastImgTags.forEach(tag => lines.push(`${indent(level)}${tag}`));
  }

  // Medium
  lines.push(isPublisher
    ? `${indent(level)}<!-- The "podcast:medium" tag identifies this as a publisher feed: a label/catalog that references other feeds (each album) via "podcast:remoteItem", rather than containing media items itself. See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#medium -->`
    : `${indent(level)}<!-- The "podcast:medium" tag tells apps this feed contains music. It is intended for feeds whose items are exclusively music files. See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#medium -->`);
  lines.push(`${indent(level)}<podcast:medium>${medium}</podcast:medium>`);

  // Explicit
  lines.push(`${indent(level)}<!-- The "itunes:explicit" tag indicates whether the content contains explicit language. Set to "true" if your music has explicit content. -->`);
  lines.push(`${indent(level)}<itunes:explicit>${data.explicit ? 'true' : 'false'}</itunes:explicit>`);

  // Owner
  if (data.ownerName || data.ownerEmail) {
    lines.push(`${indent(level)}<!-- The "itunes:owner" tag provides contact info for administrative purposes, such as Apple Podcasts ownership verification. -->`);
    lines.push(`${indent(level)}<itunes:owner>`);
    if (data.ownerName) {
      lines.push(`${indent(level + 1)}<itunes:name>${escapeXml(data.ownerName)}</itunes:name>`);
    }
    if (data.ownerEmail) {
      lines.push(`${indent(level + 1)}<itunes:email>${escapeXml(data.ownerEmail)}</itunes:email>`);
    }
    lines.push(`${indent(level)}</itunes:owner>`);
  }

  // Persons
  if (data.persons.length > 0) {
    lines.push(`${indent(level)}<!-- The "podcast:person" tags list people of note: band members, producers, featured artists and more. Each tag is a credit. "href" links to a profile page, "img" links to a photo, and "group"/"role" describe their contribution. See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#person -->`);
    data.persons.forEach(p => lines.push(generatePersonXml(p, level)));
  }

  // Value block
  if (data.value.recipients.length > 0) {
    lines.push(`${indent(level)}<!-- The "podcast:value" tag describes how Lightning payments are split between recipients when listeners boost or stream sats. "type" and "method" describe the payment technology; "suggested" is a recommended boost amount in BTC. See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#value -->`);
    lines.push(generateValueXml(data.value, level));
  }

  // Funding
  const fundingLines = (data.funding || []).map(f => generateFundingXml(f, level)).filter(Boolean);
  if (fundingLines.length > 0) {
    lines.push(`${indent(level)}<!-- The "podcast:funding" tag provides a link where listeners can support you directly (e.g. a Patreon, PayPal, or donation page). -->`);
    fundingLines.forEach(f => lines.push(f as string));
  }

  return lines;
};

// Apply OP3 analytics prefix to a URL
// See https://op3.dev/setup for details
const applyOp3Prefix = (url: string, podcastGuid?: string): string => {
  if (!url) return url;
  // Don't double-prefix URLs that already have OP3
  if (url.startsWith('https://op3.dev/e')) return url;
  const pgParam = podcastGuid ? `,pg=${podcastGuid}` : '';
  // For HTTPS URLs, strip the protocol; for HTTP, keep it
  const urlWithoutProtocol = url.startsWith('https://') ? url.slice(8) : url;
  return `https://op3.dev/e${pgParam}/${urlWithoutProtocol}`;
};

// Generate track/item XML
const generateTrackXml = (track: Track, album: Album, level: number): string => {
  const lines: string[] = [];

  lines.push(`${indent(level)}<item>`);

  lines.push(`${indent(level + 1)}<!-- The "title" tag holds the song title. -->`);
  lines.push(`${indent(level + 1)}<title>${escapeXml(track.title)}</title>`);

  if (track.description) {
    lines.push(`${indent(level + 1)}<!-- The "description" tag holds an optional description of this track. -->`);
    lines.push(`${indent(level + 1)}<description>${escapeXml(track.description)}</description>`);
  }

  lines.push(`${indent(level + 1)}<!-- The "pubDate" tag is when this track was published, in RFC-822 format. -->`);
  lines.push(`${indent(level + 1)}<pubDate>${formatRFC822Date(track.pubDate)}</pubDate>`);

  lines.push(`${indent(level + 1)}<!-- The "guid" tag is a Globally Unique Identifier for this track. Every track must have its own unique GUID — apps use it to identify tracks across feeds and route boost payments correctly. -->`);
  lines.push(`${indent(level + 1)}<guid isPermaLink="false">${escapeXml(track.guid)}</guid>`);

  if (track.transcriptUrl) {
    lines.push(`${indent(level + 1)}<!-- The "podcast:transcript" tag links to an external lyrics file. An SRT file can time-code lyrics to display in sync with playback. See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#transcript -->`);
    lines.push(`${indent(level + 1)}<podcast:transcript url="${escapeXml(track.transcriptUrl)}" type="${escapeXml(track.transcriptType || 'application/srt')}" />`);
  }

  // Track artwork (falls back to album)
  const artUrl = track.trackArtUrl || album.imageUrl;
  if (artUrl) {
    lines.push(`${indent(level + 1)}<!-- The "itunes:image" tag at the item level links to artwork for this specific track. If omitted, the channel-level image is displayed instead. -->`);
    lines.push(`${indent(level + 1)}<itunes:image href="${escapeXml(artUrl)}" />`);
  }

  // Podcasting 2.0 additional images (track level)
  const trackImgTags = (track.podcastImages || []).map(img => generatePodcastImageXml(img)).filter((t): t is string => t !== null);
  if (trackImgTags.length > 0) {
    lines.push(`${indent(level + 1)}<!-- Track-level "podcast:image" tags provide additional artwork for this specific track in different aspect ratios. -->`);
    trackImgTags.forEach(tag => lines.push(`${indent(level + 1)}${tag}`));
  }

  // Enclosure (audio file)
  const fileLength = track.enclosureLength || '0';
  const enclosureUrl = album.op3 ? applyOp3Prefix(track.enclosureUrl, album.podcastGuid) : track.enclosureUrl;
  lines.push(`${indent(level + 1)}<!-- The "enclosure" tag points to the audio file. "url" is the file location (must be publicly accessible), "length" is the file size in bytes, and "type" is the MIME type (e.g. audio/mpeg for MP3). -->`);
  lines.push(`${indent(level + 1)}<enclosure url="${escapeXml(enclosureUrl)}" length="${fileLength}" type="${escapeXml(track.enclosureType)}"/>`);

  // Duration
  lines.push(`${indent(level + 1)}<!-- The "itunes:duration" tag defines the total running time in HH:MM:SS format. Required for Fountain Radio support. -->`);
  lines.push(`${indent(level + 1)}<itunes:duration>${track.duration}</itunes:duration>`);

  // Season (always 1)
  lines.push(`${indent(level + 1)}<!-- The "podcast:season" tag describes the season number. Music albums use season 1. -->`);
  lines.push(`${indent(level + 1)}<podcast:season>1</podcast:season>`);

  // Episode number (use track.episode if set, otherwise trackNumber)
  lines.push(`${indent(level + 1)}<!-- The "podcast:episode" tag is the track number on the album. See https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#episode -->`);
  lines.push(`${indent(level + 1)}<podcast:episode>${track.episode ?? track.trackNumber}</podcast:episode>`);

  // Explicit
  lines.push(`${indent(level + 1)}<!-- The "itunes:explicit" tag indicates whether this specific track contains explicit language. -->`);
  lines.push(`${indent(level + 1)}<itunes:explicit>${track.explicit ? 'true' : 'false'}</itunes:explicit>`);

  // Persons (only output at item level when overriding album persons)
  if (track.overridePersons) {
    lines.push(`${indent(level + 1)}<!-- Track-level "podcast:person" tags override the channel-level credits for this specific track. List anyone who contributed uniquely to this track (e.g. a featured artist or guest producer). -->`);
    track.persons.forEach(p => lines.push(generatePersonXml(p, level + 1)));
  }

  // Value block (override or inherit from album)
  const value = track.overrideValue && track.value ? track.value : album.value;
  if (value.recipients.length > 0) {
    if (track.overrideValue && track.value) {
      lines.push(`${indent(level + 1)}<!-- Track-level "podcast:value" block: overrides the channel-level payment splits for this specific track (e.g. to give a featured artist their share). -->`);
    } else {
      lines.push(`${indent(level + 1)}<!-- "podcast:value" block: this track uses the channel-level payment splits defined above. -->`);
    }
    lines.push(generateValueXml(value, level + 1));
  }

  // Unknown/unsupported item elements (preserved from import)
  if (track.unknownItemElements) {
    const unknownXml = generateUnknownXml(track.unknownItemElements, level + 1);
    if (unknownXml) lines.push(unknownXml);
  }

  lines.push(`${indent(level)}</item>`);

  return lines.join('\n');
};

// Main function to generate complete RSS feed
export const generateRssFeed = (album: Album): string => {
  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Collect additional namespaces needed for unknown elements
  const additionalNamespaces = collectAlbumNamespaces(album);
  const additionalNsDecl = generateNamespaceDeclarations(additionalNamespaces);

  // RSS root with namespaces
  const baseNs = 'xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"';
  const rssAttrs = additionalNsDecl ? `${baseNs} ${additionalNsDecl}` : baseNs;
  lines.push(`<!-- This feed follows the Demu feed template format. See https://github.com/de-mu/demu-feed-template for the original template and documentation. -->`);
  lines.push(`<!-- This "rss" tag denotes the beginning of the RSS feed and includes declarations of all XML namespaces used in the feed. Two namespaces are declared: the "podcast" namespace from Podcast Index and the "iTunes" namespace from Apple. -->`);
  lines.push(`<rss ${rssAttrs} version="2.0">`);

  // Channel
  lines.push(`${indent(1)}<!-- The "channel" tag contains metadata describing this feed as a whole. For a music album, the channel describes the album. Each track on the album becomes an "item" inside the channel. -->`);
  lines.push(`${indent(1)}<channel>`);

  // Common channel elements
  lines.push(...generateCommonChannelElements(album, album.medium, 2));

  // Publisher reference (if this album belongs to a publisher)
  if (album.publisher) {
    const publisherXml = generatePublisherXml(album.publisher, 2);
    if (publisherXml) {
      lines.push(`${indent(2)}<!-- The "podcast:publisher" tag links this album to a publisher or label feed, establishing the organizational hierarchy. -->`);
      lines.push(publisherXml);
    }
  }

  // Unknown/unsupported channel elements (preserved from import)
  if (album.unknownChannelElements) {
    const unknownXml = generateUnknownXml(album.unknownChannelElements, 2);
    if (unknownXml) lines.push(unknownXml);
  }

  // Tracks
  if (album.tracks.length > 0) {
    lines.push(`${indent(2)}<!-- Each "item" tag below represents one track on the album. In a music feed, each item is a song with its own title, audio file, and metadata. -->`);
    album.tracks.forEach(track => lines.push(generateTrackXml(track, album, 2)));
  }

  // Close channel and rss
  lines.push(`${indent(1)}</channel>`);
  lines.push('</rss>');

  return lines.join('\n');
};

// Main function to generate complete Publisher RSS feed
export const generatePublisherRssFeed = (publisher: PublisherFeed): string => {
  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Collect additional namespaces needed for unknown elements
  const prefixes = new Set<string>();
  if (publisher.unknownChannelElements) {
    collectNamespacePrefixes(publisher.unknownChannelElements, prefixes);
  }
  const additionalNsDecl = generateNamespaceDeclarations(prefixes);

  // RSS root with namespaces
  const baseNs = 'xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"';
  const rssAttrs = additionalNsDecl ? `${baseNs} ${additionalNsDecl}` : baseNs;
  lines.push(`<!-- This feed follows the Demu feed template format. See https://github.com/de-mu/demu-feed-template for the original template and documentation. -->`);
  lines.push(`<!-- This "rss" tag denotes the beginning of the RSS feed and includes declarations of all XML namespaces used in the feed. Two namespaces are declared: the "podcast" namespace from Podcast Index and the "iTunes" namespace from Apple. -->`);
  lines.push(`<rss ${rssAttrs} version="2.0">`);

  // Channel
  lines.push(`${indent(1)}<!-- The "channel" tag contains metadata describing this publisher or label catalog. Each album or release in the catalog is referenced as a "podcast:remoteItem" below. -->`);
  lines.push(`${indent(1)}<channel>`);

  // Common channel elements (medium is always "publisher" for publisher feeds)
  lines.push(...generateCommonChannelElements(publisher, 'publisher', 2));

  // Remote items - the feeds this publisher owns
  if (publisher.remoteItems.length > 0) {
    lines.push(`${indent(2)}<!-- Each "podcast:remoteItem" tag below references an album or feed that this publisher owns or distributes. "feedGuid" and "feedUrl" identify the referenced feed. -->`);
    publisher.remoteItems.forEach(item => {
      lines.push(generateRemoteItemXml(item, 2));
    });
  }

  // Unknown/unsupported channel elements (preserved from import)
  if (publisher.unknownChannelElements) {
    const unknownXml = generateUnknownXml(publisher.unknownChannelElements, 2);
    if (unknownXml) lines.push(unknownXml);
  }

  // Close channel and rss
  lines.push(`${indent(1)}</channel>`);
  lines.push('</rss>');

  return lines.join('\n');
};

// Download XML as file
export const downloadXml = (xml: string, filename: string = 'feed.xml'): void => {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Copy XML to clipboard
export const copyToClipboard = async (xml: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(xml);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};
