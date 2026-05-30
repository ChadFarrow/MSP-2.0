// Blossom server upload utilities
import type { Album, PublisherFeed } from '../types/feed';
import type { NostrEvent } from '../types/nostr';
import { generateRssFeed, generatePublisherRssFeed } from './xmlGenerator';
import { hexToNpub } from './nostr';
import { DEFAULT_RELAYS, publishEventToRelays } from './nostrRelay';
import { hasSigner, signEventWithTimeout, getPublicKeyWithTimeout } from './nostrSigner';

// Blossom auth event kind
const BLOSSOM_AUTH_KIND = 24242;

// Kind 1063 for file metadata (NIP-94)
const FILE_METADATA_KIND = 1063;

const CLIENT_TAG = 'MSP 2.0';

/**
 * Calculate SHA256 hash of content
 */
async function sha256Hash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculate SHA256 hash of binary data
 */
async function sha256HashBinary(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Well-known public Blossom servers tried in parallel on media upload
export const BLOSSOM_MEDIA_SERVERS = [
  'https://blossom.primal.net',
  'https://blossom.band',
  'https://cdn.satellite.earth',
  'https://nostr.download',
];

/**
 * Upload a media file to all known Blossom servers in parallel.
 * Returns the URL from the first server that accepts the upload.
 */
export async function uploadMediaToBlossom(
  file: File
): Promise<{ success: boolean; message: string; url?: string }> {
  if (!hasSigner()) {
    return { success: false, message: 'Nostr login required for Blossom upload' };
  }

  try {
    const pubkey = await getPublicKeyWithTimeout();
    const arrayBuffer = await file.arrayBuffer();
    const hash = await sha256HashBinary(arrayBuffer);

    const authEvent = await createBlossomAuthEvent(hash, pubkey, 'upload');
    const signedAuthEvent = await signEventWithTimeout(authEvent);
    const authHeader = 'Nostr ' + btoa(JSON.stringify(signedAuthEvent));

    const uploadToServer = async (server: string): Promise<string> => {
      const serverUrl = server.replace(/\/$/, '');
      const response = await fetch(`${serverUrl}/upload`, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: arrayBuffer,
      });
      if (!response.ok) {
        throw new Error(`${serverUrl}: ${response.status}`);
      }
      const result = await response.json();
      return result.url || `${serverUrl}/${hash}`;
    };

    const results = await Promise.allSettled(
      BLOSSOM_MEDIA_SERVERS.map(server => uploadToServer(server))
    );

    const firstSuccess = results.find(r => r.status === 'fulfilled');
    if (firstSuccess && firstSuccess.status === 'fulfilled') {
      const failures = results.filter(r => r.status === 'rejected').length;
      if (failures > 0) {
        console.warn(`Blossom: uploaded to ${results.length - failures}/${results.length} servers`);
      }
      return { success: true, message: 'Uploaded successfully', url: firstSuccess.value };
    }

    const errors = results
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason?.message || 'Unknown error')
      .join('; ');
    return { success: false, message: `All servers rejected the upload: ${errors}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message };
  }
}

/**
 * Create Blossom auth event (kind 24242)
 */
async function createBlossomAuthEvent(
  hash: string,
  pubkey: string,
  action: 'upload' | 'delete' = 'upload'
): Promise<NostrEvent> {
  const expiration = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

  return {
    kind: BLOSSOM_AUTH_KIND,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', action],
      ['x', hash],
      ['expiration', String(expiration)]
    ],
    content: `${action} ${hash}`
  };
}

/**
 * Create NIP-94 file metadata event for RSS feed
 */
function createFileMetadataEvent(
  blossomUrl: string,
  hash: string,
  fileSize: number,
  album: Album,
  pubkey: string
): NostrEvent {
  return {
    kind: FILE_METADATA_KIND,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['url', blossomUrl],
      ['m', 'application/rss+xml'],
      ['x', hash],
      ['size', String(fileSize)],
      ['alt', `RSS feed for: ${album.title}`],
      ['title', album.title],
      ['d', album.podcastGuid],
      ['client', CLIENT_TAG]
    ],
    content: `${album.title} - Podcast RSS Feed`
  };
}

/**
 * Publish file metadata to Nostr relays
 */
async function publishFileMetadata(
  blossomUrl: string,
  hash: string,
  fileSize: number,
  album: Album,
  relays: string[]
): Promise<{ success: boolean; eventId?: string }> {
  if (!hasSigner()) {
    return { success: false };
  }

  try {
    const pubkey = await getPublicKeyWithTimeout();
    const unsignedEvent = createFileMetadataEvent(blossomUrl, hash, fileSize, album, pubkey);
    const signedEvent = await signEventWithTimeout(unsignedEvent);

    const { successCount } = await publishEventToRelays(signedEvent as NostrEvent, relays);

    return {
      success: successCount > 0,
      eventId: (signedEvent as NostrEvent).id
    };
  } catch {
    return { success: false };
  }
}

/**
 * Upload RSS feed to Blossom server
 */
export async function uploadToBlossom(
  album: Album,
  blossomServer: string
): Promise<{ success: boolean; message: string; url?: string; stableUrl?: string }> {
  if (!hasSigner()) {
    return { success: false, message: 'Not logged in' };
  }

  try {
    const pubkey = await getPublicKeyWithTimeout();

    // Generate RSS XML with updated lastBuildDate
    const rssXml = generateRssFeed({ ...album, lastBuildDate: new Date().toUTCString() });

    // Calculate hash
    const hash = await sha256Hash(rssXml);

    // Create and sign auth event
    const authEvent = await createBlossomAuthEvent(hash, pubkey, 'upload');
    const signedAuthEvent = await signEventWithTimeout(authEvent);

    // Base64 encode the signed event for Authorization header
    const authHeader = 'Nostr ' + btoa(JSON.stringify(signedAuthEvent));

    // Normalize server URL
    const serverUrl = blossomServer.replace(/\/$/, '');

    // Upload to Blossom server
    const response = await fetch(`${serverUrl}/upload`, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/xml'
      },
      body: rssXml
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, message: `Upload failed: ${response.status} - ${errorText}` };
    }

    const result = await response.json();

    // Blossom returns the URL in the response
    const fileUrl = result.url || `${serverUrl}/${hash}.xml`;

    // Publish NIP-94 file metadata event to enable stable URL
    const fileSize = new Blob([rssXml]).size;
    const metadataResult = await publishFileMetadata(
      fileUrl,
      hash,
      fileSize,
      album,
      DEFAULT_RELAYS
    );

    // Construct stable URL if metadata was published
    let stableUrl: string | undefined;
    if (metadataResult.success) {
      const npub = hexToNpub(pubkey);
      stableUrl = `${window.location.origin}/api/feed/${npub}/${album.podcastGuid}.xml`;
    }

    return {
      success: true,
      message: metadataResult.success
        ? 'Feed uploaded and metadata published'
        : 'Feed uploaded (metadata publish failed)',
      url: fileUrl,
      stableUrl
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message };
  }
}

/**
 * Generic upload feed to Blossom server - works with both album and publisher feeds
 */
export async function uploadFeedToBlossom(
  feed: Album | PublisherFeed,
  feedType: 'album' | 'publisher',
  blossomServer: string
): Promise<{ success: boolean; message: string; url?: string; stableUrl?: string }> {
  if (!hasSigner()) {
    return { success: false, message: 'Not logged in' };
  }

  try {
    const pubkey = await getPublicKeyWithTimeout();

    // Generate RSS XML based on feed type
    // Update lastBuildDate to current time per RSS 2.0 spec
    const now = new Date().toUTCString();
    let rssXml: string;
    let feedGuid: string;

    if (feedType === 'publisher') {
      const publisherFeed = feed as PublisherFeed;
      rssXml = generatePublisherRssFeed({ ...publisherFeed, lastBuildDate: now });
      feedGuid = publisherFeed.podcastGuid;
    } else {
      const album = feed as Album;
      rssXml = generateRssFeed({ ...album, lastBuildDate: now });
      feedGuid = album.podcastGuid;
    }

    // Calculate hash
    const hash = await sha256Hash(rssXml);

    // Create and sign auth event
    const authEvent = await createBlossomAuthEvent(hash, pubkey, 'upload');
    const signedAuthEvent = await signEventWithTimeout(authEvent);

    // Base64 encode the signed event for Authorization header
    const authHeader = 'Nostr ' + btoa(JSON.stringify(signedAuthEvent));

    // Normalize server URL
    const serverUrl = blossomServer.replace(/\/$/, '');

    // Upload to Blossom server
    const response = await fetch(`${serverUrl}/upload`, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/xml'
      },
      body: rssXml
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, message: `Upload failed: ${response.status} - ${errorText}` };
    }

    const result = await response.json();

    // Blossom returns the URL in the response
    const fileUrl = result.url || `${serverUrl}/${hash}.xml`;

    // Publish NIP-94 file metadata event to enable stable URL
    const fileSize = new Blob([rssXml]).size;
    const metadataResult = await publishFileMetadata(
      fileUrl,
      hash,
      fileSize,
      feed as Album, // Type assertion for compatibility
      DEFAULT_RELAYS
    );

    // Construct stable URL if metadata was published
    let stableUrl: string | undefined;
    if (metadataResult.success) {
      const npub = hexToNpub(pubkey);
      stableUrl = `${window.location.origin}/api/feed/${npub}/${feedGuid}.xml`;
    }

    return {
      success: true,
      message: metadataResult.success
        ? 'Feed uploaded and metadata published'
        : 'Feed uploaded (metadata publish failed)',
      url: fileUrl,
      stableUrl
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message };
  }
}
