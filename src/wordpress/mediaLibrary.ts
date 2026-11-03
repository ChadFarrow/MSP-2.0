import { isWordPress } from '../utils/runtimeTarget';

/**
 * The WordPress Media Library, opened from the editor inside the plugin.
 *
 * The editor runs in a same-origin iframe, and the admin page around it loads
 * `wp.media` (wp_enqueue_media() in class-admin.php). The picker opens in that
 * parent window, over the whole admin screen, which also means the user can't
 * touch the editor while it is open.
 */

export type MediaKind = 'audio' | 'video' | 'image';

export interface PickedMedia {
  url: string;
  mime: string;
  /** File size in bytes, when WordPress knows it. */
  bytes?: number;
  /** Playing time in seconds, for audio and video WordPress could read. */
  durationSeconds?: number;
  width?: number;
  height?: number;
  /** WordPress's title for the file — for audio, the song title from its tags when it has one. */
  title?: string;
  /** Track number from the file's tags ("3" or "3/10"), when present. */
  trackNumber?: number;
}

/** The parts of a wp.media attachment's toJSON() this reads. All optional: WordPress omits what it doesn't know. */
export interface WpAttachmentJson {
  url?: unknown;
  mime?: unknown;
  filesizeInBytes?: unknown;
  fileLength?: unknown;
  width?: unknown;
  height?: unknown;
  title?: unknown;
  meta?: { length?: unknown; track_number?: unknown } | null;
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/** "3:45", "1:02:03" or a number of seconds. */
function parseLength(value: unknown): number | undefined {
  if (typeof value === 'number') return positiveInt(value);
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parts = value.trim().split(':').map((p) => Number(p));
  if (parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return undefined;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? Math.round(seconds) : undefined;
}

export function parseAttachment(json: WpAttachmentJson): PickedMedia | null {
  if (typeof json.url !== 'string' || !/^https?:\/\//i.test(json.url)) return null;
  return {
    url: json.url,
    mime: typeof json.mime === 'string' ? json.mime : '',
    bytes: positiveInt(json.filesizeInBytes),
    // fileLength is "m:ss"; meta.length is whole seconds. Prefer the number.
    durationSeconds: parseLength(json.meta?.length) ?? parseLength(json.fileLength),
    width: positiveInt(json.width),
    height: positiveInt(json.height),
    title: typeof json.title === 'string' && json.title.trim() ? json.title.trim() : undefined,
    trackNumber: positiveInt(typeof json.meta?.track_number === 'string' ? json.meta.track_number.split('/')[0] : json.meta?.track_number),
  };
}

interface WpMediaFrame {
  on(event: 'select', handler: () => void): void;
  open(): void;
  state(): { get(name: 'selection'): { first(): { toJSON(): WpAttachmentJson } | undefined; toJSON(): WpAttachmentJson[] } };
}

type WpMedia = (options: {
  title: string;
  button: { text: string };
  library: { type: MediaKind | MediaKind[] };
  multiple: boolean | 'add';
}) => WpMediaFrame;

function wpMedia(): WpMedia | null {
  if (!isWordPress()) return null;
  try {
    const host = window.parent as Window & { wp?: { media?: WpMedia } };
    return typeof host.wp?.media === 'function' ? host.wp.media : null;
  } catch {
    // A cross-origin parent throws on access; then there is no library to use.
    return null;
  }
}

export function isMediaLibraryAvailable(): boolean {
  return wpMedia() !== null;
}

const TITLES: Record<MediaKind, string> = {
  audio: 'Upload or choose an audio file',
  video: 'Upload or choose a video file',
  image: 'Upload or choose an image',
};

/** Opens the picker; calls back once with the chosen file. */
export function openMediaLibrary(kind: MediaKind, onPick: (media: PickedMedia) => void): void {
  const media = wpMedia();
  if (!media) return;
  const frame = media({
    title: TITLES[kind],
    button: { text: 'Use this file' },
    library: { type: kind },
    multiple: false,
  });
  frame.on('select', () => {
    const picked = frame.state().get('selection').first()?.toJSON();
    const parsed = picked ? parseAttachment(picked) : null;
    if (parsed) onPick(parsed);
  });
  frame.open();
}

/**
 * Opens the picker for several files at once — "Add tracks from files".
 * `multiple: 'add'` lets a click add to the selection without Ctrl/Cmd, which
 * is what an artist uploading a whole album expects. Calls back once with the
 * files in the order they were selected.
 */
export function openMediaLibraryForTracks(kind: 'audio' | 'video', onPick: (media: PickedMedia[]) => void): void {
  const media = wpMedia();
  if (!media) return;
  const frame = media({
    title: kind === 'video' ? 'Upload or choose videos' : 'Upload or choose songs',
    button: { text: 'Add as tracks' },
    library: { type: kind },
    multiple: 'add',
  });
  frame.on('select', () => {
    const picked = frame.state().get('selection').toJSON()
      .map(parseAttachment)
      .filter((m): m is PickedMedia => m !== null);
    if (picked.length) onPick(picked);
  });
  frame.open();
}

/** "64 MB" — the site's upload limit as WordPress counts it (1 MB = 1024² bytes). */
export function formatUploadLimit(bytes: number): string {
  const mb = bytes / 1048576;
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10} GB`;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}
