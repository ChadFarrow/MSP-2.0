// Editing rules for a track's alternate versions (<podcast:alternateEnclosure>).
// Kept out of AlternateEnclosuresList so they run under unit tests in node.
import type { AlternateEnclosure, AlternateEnclosureFile } from '../types/feed';
import { detectMediaSize, getAudioMimeType, isKnownAudioFormat } from './audioUtils';
import { getVideoMimeType, isVideoUrl } from './videoUtils';

const INTEGRITY = 'podcast:integrity';

// The version's children with `integrity` as its <podcast:integrity> entry
// (none when undefined).
function withIntegrity(elements: Record<string, unknown> | undefined, integrity: unknown): Record<string, unknown> | undefined {
  const rest = { ...elements };
  delete rest[INTEGRITY];
  if (integrity !== undefined) rest[INTEGRITY] = integrity;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

// What describes the file at the version's URL right now.
function describeFile(enc: AlternateEnclosure): AlternateEnclosureFile {
  return {
    source: enc.sources[0] ?? { uri: '' },
    type: enc.type,
    length: enc.length,
    bitrate: enc.bitrate,
    height: enc.height,
    codecs: enc.codecs,
    integrity: enc.unknownElements?.[INTEGRITY]
  };
}

/**
 * What changes when the user edits a version's URL (its first source). Each
 * keystroke is one call. A new file drops what described the old one — size,
 * bitrate, height, codecs, the source's own attributes and any
 * <podcast:integrity> hash — and keeps it in `originalFile`, so an edit that
 * returns to the old URL (type a character, delete it) gets all of it back.
 * Imported mirrors stay. The type follows a recognized extension, as for the
 * main file, until the user picks one by hand.
 */
export function urlChange(enc: AlternateEnclosure, url: string): Partial<AlternateEnclosure> {
  const [first, ...mirrors] = enc.sources;
  // Only the surrounding spaces changed: the file is the same.
  if ((first?.uri ?? '').trim() === url.trim()) {
    return { sources: [{ ...first, uri: url }, ...mirrors] };
  }

  const original = enc.originalFile ?? describeFile(enc);
  if (original.source.uri.trim() === url.trim()) {
    const type = enc.typeSetByHand ? enc.type : original.type;
    return {
      sources: [{ ...original.source, uri: url }, ...mirrors],
      type,
      length: original.length,
      bitrate: original.bitrate,
      height: original.height,
      // RFC 6381 codecs belong to a type; not under one the user picked since.
      codecs: type === original.type ? original.codecs : undefined,
      unknownElements: withIntegrity(enc.unknownElements, original.integrity),
      originalFile: undefined
    };
  }

  const patch: Partial<AlternateEnclosure> = {
    sources: [{ uri: url }, ...mirrors],
    length: undefined,
    bitrate: undefined,
    height: undefined,
    codecs: undefined,
    unknownElements: withIntegrity(enc.unknownElements, undefined),
    originalFile: original
  };
  if (url.trim() && !enc.typeSetByHand) {
    if (isKnownAudioFormat(url)) patch.type = getAudioMimeType(url);
    else if (enc.type.startsWith('video/') && isVideoUrl(url)) patch.type = getVideoMimeType(url);
  }
  return patch;
}

/**
 * What changes when the user picks a type in the File Type list. It sticks: a
 * later URL edit no longer sets the type. Codecs (RFC 6381) belong to a type,
 * so they go when the type changes.
 */
export function typeChange(enc: AlternateEnclosure, type: string): Partial<AlternateEnclosure> {
  return { type, typeSetByHand: true, ...(type !== enc.type ? { codecs: undefined } : {}) };
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
