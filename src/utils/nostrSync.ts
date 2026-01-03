import type { Album, Track, Person, ValueRecipient } from '../types/feed';
import type { NostrEvent, SavedAlbumInfo, NostrMusicTrackInfo, NostrMusicAlbumGroup, NostrZapSplit, NostrMusicContent } from '../types/nostr';
import { generateRssFeed } from './xmlGenerator';
import { parseRssFeed } from './xmlParser';
import { formatReleasedDate } from './dateUtils';
import {
  DEFAULT_RELAYS,
  connectRelay,
  collectEvents,
  publishEventToRelays
} from './nostrRelay';

// Re-export for backward compatibility
export { DEFAULT_RELAYS };

// Re-export Blossom functions from dedicated module
export { uploadToBlossom } from './blossom';

// Kind 30054 for podcast/RSS feeds (parameterized replaceable)
const RSS_FEED_KIND = 30054;
const CLIENT_TAG = 'MSP 2.0';

// Kind 36787 for Nostr music tracks
const MUSIC_TRACK_KIND = 36787;

// Nostr profile metadata interface
export interface NostrProfile {
  name?: string;
  display_name?: string;
  picture?: string;
  nip05?: string;
  about?: string;
}

// Fetch user profile (kind 0) from relays
export async function fetchNostrProfile(
  pubkey: string,
  relays = DEFAULT_RELAYS
): Promise<NostrProfile | null> {
  try {
    let latestEvent: NostrEvent | null = null;

    const results = await Promise.allSettled(
      relays.map(async (relayUrl) => {
        const ws = await connectRelay(relayUrl, 3000);
        try {
          const subId = Math.random().toString(36).substring(7);
          const filter = {
            kinds: [0],
            authors: [pubkey],
            limit: 1
          };

          ws.send(JSON.stringify(['REQ', subId, filter]));
          const events = await collectEvents(ws, subId, 3000);
          return events;
        } finally {
          ws.close();
        }
      })
    );

    // Find the latest profile event
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const event of result.value) {
          if (!latestEvent || event.created_at > latestEvent.created_at) {
            latestEvent = event;
          }
        }
      }
    }

    if (latestEvent && latestEvent.content) {
      return JSON.parse(latestEvent.content) as NostrProfile;
    }

    return null;
  } catch {
    return null;
  }
}

// Create an unsigned event for an RSS feed
function createFeedEvent(rssXml: string, podcastGuid: string, title: string, pubkey: string): NostrEvent {
  return {
    kind: RSS_FEED_KIND,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', podcastGuid],
      ['title', title || 'Untitled Album'],
      ['client', CLIENT_TAG]
    ],
    content: rssXml
  };
}

// Save album to Nostr relays
export async function saveAlbumToNostr(
  album: Album,
  hasChanges = true,
  relays = DEFAULT_RELAYS
): Promise<{ success: boolean; message: string }> {
  if (!window.nostr) {
    return { success: false, message: 'Nostr extension not found' };
  }

  try {
    // Get public key
    const pubkey = await window.nostr.getPublicKey();

    // Only update lastBuildDate if there are actual changes
    const updatedAlbum = hasChanges
      ? { ...album, lastBuildDate: new Date().toUTCString() }
      : album;

    // Generate RSS XML from album
    const rssXml = generateRssFeed(updatedAlbum);

    // Create and sign the event
    const unsignedEvent = createFeedEvent(rssXml, album.podcastGuid, album.title, pubkey);
    const signedEvent = await window.nostr.signEvent(unsignedEvent);

    // Publish to relays
    const { successCount } = await publishEventToRelays(signedEvent, relays);

    if (successCount === 0) {
      return { success: false, message: 'Failed to publish to any relay' };
    }

    return {
      success: true,
      message: `Published to ${successCount}/${relays.length} relays`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message };
  }
}

