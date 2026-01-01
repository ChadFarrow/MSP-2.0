import type { Album, Track, ValueRecipient, ValueBlock, Person } from '../types/feed';
import type { NostrMusicTrackInfo, NostrMusicAlbumGroup, NostrZapSplit } from '../types/nostr';
import { createEmptyAlbum, createEmptyTrack } from '../types/feed';
import { fetchNostrProfile } from './nostrSync';

// Parse released date (format: "DD/MM/YYYY" or various formats)
function parseReleasedDate(released: string): string {
  try {
    // Handle DD/MM/YYYY format
    const parts = released.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date.toUTCString();
      }
    }
    // Fallback: try direct parse
    const parsed = new Date(released);
    if (!isNaN(parsed.getTime())) {
      return parsed.toUTCString();
    }
    return new Date().toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

// Infer person group from role string
function inferPersonGroup(role: string): Person['group'] {
  const roleLower = role.toLowerCase();

  if (/vocal|sing|voice/i.test(roleLower)) return 'music';
  if (/guitar|bass|drum|keyboard|instrument|beat/i.test(roleLower)) return 'music';
  if (/write|lyric|compos/i.test(roleLower)) return 'writing';
  if (/produc|engineer|mix|master/i.test(roleLower)) return 'production';
  if (/art|design|photo|video|visual|cover/i.test(roleLower)) return 'visuals';

  return 'other';
}

// Parse credits string into Person array
function parseCreditsToPersons(credits: string): Person[] {
  const persons: Person[] = [];
  const lines = credits.split('\n').filter(l => l.trim());

  for (const line of lines) {
    // Try to parse "Name: Role" format
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const name = line.substring(0, colonIndex).trim();
      const role = line.substring(colonIndex + 1).trim().toLowerCase();

      // Map common roles to person groups
      const group = inferPersonGroup(role);

      persons.push({
        name,
        group,
        role: role || 'contributor'
      });
    }
  }

  return persons;
}

// Build description from track content
function buildTrackDescription(track: NostrMusicTrackInfo): string {
  const parts: string[] = [];

  if (track.content.lyrics) {
    parts.push(track.content.lyrics);
  }

  if (track.content.license) {
    parts.push(`License: ${track.content.license}`);
  }

  return parts.join('\n\n');
}

// Convert zap splits to ValueBlock
async function buildValueBlockFromZaps(
  zaps: NostrZapSplit[],
  fetchProfiles: boolean
): Promise<ValueBlock> {
  const recipients: ValueRecipient[] = [];

  for (const zap of zaps) {
    let name = zap.pubkey.substring(0, 8) + '...';

    // Optionally fetch profile to get display name
    if (fetchProfiles) {
      try {
        const profile = await fetchNostrProfile(zap.pubkey);
        if (profile?.display_name || profile?.name) {
          name = profile.display_name || profile.name || name;
        }
      } catch {
        // Use truncated pubkey as fallback
      }
    }

    recipients.push({
      name,
      address: zap.pubkey,
      split: zap.splitPercentage,
      type: 'node',
      customKey: '696969',
      customValue: zap.pubkey
    });
  }

  return {
    type: 'lightning',
    method: 'keysend',
    suggested: '0.000033333',
    recipients
  };
}

// Compare two value blocks for equality
function areValueBlocksEqual(a: ValueBlock, b: ValueBlock): boolean {
  if (a.recipients.length !== b.recipients.length) return false;

  const aAddresses = new Set(a.recipients.map(r => r.address));
  const bAddresses = new Set(b.recipients.map(r => r.address));

  if (aAddresses.size !== bAddresses.size) return false;

  for (const addr of aAddresses) {
    if (!bAddresses.has(addr)) return false;
  }

  return true;
}

// Build aggregate value block from all tracks' zap splits
async function buildAggregateValueBlock(
  tracks: NostrMusicTrackInfo[],
  fetchProfiles: boolean
): Promise<ValueBlock> {
  // Collect all unique zap recipients across tracks
  const zapMap = new Map<string, NostrZapSplit>();

  for (const track of tracks) {
    for (const zap of track.zapSplits) {
      if (!zapMap.has(zap.pubkey)) {
        zapMap.set(zap.pubkey, zap);
      }
    }
  }

  const allZaps = Array.from(zapMap.values());
  return buildValueBlockFromZaps(allZaps, fetchProfiles);
}

// Convert individual NostrMusicTrackInfo to Track
async function convertNostrTrackToTrack(
  nostrTrack: NostrMusicTrackInfo,
  fallbackNumber: number,
  albumValueBlock: ValueBlock,
  fetchProfiles: boolean
): Promise<Track> {
  const track = createEmptyTrack(nostrTrack.trackNumber || fallbackNumber);

  track.title = nostrTrack.title;
  track.enclosureUrl = nostrTrack.url;
  track.trackNumber = nostrTrack.trackNumber || fallbackNumber;
  track.guid = nostrTrack.dTag;

  // Build description from content
  track.description = buildTrackDescription(nostrTrack);

  // Set track art
  if (nostrTrack.imageUrl) {
    track.trackArtUrl = nostrTrack.imageUrl;
  }

  // Parse release date
  if (nostrTrack.released) {
    track.pubDate = parseReleasedDate(nostrTrack.released);
  }

  // Build track-specific value block if different from album
  if (nostrTrack.zapSplits.length > 0) {
    const trackValue = await buildValueBlockFromZaps(nostrTrack.zapSplits, fetchProfiles);

    // Check if different from album value block
    if (!areValueBlocksEqual(trackValue, albumValueBlock)) {
      track.value = trackValue;
      track.overrideValue = true;
    }
  }

  // Parse credits into persons if available
  if (nostrTrack.content.credits) {
    track.persons = parseCreditsToPersons(nostrTrack.content.credits);
    track.overridePersons = track.persons.length > 0;
  }

  return track;
}

// Convert NostrMusicAlbumGroup to Album type
export async function convertNostrMusicToAlbum(
  albumGroup: NostrMusicAlbumGroup,
  fetchProfiles = true
): Promise<Album> {
  const album = createEmptyAlbum();

  // Album-level fields
  album.title = albumGroup.albumName;
  album.author = albumGroup.artist;
  album.imageUrl = albumGroup.imageUrl || '';
  album.imageTitle = albumGroup.albumName;

  // Infer description from first track with content
  const trackWithDesc = albumGroup.tracks.find(t => t.content.lyrics || t.content.credits);
  if (trackWithDesc?.content.credits) {
    album.description = `Credits: ${trackWithDesc.content.credits}`;
  }

  // Set language from first track
  const trackWithLang = albumGroup.tracks.find(t => t.language);
  if (trackWithLang) {
    album.language = trackWithLang.language || 'en';
  }

  // Collect all unique genres as categories
  const allGenres = new Set<string>();
  for (const track of albumGroup.tracks) {
    track.genres.forEach(g => allGenres.add(g));
  }
  album.categories = Array.from(allGenres).slice(0, 5);

  // Build aggregate value block from all zap splits
  const aggregateValueBlock = await buildAggregateValueBlock(
    albumGroup.tracks,
    fetchProfiles
  );
  if (aggregateValueBlock.recipients.length > 0) {
    album.value = aggregateValueBlock;
  }

  // Convert tracks
  album.tracks = await Promise.all(
    albumGroup.tracks.map((track, index) =>
      convertNostrTrackToTrack(track, index + 1, aggregateValueBlock, fetchProfiles)
    )
  );

  return album;
}
