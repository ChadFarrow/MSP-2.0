import { createEmptyTrack, type Track } from '../types/feed';
import { getAudioMimeType, secondsToHHMMSS } from '../utils/audioUtils';
import { getVideoMimeType } from '../utils/videoUtils';
import type { PickedMedia } from './mediaLibrary';

/**
 * "Add tracks from files": turns files chosen (or just uploaded) in the
 * WordPress Media Library into album tracks, in one step.
 *
 * Pure, so the order and fill rules are tested in node; the Editor dispatches
 * the result synchronously inside the picker's callback, so no index can go
 * stale between planning and dispatching.
 */

export interface TrackFill {
  index: number;
  track: Partial<Track>;
}

export interface TrackPlan {
  /** Blank tracks already in the list, filled in place (a new album starts with one). */
  fill: TrackFill[];
  /** New tracks to append, in order. */
  add: Track[];
}

/**
 * Album order. When every file's tags carry a track number and no two share
 * one, that order wins — a whole album selected in one drag arrives in
 * whatever order the browser uploaded it. Otherwise the order the artist
 * picked the files in.
 */
export function orderFiles(files: PickedMedia[]): PickedMedia[] {
  const numbers = files.map((f) => f.trackNumber);
  const usable = numbers.every((n) => n !== undefined) && new Set(numbers).size === numbers.length;
  if (!usable) return files;
  return [...files].sort((a, b) => (a.trackNumber as number) - (b.trackNumber as number));
}

/** "My Song" from ".../2026/11/my-song.mp3" when WordPress gave no title. */
function titleFromUrl(url: string): string {
  const name = decodeURIComponent(url.split('?')[0].split('/').pop() ?? '');
  return name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').trim();
}

/**
 * Track fields for one file. With `existing` (one track's own "Upload or
 * choose file" button) the track keeps its title — a new file replaces the
 * old one, the artist's name for the song stays — unless it has none yet.
 */
export function trackFieldsFromFile(file: PickedMedia, isVideo: boolean, existing?: Track): Partial<Track> {
  if (existing?.title?.trim()) {
    const { title: _title, ...rest } = trackFieldsFromFile(file, isVideo);
    void _title;
    return rest;
  }
  return {
    title: file.title || titleFromUrl(file.url),
    enclosureUrl: file.url,
    enclosureType: file.mime || (isVideo ? getVideoMimeType(file.url) : getAudioMimeType(file.url)),
    // Left empty rather than guessed when WordPress couldn't read them; the
    // Feed check and the Save gate then say exactly which track needs it.
    enclosureLength: file.bytes ? String(file.bytes) : '',
    duration: file.durationSeconds ? secondsToHHMMSS(file.durationSeconds) : '',
  };
}

const isBlank = (t: Track) => !t.enclosureUrl?.trim() && !t.title?.trim();

export function planTracksFromFiles(tracks: Track[], files: PickedMedia[], isVideo: boolean): TrackPlan {
  const ordered = orderFiles(files);
  const blanks = tracks.map((t, i) => (isBlank(t) ? i : -1)).filter((i) => i >= 0);
  const fill: TrackFill[] = [];
  const add: Track[] = [];
  ordered.forEach((file, n) => {
    const fields = trackFieldsFromFile(file, isVideo);
    if (n < blanks.length) {
      fill.push({ index: blanks[n], track: fields });
    } else {
      const number = tracks.length + add.length + 1;
      add.push({ ...createEmptyTrack(number, isVideo ? 'video/mp4' : 'audio/mpeg'), ...fields });
    }
  });
  return { fill, add };
}