// Load saved albums from Nostr relays
export async function loadAlbumsFromNostr(
  relays = DEFAULT_RELAYS
): Promise<{ success: boolean; albums: SavedAlbumInfo[]; message: string }> {
  if (!window.nostr) {
    return { success: false, albums: [], message: 'Nostr extension not found' };
  }

  try {
    const pubkey = await window.nostr.getPublicKey();
    const allEvents: NostrEvent[] = [];

    // Query each relay
    const results = await Promise.allSettled(
      relays.map(async (relayUrl) => {
        const ws = await connectRelay(relayUrl);
        try {
          const subId = Math.random().toString(36).substring(7);
          const filter = {
            kinds: [RSS_FEED_KIND],
            authors: [pubkey]
          };

          ws.send(JSON.stringify(['REQ', subId, filter]));
          const events = await collectEvents(ws, subId);
          return events;
        } finally {
          ws.close();
        }
      })
    );

    // Collect all events from successful relays
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allEvents.push(...result.value);
      }
    }

    // Deduplicate by event id and filter by client tag
    const uniqueEvents = new Map<string, NostrEvent>();
    for (const event of allEvents) {
      const clientTag = event.tags.find(t => t[0] === 'client')?.[1];
      if (event.id && !uniqueEvents.has(event.id) && clientTag === CLIENT_TAG) {
        uniqueEvents.set(event.id, event);
      }
    }

    // Convert to SavedAlbumInfo
    const albums: SavedAlbumInfo[] = [];
    for (const event of uniqueEvents.values()) {
      const dTag = event.tags.find(t => t[0] === 'd')?.[1] || '';
      const title = event.tags.find(t => t[0] === 'title')?.[1] || 'Untitled';

      albums.push({
        id: event.id || '',
        dTag,
        title,
        createdAt: event.created_at,
        pubkey: event.pubkey || ''
      });
    }

    // Sort by creation date (newest first)
    albums.sort((a, b) => b.createdAt - a.createdAt);

    return {
      success: true,
      albums,
      message: `Found ${albums.length} album(s)`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, albums: [], message };
  }
}

// Load a specific album by d tag
export async function loadAlbumByDTag(
  dTag: string,
  relays = DEFAULT_RELAYS
): Promise<{ success: boolean; album: Album | null; message: string }> {
  if (!window.nostr) {
    return { success: false, album: null, message: 'Nostr extension not found' };
  }

  try {
    const pubkey = await window.nostr.getPublicKey();
    let latestEvent: NostrEvent | null = null;

    // Query each relay
    const results = await Promise.allSettled(
      relays.map(async (relayUrl) => {
        const ws = await connectRelay(relayUrl);
        try {
          const subId = Math.random().toString(36).substring(7);
          const filter = {
            kinds: [RSS_FEED_KIND],
            authors: [pubkey],
            '#d': [dTag]
          };

          ws.send(JSON.stringify(['REQ', subId, filter]));
          const events = await collectEvents(ws, subId);
          return events;
        } finally {
          ws.close();
        }
      })
    );

    // Find the latest event
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const event of result.value) {
          if (!latestEvent || event.created_at > latestEvent.created_at) {
            latestEvent = event;
          }
        }
      }
    }

    if (!latestEvent) {
      return { success: false, album: null, message: 'Album not found' };
    }

    // Parse the RSS XML content back to Album
    const album = parseRssFeed(latestEvent.content);
    return { success: true, album, message: 'Album loaded successfully' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, album: null, message };
  }
}

// Parse content field for lyrics, credits, license
function parseNostrMusicContent(content: string): NostrMusicContent {
  const result: NostrMusicContent = {};

  if (!content || !content.trim()) return result;

  // Split by known section headers
  const sections = content.split(/\n\n(?=Lyrics:|Credits:|License:)/i);

  for (const section of sections) {
    const trimmed = section.trim();

    if (trimmed.toLowerCase().startsWith('lyrics:')) {
      result.lyrics = trimmed.substring(7).trim();
    } else if (trimmed.toLowerCase().startsWith('credits:')) {
      result.credits = trimmed.substring(8).trim();
    } else if (trimmed.toLowerCase().startsWith('license:')) {
      result.license = trimmed.substring(8).trim();
    } else if (!result.lyrics && trimmed) {
      // If no section header and no lyrics yet, treat as lyrics
      result.lyrics = trimmed;
    }
  }

  return result;
}

