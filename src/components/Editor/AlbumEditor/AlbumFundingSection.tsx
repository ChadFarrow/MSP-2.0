import type { Album } from '../../../types/feed';
import type { FeedAction } from '../../../store/feedStore';
import { Section } from '../../Section';
import { FundingFields } from '../../FundingFields';

interface AlbumFundingSectionProps {
  album: Album;
  dispatch: React.Dispatch<FeedAction>;
}

export function AlbumFundingSection({ album, dispatch }: AlbumFundingSectionProps) {
  return (
    <Section title="Funding" icon="&#128176;">
      <FundingFields
        funding={album.funding}
        onUpdate={funding => dispatch({ type: 'UPDATE_ALBUM', payload: { funding } })}
      />
    </Section>
  );
}
