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
}

/** The parts of a wp.media attachment's toJSON() this reads. All optional: WordPress omits what it doesn't know. */
export interface WpAttachmentJson {
  url?: unknown;
  mime?: unknown;
  filesizeInBytes?: unknown;
  fileLength?: unknown;
  width?: unknown;
  height?: unknown;
  meta?: { length?: unknown } | null;
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
  };
}

interface WpMediaFrame {
  on(event: 'select', handler: () => void): void;
  open(): void;
  state(): { get(name: 'selection'): { first(): { toJSON(): WpAttachmentJson } | undefined } };
}

type WpMedia = (options: {
  title: string;
  button: { text: string };
  library: { type: MediaKind };
  multiple: boolean;
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
  audio: 'Choose an audio file',
  video: 'Choose a video file',
  image: 'Choose an image',
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
