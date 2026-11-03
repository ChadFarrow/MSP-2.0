import {
  formatUploadLimit,
  isMediaLibraryAvailable,
  openMediaLibrary,
  openMediaLibraryForTracks,
  type MediaKind,
  type PickedMedia,
} from '../wordpress/mediaLibrary';
import { wpConfig } from '../utils/runtimeTarget';

function uploadLimitText(): string | null {
  const bytes = wpConfig()?.maxUploadBytes;
  return bytes ? `This site accepts files up to ${formatUploadLimit(bytes)}.` : null;
}

interface MediaLibraryButtonProps {
  kind: MediaKind;
  onPick: (media: PickedMedia) => void;
}

/**
 * "Upload or choose file" beside a URL field: the WordPress media window, whose
 * Upload tab puts the file on the artist's own site. Renders nothing outside
 * the WordPress plugin, so it is safe to mount anywhere.
 */
export function MediaLibraryButton({ kind, onPick }: MediaLibraryButtonProps) {
  if (!isMediaLibraryAvailable()) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      style={{ marginTop: '6px' }}
      title={uploadLimitText() ?? undefined}
      onClick={() => openMediaLibrary(kind, onPick)}
    >
      📁 Upload or choose file
    </button>
  );
}

interface AddTracksFromFilesProps {
  isVideo: boolean;
  onPick: (media: PickedMedia[]) => void;
}

/** "Add tracks from files": upload or pick a whole album at once. WordPress plugin only. */
export function AddTracksFromFiles({ isVideo, onPick }: AddTracksFromFilesProps) {
  if (!isMediaLibraryAvailable()) return null;
  const limit = uploadLimitText();
  return (
    <div style={{ marginTop: '8px' }}>
      <button
        type="button"
        className="add-item-btn"
        onClick={() => openMediaLibraryForTracks(isVideo ? 'video' : 'audio', onPick)}
      >
        📁 Add {isVideo ? 'videos' : 'tracks'} from files
      </button>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
        Upload or choose several files at once — each becomes a {isVideo ? 'video' : 'track'}, with its title, size and length filled in.
        {limit ? ` ${limit} A larger file (often WAV or FLAC) needs a bigger limit from your host.` : ''}
      </p>
    </div>
  );
}
