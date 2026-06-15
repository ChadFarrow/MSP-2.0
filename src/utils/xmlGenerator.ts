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
  lines.push(`${indent(level + 1)}<!-- The "podcast:valueRecipient" tag describes each recipient in the value split. This can point to a lightning node's public address directly, as in the examples below. There are also services such as Alby, Fountain, Satoshis.Stream and others that can be used to create boostable lightning wallets. For more info on how to set up a wallet to build out a valueRecipient tag with, refer to the guides here: https://value4value.info/guides/ -->`);
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
    : `${indent(level)}<!-- The "itunes:author" tag describes the author of the content in the feed. For a music release, we put the album's artist here. -->`);
  lines.push(`${indent(level)}<itunes:author>${escapeXml(data.author)}</itunes:author>`);

  // Description
  lines.push(isPublisher
    ? `${indent(level)}<!-- The "description" tag gives listeners a brief overview of this publisher or label catalog. -->`
    : `${indent(level)}<!-- This "description" tag can be updated to give listeners a brief description of the album. -->`);
  lines.push(`${indent(level)}<description>`);
  lines.push(`${indent(level + 1)}${escapeXml(data.description)}`);
  lines.push(`${indent(level)}</description>`);

  // Link
  if (data.link) {
    lines.push(`${indent(level)}<!-- The "link" tag holds the main link you want listeners to visit. Usually a band website will be put here. -->`);
    lines.push(`${indent(level)}<link>${escapeXml(data.link)}</link>`);
  }

  // Language
  lines.push(`${indent(level)}<!-- The "language" tag describes the language the music is in. See https://www.rssboard.org/rss-language-codes for a full list of RSS Language codes. -->`);
  lines.push(`${indent(level)}<language>${data.language}</language>`);

  // Generator
  lines.push(`${indent(level)}<!-- The "generator" tag describes how this feed was created. -->`);
  lines.push(`${indent(level)}<generator>MSP 2.0 - Music Side Project Studio</generator>`);

  // Dates
  lines.push(`${indent(level)}<!-- The pubDate refers to the date and time the most recent item in the feed was published. Date and time should be in RFC-822 format. -->`);
  lines.push(`${indent(level)}<pubDate>${formatRFC822Date(data.pubDate)}</pubDate>`);
  lines.push(`${indent(level)}<!-- The "lastBuildDate" refers to the last time the feed was "built", it most often will match the pubDate above. also should be in RFC-822 -->`);
  lines.push(`${indent(level)}<lastBuildDate>${formatRFC822Date(data.lastBuildDate)}</lastBuildDate>`);

  // Locked
  if (data.locked && data.lockedOwner) {
    lines.push(`${indent(level)}<!-- The "podcast:locked" tag describes which platforms/apps, if any, are disallowed from importing this feed. For more info see https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#locked -->`);
    lines.push(`${indent(level)}<podcast:locked owner="${escapeXml(data.lockedOwner)}">yes</podcast:locked>`);
  }

  // GUID
  if (data.podcastGuid) {
    lines.push(`${indent(level)}<!-- The "podcast:guid" tag serves as a Globally Unique ID for the feed itself. MSP generates this automatically for you (a random UUID) when you create a feed, so there's no need to make one yourself. Once set it should never change, as it's how podcast apps and Podcast Index identify your feed across platforms. For full documentation on the "podcast:guid" tag: https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#guid -->`);
    lines.push(`${indent(level)}<podcast:guid>${escapeXml(data.podcastGuid)}</podcast:guid>`);
  }

  // Artist Npub (only for Album feeds)
  if ((data as Album).artistNpub) {
    lines.push(`${indent(level)}<!-- The "podcast:txt" tag stores supplemental text metadata. Here it holds the artist's Nostr public key, enabling identity verification and social features. -->`);
    lines.push(`${indent(level)}<podcast:txt purpose="npub">${escapeXml((data as Album).artistNpub!)}</podcast:txt>`);
  }

  // Categories (default to Music for music feeds)
  const categories = data.categories.length > 0 ? data.categories : ['Music'];
  lines.push(`${indent(level)}<!-- The "itunes:category" tags describe which categories (and optional subcategories) your feed falls under. You may include up to 3 of these tags. For a full list and more info on iTunes categories see https://podcasters.apple.com/support/1691-apple-podcasts-categories -->`);
  categories.forEach(cat => {
    lines.push(`${indent(level)}<itunes:category text="${escapeXml(cat)}" />`);
  });

  // Keywords
  if (data.keywords) {
    lines.push(`${indent(level)}<!-- The "itunes:keywords" tag contains search terms to help listeners discover your music. -->`);
    lines.push(`${indent(level)}<itunes:keywords>${escapeXml(data.keywords)}</itunes:keywords>`);
  }

  // Image
  if (data.imageUrl) {
    lines.push(`${indent(level)}<!-- The RSS image tag displays an image to aggregators digesting this feed. It has 4 children tags: url, title, link, and description. -->`);
    lines.push(`${indent(level)}<image>`);
    lines.push(`${indent(level + 1)}<!-- This url tag links directly to the image file's location. Be sure CORS policy allows all origins and headers. -->`);
    lines.push(`${indent(level + 1)}<url>${escapeXml(data.imageUrl)}</url>`);
    lines.push(`${indent(level + 1)}<!-- This tag is the title for the image. -->`);
    lines.push(`${indent(level + 1)}<title>${escapeXml(data.imageTitle || data.title)}</title>`);
    if (data.imageLink) {
      lines.push(`${indent(level + 1)}<!-- Below is another opportunity to add a link. A link to the band website is most commonly used here also. -->`);
      lines.push(`${indent(level + 1)}<link>${escapeXml(data.imageLink)}</link>`);
    }
    if (data.imageDescription) {
      lines.push(`${indent(level + 1)}<!-- This "description" tag can be used to describe the artwork or the album as a whole. -->`);
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
    : `${indent(level)}<!-- The "podcast:medium" tag is used to tell apps that this feed contains music. It is intended to describe feeds that have *only* music as the contents of its item enclosures. Shows about music or featuring music should not use a "podcast:medium" of music if they are podcasts or radio shows. If you are publishing a music album or single with this feed, the tag below should remain unchanged. If you are publishing a playlist of other existing songs (or any other "list mediums"), you should add a capital "L" to the end of the medium tag's content. More information is available here: https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#medium -->`);
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
    lines.push(`${indent(level)}<!-- The "person" tags describe people of note to the project in some way. This can include individual band members, the band as a whole, writers, producers, featured artists and more. Each one is like a "credit" with the person's name as the tag's content. The person tag has 4 attributes: "href" is a link to some landing page for that person (maybe a personal website or social profile), "img" is a link to an online profile picture, "group" and "role" describe the person's role in the project. You can list person tags in the channel level, the item level, or both. If present in the item level, person tags will overwrite all channel-level persons, so channel-level persons who are also involved in specific items should be included in both. For more info please see https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#person -->`);
    data.persons.forEach(p => lines.push(generatePersonXml(p, level)));
  }

  // Value block
  if (data.value.recipients.length > 0) {
    lines.push(`${indent(level)}<!-- The "podcast:value" tag describes how each payment should be divided and where the payments should be routed when this feed receives boosts or streaming payments. The parent tag describes the type and method of payments as well as a "suggested" boost amount. If you intend to receive lightning payments of Bitcoin then the "type" and "method" attributes should not be changed. Each "podcast:valueRecipient" tag will be listed as a child of this parent tag. Further reading: https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#value -->`);
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
    lines.push(`${indent(level + 1)}<!-- The "description" tag holds an optional description of the track. -->`);
    lines.push(`${indent(level + 1)}<description>${escapeXml(track.description)}</description>`);
  }

  lines.push(`${indent(level + 1)}<!-- The "pubDate" tag describes the date this track was published. This could be the same as the album's pubDate, or more songs could be added to a feed after it is initially published. Date time data must be in RFC-822 format. -->`);
  lines.push(`${indent(level + 1)}<pubDate>${formatRFC822Date(track.pubDate)}</pubDate>`);

  lines.push(`${indent(level + 1)}<!-- The "guid" tag defines a Globally Unique Identifier for an individual item in your RSS feed. It is expected to be a string, but there are technically no roles for its syntax other than it must be unique. In order to generate unique GUIDs for each item in your feed, it is recommended to use a GUID generator such as this one: https://guidgenerator.com/ Simply indicate the number of GUIDs you need (one for each item in your feed) and click "Generate some GUIDs!" Make sure each one of your items does have a unique GUID, because this is the identifier used to make remoteItems and the valueTimeSplit work. If your song is played on a music show, this is how the boosts get to the right place! -->`);
  lines.push(`${indent(level + 1)}<guid isPermaLink="false">${escapeXml(track.guid)}</guid>`);

  if (track.transcriptUrl) {
    lines.push(`${indent(level + 1)}<!-- The "podcast:transcript" tag links to an external file with lyrics. An srt file can be made which time codes the lyrics of your song to be displayed in time with the track. Additional reading on the transcript tag: https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#transcript Instructions for how to time code captions in .srt files: https://itsupport.ou.edu/TDClient/30/Unified/KB/ArticleDet?ID=384 -->`);
    lines.push(`${indent(level + 1)}<podcast:transcript url="${escapeXml(track.transcriptUrl)}" type="${escapeXml(track.transcriptType || 'application/srt')}" />`);
  }

  // Track artwork (falls back to album)
  const artUrl = track.trackArtUrl || album.imageUrl;
  if (artUrl) {
    lines.push(`${indent(level + 1)}<!-- The "itunes:image" tag at the item level links to art of the individual track if different from the overall album art at the channel level. If the tag below is not present, the channel level's image will be displayed instead. -->`);
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
  lines.push(`${indent(level + 1)}<!-- The "enclosure" tag is where the true magic of podcasting sits. This tag holds the audio or video file that represents the main content of the "item" tag. The url attribute links to the file itself, while the length attribute shows the size of the file in bytes. The type attribute shows the file's standard MIME type. If you are updating the tag with your own mp3 file, change the url to point to your own hosted mp3 file and change the length to the size of your mp3 in bytes. For a list of common MIME types see https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types -->`);
  lines.push(`${indent(level + 1)}<enclosure url="${escapeXml(enclosureUrl)}" length="${fileLength}" type="${escapeXml(track.enclosureType)}"/>`);

  // Duration
  lines.push(`${indent(level + 1)}<!-- The "itunes:duration" tag defines the total duration of the enclosure file in HH:MM:SS format. It currently is required for Fountain Radio functionality, although most podcasting and decentralized music apps surface the duration directly from the file. As such, this tag was previously considered optional for decentralized music feeds, but should be included if you want your music to work in Fountain Radio. -->`);
  lines.push(`${indent(level + 1)}<itunes:duration>${track.duration}</itunes:duration>`);

  // Season (always 1)
  lines.push(`${indent(level + 1)}<!-- The "podcast:season" tag describes the season number. Music albums use season 1. -->`);
  lines.push(`${indent(level + 1)}<podcast:season>1</podcast:season>`);

  // Episode number (use track.episode if set, otherwise trackNumber)
  lines.push(`${indent(level + 1)}<!-- The "podcast:episode" tag describes an episode number. In decentralized music, we use this to describe an item's track number on the album. Further reading: https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#episode -->`);
  lines.push(`${indent(level + 1)}<podcast:episode>${track.episode ?? track.trackNumber}</podcast:episode>`);

  // Explicit
  lines.push(`${indent(level + 1)}<!-- The "itunes:explicit" tag indicates whether this specific track contains explicit language. -->`);
  lines.push(`${indent(level + 1)}<itunes:explicit>${track.explicit ? 'true' : 'false'}</itunes:explicit>`);

  // Persons (only output at item level when overriding album persons)
  if (track.overridePersons) {
    lines.push(`${indent(level + 1)}<!-- The "podcast:person" tag is valid at both the channel and item levels. See above in the channel level for links to documentation. If you are listing specific people here in the item level, remember that these person tags will overwrite all tags present at the channel level, so person tags who are also relevant to this specific item should be listed at both the item and channel levels. -->`);
    track.persons.forEach(p => lines.push(generatePersonXml(p, level + 1)));
  }

  // Value block (override or inherit from album)
  const value = track.overrideValue && track.value ? track.value : album.value;
  if (value.recipients.length > 0) {
    if (track.overrideValue && track.value) {
      lines.push(`${indent(level + 1)}<!-- The "podcast:value" tag is valid at both the channel and item levels. See above in the channel level for links to the documentation. A value tag in the item will overwrite the channel level tag and will be prioritized by most apps if a listener boosts the currently playing track. However, different apps may handle the display and experience of item vs channel level boosts differently, so it's important to test your splits in different apps. Common use cases of value tags include writing splits at the channel level for those who worked on the entire project and writing splits at the item level for people who may have been featured on or contributed to specific tracks, but not necessarily on all of the tracks on the album. This might include a guest producer, an album artwork designer or a featured vocalist or musician. -->`);
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
  lines.push(`<!-- This "rss" tag denotes the beginning of the RSS feed and includes declarations of all XML namespaces used in the feed. Below, two namespaces are declared: the "podcast" namespace from Podcast Index and the "iTunes" namespace from Apple. -->`);
  lines.push(`<rss ${rssAttrs} version="2.0">`);

  // Channel
  lines.push(`${indent(1)}<!-- Below is the "channel" tag. It contains metadata describing the feed as a whole. The "channel" tag in RSS has traditionally been used to describe a podcast or blog. In the decentralized music world, the "channel" tag could be used to describe an album, a band, a label, a playlist, or more. The most common use of channels thus far has been for publishing albums, and this template has been designed for that particular use case. -->`);
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
    lines.push(`${indent(2)}<!-- The "item" tag describes an item in your RSS feed. In a music album there should be one item for each track on the album. Singles could be released with one item or with an "A-side" item and an additional "B-side" item. Many formats are possible, but the important part is you need to have an item for each song in your feed. All the child tags of the item tag describe that individual track. -->`);
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
  lines.push(`<!-- This "rss" tag denotes the beginning of the RSS feed and includes declarations of all XML namespaces used in the feed. Below, two namespaces are declared: the "podcast" namespace from Podcast Index and the "iTunes" namespace from Apple. -->`);
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

// Remove the educational <!-- ... --> comment lines from generated XML.
// Each comment is emitted on its own line, so dropping whole comment lines
// leaves the surrounding tags untouched. Used for the View Feed "Show comments" toggle.
export const stripXmlComments = (xml: string): string => {
  return xml.replace(/^[ \t]*<!--.*?-->[ \t]*\n/gm, '');
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
