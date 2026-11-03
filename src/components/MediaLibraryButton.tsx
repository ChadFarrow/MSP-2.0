import { isMediaLibraryAvailable, openMediaLibrary, type MediaKind, type PickedMedia } from '../wordpress/mediaLibrary';

interface MediaLibraryButtonProps {
  kind: MediaKind;
  onPick: (media: PickedMedia) => void;
}

/**
 * "Media Library" button beside a URL field. Renders nothing outside the
 * WordPress plugin, so it is safe to mount anywhere.
 */
export function MediaLibraryButton({ kind, onPick }: MediaLibraryButtonProps) {
  if (!isMediaLibraryAvailable()) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      style={{ marginTop: '6px' }}
      onClick={() => openMediaLibrary(kind, onPick)}
    >
      📁 Media Library
    </button>
  );
}
