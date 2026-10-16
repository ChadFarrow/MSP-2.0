// Editing rules for a track's alternate versions (<podcast:alternateEnclosure>).
// Kept out of AlternateEnclosuresList so they run under unit tests in node.
import type { AlternateEnclosure } from '../types/feed';
import { detectMediaSize, getAudioMimeType, isKnownAudioFormat } from './audioUtils';
import { getVideoMimeType, isVideoUrl } from './videoUtils';

/**
 * What changes when the user edits a version's URL (its first source). A new
 * file drops what described the old one: its size, the source's contentType and
 * any <podcast:integrity> hash. Imported mirrors stay. The type follows a
 * recognized extension, as for the main file, until the user picks one by hand.
 */
export function urlChange(enc: AlternateEnclosure, url: string): Partial<AlternateEnclosure> {
  const [first, ...mirrors] = enc.sources;
  const changed = (first?.uri ?? '').trim() !== url.trim();
  const patch: Partial<AlternateEnclosure> = {
    sources: [changed ? { uri: url } : { ...first, uri: url }, ...mirrors]
  };

  if (url.trim() && !enc.typeSetByHand) {
    if (isKnownAudioFormat(url)) patch.type = getAudioMimeType(url);
    else if (enc.type.startsWith('video/') && isVideoUrl(url)) patch.type = getVideoMimeType(url);
  }

  if (changed) {
    patch.length = undefined;
    if (enc.unknownElements && 'podcast:integrity' in enc.unknownElements) {
      const rest = { ...enc.unknownElements };
      delete rest['podcast:integrity'];
      patch.unknownElements = Object.keys(rest).length > 0 ? rest : undefined;
    }
  }
  return patch;
}

/**
 * Returns `measure(id, url)`, which reads a version's file size from the host
 * and writes it with `write`. The HEAD request can take ~10 s, and by then the
 * editor's props are stale: the user may have edited the list, moved the track
 * or closed it. So the answer is checked against `latest()` when it lands, and
 * nothing is written once `active()` is false.
 */
export function createSizeMeasurer(options: {
  latest: () => AlternateEnclosure[];
  active: () => boolean;
  write: (id: string, length: string) => void;
  detect?: (url: string) => Promise<number | null>;
}): (id: string, url: string) => Promise<void> {
  const { latest, active, write, detect = detectMediaSize } = options;
  // Paste then blur asks twice for the same URL; send one request.
  const inFlight = new Set<string>();

  return async (id, rawUrl) => {
    const url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) return;
    const enc = latest().find(e => e.id === id);
    if (!enc || enc.length) return;
    const key = `${id} ${url}`;
    if (inFlight.has(key)) return;
    inFlight.add(key);
    try {
      const size = await detect(url);
      if (size === null || !active()) return;
      // Not if, meanwhile, the version went, its URL changed or the user typed a size.
      const current = latest().find(e => e.id === id);
      if (!current || current.length || current.sources[0]?.uri.trim() !== url) return;
      write(id, String(size));
    } finally {
      inFlight.delete(key);
    }
  };
}