// Parse a kind 36787 event into NostrMusicTrackInfo
function parseNostrMusicEvent(event: NostrEvent): NostrMusicTrackInfo | null {
  const getTag = (name: string): string | undefined =>
    event.tags.find(t => t[0] === name)?.[1];

  const dTag = getTag('d');
  const title = getTag('title');
  const url = getTag('url');

  // Required fields
  if (!dTag || !title || !url) return null;

  // Parse genres from 't' tags
  const genres = event.tags
    .filter(t => t[0] === 't')
    .map(t => t[1])
    .filter(Boolean);

  // Parse zap splits from 'zap' tags
  const zapSplits: NostrZapSplit[] = event.tags
    .filter(t => t[0] === 'zap')
    .map(t => ({
      pubkey: t[1] || '',
      relay: t[2] || undefined,
      splitPercentage: parseInt(t[3]) || 0
    }))
    .filter(z => z.pubkey && z.splitPercentage > 0);

  // Parse content for lyrics, credits, license
  const parsedContent = parseNostrMusicContent(event.content);

  return {
    id: event.id || '',
    dTag,
    title,
    artist: getTag('artist') || 'Unknown Artist',
    album: getTag('album') || 'Singles',
    trackNumber: parseInt(getTag('track_number') || '1') || 1,
    url,
    imageUrl: getTag('image'),
    released: getTag('released'),
    language: getTag('language'),
    genres,
    zapSplits,
    content: parsedContent,
    createdAt: event.created_at
  };
}

// Group tracks by album for UI display
export function groupTracksByAlbum(tracks: NostrMusicTrackInfo[]): NostrMusicAlbumGroup[] {
  const albumMap = new Map<string, NostrMusicAlbumGroup>();

  for (const track of tracks) {
    const key = `${track.album}|${track.artist}`;

    if (!albumMap.has(key)) {
      albumMap.set(key, {
        albumName: track.album,
        artist: track.artist,
        imageUrl: track.imageUrl,
        tracks: []
      });
    }

    const group = albumMap.get(key)!;
    group.tracks.push(track);

    // Use first track with image as album image
    if (!group.imageUrl && track.imageUrl) {
      group.imageUrl = track.imageUrl;
    }
  }

  // Sort tracks within each album by track number
  for (const group of albumMap.values()) {
    group.tracks.sort((a, b) => a.trackNumber - b.trackNumber);
  }

  // Return albums sorted alphabetically
  return Array.from(albumMap.values())
    .sort((a, b) => a.albumName.localeCompare(b.albumName));
}

// Fetch music track events (kind 36787) for logged-in user
export async function fetchNostrMusicTracks(
  relays = DEFAULT_RELAYS
): Promise<{ success: boolean; tracks: NostrMusicTrackInfo[]; message: string }> {
  if (!window.nostr) {
    return { success: false, tracks: [], message: 'Nostr extension not found' };
  }

  try {
    const pubkey = await window.nostr.getPublicKey();
    const allEvents: NostrEvent[] = [];

    // Query each relay
    const results = await Promise.allSettled(
      relays.map(async (relayUrl) => {
        const ws = await connectRelay(relayUrl);
        try {
          const subId = Math.random().toString(36).substring(7);
          const filter = {
            kinds: [MUSIC_TRACK_KIND],
            authors: [pubkey]
          };

          ws.send(JSON.stringify(['REQ', subId, filter]));
          const events = await collectEvents(ws, subId);
          return events;
        } finally {
          ws.close();
        }
      })
    );

    // Collect all events from successful relays
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allEvents.push(...result.value);
      }
    }

    // Deduplicate by d-tag (keep latest version)
    const latestByDTag = new Map<string, NostrEvent>();
    for (const event of allEvents) {
      const dTag = event.tags.find(t => t[0] === 'd')?.[1] || event.id || '';
      const existing = latestByDTag.get(dTag);
      if (!existing || event.created_at > existing.created_at) {
        latestByDTag.set(dTag, event);
      }
    }

    // Parse events to NostrMusicTrackInfo
    const tracks: NostrMusicTrackInfo[] = [];
    for (const event of latestByDTag.values()) {
      const track = parseNostrMusicEvent(event);
      if (track) {
        tracks.push(track);
      }
    }

    // Sort by album name, then track number
    tracks.sort((a, b) => {
      const albumCompare = a.album.localeCompare(b.album);
      if (albumCompare !== 0) return albumCompare;
      return a.trackNumber - b.trackNumber;
    });

    return {
      success: true,
      tracks,
      message: `Found ${tracks.length} track(s)`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, tracks: [], message };
  }
}

// Convert persons array to Credits section string
function formatCreditsFromPersons(persons: Person[]): string {
  if (!persons || persons.length === 0) return '';
  return persons
    .map(p => `${p.name}: ${p.role}`)
    .join('\n');
}

