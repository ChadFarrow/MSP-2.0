import type { Album } from '../../../types/feed';
import type { FeedAction } from '../../../store/feedStore';
import { isVideoMedium } from '../../../types/feed';
import { Section } from '../../Section';
import { ArtworkFields } from '../../ArtworkFields';

interface AlbumArtworkSectionProps {
  album: Album;
  dispatch: React.Dispatch<FeedAction>;
  /** When true, URL vs Blossom upload is an either/or toggle (used by the wizard). */
  toggleSource?: boolean;
}

export function AlbumArtworkSection({ album, dispatch, toggleSource = false }: AlbumArtworkSectionProps) {
  const isVideo = isVideoMedium(album.medium);
  return (
    <Section title={isVideo ? 'Video Artwork' : 'Album Artwork'} icon={isVideo ? '🎬' : '🎨'}>
      <ArtworkFields
        toggleSource={toggleSource}
        imageUrl={album.imageUrl}
        imageTitle={album.imageTitle}
        imageDescription={album.imageDescription}
        onUpdate={(field, value) => dispatch({ type: 'UPDATE_ALBUM', payload: { [field]: value } })}
        urlLabel={isVideo ? 'Video Art URL' : 'Album Art URL'}
        urlPlaceholder={isVideo ? 'https://example.com/video-art.jpg' : 'https://example.com/album-art.jpg'}
        titlePlaceholder={isVideo ? 'Video cover description' : 'Album cover description'}
        previewAlt={isVideo ? 'Video preview' : 'Album preview'}
      />
    </Section>
  );
}
