import type { Album } from '../types/feed';
import type { NostrEvent, SavedAlbumInfo, NostrMusicTrackInfo, NostrMusicAlbumGroup, NostrZapSplit, NostrMusicContent } from '../types/nostr';
import { generateRssFeed } from './xmlGenerator';
import { parseRssFeed } from './xmlParser';

// Default relays to use
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band'
];

// Kind 30054 for podcast/RSS feeds (parameterized replaceable)
const RSS_FEED_KIND = 30054;
const CLIENT_TAG = 'MSP 2.0';

// Kind 36787 for Nostr music tracks
const MUSIC_TRACK_KIND = 36787;

// Connect to a relay with timeout
function connectRelay(url: string, timeout = 5000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection to ${url} timed out`));
    }, timeout);

    ws.onopen = () => {
      clearTimeout(timer);
      resolve(ws);
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Failed to connect to ${url}`));
    };
  });
}

// Send a message and wait for response
function sendAndWait(
  ws: WebSocket,
  message: unknown[],
  timeout = 10000
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, timeout);

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(data);
      } catch {
        // Ignore parse errors, wait for valid response
      }
    };

    ws.addEventListener('message', handler);
    ws.send(JSON.stringify(message));
  });
}

// Collect multiple events from a relay
function collectEvents(
  ws: WebSocket,
  subscriptionId: string,
  timeout = 10000
): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const events: NostrEvent[] = [];
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      resolve(events);
    }, timeout);

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data[0] === 'EVENT' && data[1] === subscriptionId) {
          events.push(data[2] as NostrEvent);
        } else if (data[0] === 'EOSE' && data[1] === subscriptionId) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          resolve(events);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.addEventListener('message', handler);
  });
}

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
    const results = await Promise.allSettled(
      relays.map(async (relayUrl) => {
        const ws = await connectRelay(relayUrl);
        try {
          const response = await sendAndWait(ws, ['EVENT', signedEvent]);
          return { relay: relayUrl, response };
        } finally {
          ws.close();
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;

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

// Delete an album (by publishing a delete event - kind 5)
export async function deleteAlbumFromNostr(
  eventId: string,
  relays = DEFAULT_RELAYS
): Promise<{ success: boolean; message: string }> {
  if (!window.nostr) {
    return { success: false, message: 'Nostr extension not found' };
  }

  try {
    const pubkey = await window.nostr.getPublicKey();

    // Create delete event (kind 5)
    const deleteEvent: NostrEvent = {
      kind: 5,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', eventId]],
      content: ''
    };

    const signedEvent = await window.nostr.signEvent(deleteEvent);

    // Publish to relays
    const results = await Promise.allSettled(
      relays.map(async (relayUrl) => {
        const ws = await connectRelay(relayUrl);
        try {
          await sendAndWait(ws, ['EVENT', signedEvent]);
        } finally {
          ws.close();
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;

    return {
      success: successCount > 0,
      message: successCount > 0
        ? `Delete request sent to ${successCount}/${relays.length} relays`
        : 'Failed to send delete request'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message };
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