// Check if a string is a valid hex pubkey (64 hex characters)
function isValidHexPubkey(str: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(str);
}

// Convert value recipients to zap tags (only for valid Nostr pubkeys)
function buildZapTags(recipients: ValueRecipient[], defaultRelay: string): string[][] {
  if (!recipients || recipients.length === 0) return [];

  return recipients
    .filter(r => r.address && r.split > 0 && isValidHexPubkey(r.address))
    .map(r => ['zap', r.address, defaultRelay, String(r.split)]);
}

// Build content field with description and credits
function buildTrackContent(track: Track): string {
  const sections: string[] = [];

  // Description as plain content
  if (track.description && track.description.trim()) {
    sections.push(track.description.trim());
  }

  // Credits from persons
  const credits = formatCreditsFromPersons(track.persons);
  if (credits) {
    sections.push(`Credits:\n${credits}`);
  }

  return sections.join('\n\n');
}

// Create a kind 36787 event for a track
function createMusicTrackEvent(
  track: Track,
  album: Album,
  pubkey: string
): NostrEvent {
  const tags: string[][] = [
    ['d', track.guid],
    ['title', track.title],
    ['url', track.enclosureUrl],
    ['artist', album.author || 'Unknown Artist'],
    ['album', album.title || 'Untitled'],
    ['track_number', String(track.trackNumber)],
    ['client', CLIENT_TAG],
    ['alt', `Music track: ${track.title} by ${album.author || 'Unknown Artist'}`]
  ];

  // Add image (track art or album art)
  const imageUrl = track.trackArtUrl || album.imageUrl;
  if (imageUrl) {
    tags.push(['image', imageUrl]);
  }

  // Add released date
  const released = formatReleasedDate(track.pubDate);
  if (released) {
    tags.push(['released', released]);
  }

  // Add language
  if (album.language) {
    tags.push(['language', album.language]);
  }

  // Add genre tags from categories
  for (const category of album.categories) {
    tags.push(['t', category.toLowerCase()]);
  }

  // Add zap tags from value recipients (track-level if overridden, else album-level)
  const valueBlock = track.overrideValue && track.value ? track.value : album.value;
  if (valueBlock && valueBlock.recipients) {
    const zapTags = buildZapTags(valueBlock.recipients, DEFAULT_RELAYS[0]);
    tags.push(...zapTags);
  }

  // Build content with lyrics and credits
  const content = buildTrackContent(track);

  return {
    kind: MUSIC_TRACK_KIND,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content
  };
}

// Publish result for progress tracking
export interface PublishProgress {
  current: number;
  total: number;
  trackTitle: string;
}

// Publish album tracks as Nostr Music events (kind 36787)
export async function publishNostrMusicTracks(
  album: Album,
  relays = DEFAULT_RELAYS,
  onProgress?: (progress: PublishProgress) => void
): Promise<{ success: boolean; message: string; publishedCount: number }> {
  if (!window.nostr) {
    return { success: false, message: 'Nostr extension not found', publishedCount: 0 };
  }

  if (!album.tracks || album.tracks.length === 0) {
    return { success: false, message: 'No tracks to publish', publishedCount: 0 };
  }

  try {
    const pubkey = await window.nostr.getPublicKey();
    let publishedCount = 0;
    const total = album.tracks.length;

    for (let i = 0; i < album.tracks.length; i++) {
      const track = album.tracks[i];

      // Skip tracks without required fields
      if (!track.title || !track.enclosureUrl) {
        continue;
      }

      // Report progress
      if (onProgress) {
        onProgress({ current: i + 1, total, trackTitle: track.title });
      }

      // Create and sign the event
      const unsignedEvent = createMusicTrackEvent(track, album, pubkey);
      const signedEvent = await window.nostr.signEvent(unsignedEvent);

      // Publish to all relays
      const { successCount } = await publishEventToRelays(signedEvent, relays);

      // Count as published if at least one relay succeeded
      if (successCount > 0) {
        publishedCount++;
      }
    }

    if (publishedCount === 0) {
      return { success: false, message: 'Failed to publish any tracks', publishedCount: 0 };
    }

    return {
      success: true,
      message: `Published ${publishedCount} of ${total} track(s) to Nostr`,
      publishedCount
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message, publishedCount: 0 };
  }
}

