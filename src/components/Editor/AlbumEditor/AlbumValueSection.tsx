import type { Album } from '../../../types/feed';
import type { FeedAction } from '../../../store/feedStore';
import { Section } from '../../Section';
import { RecipientsList } from '../../RecipientsList';

interface AlbumValueSectionProps {
  album: Album;
  dispatch: React.Dispatch<FeedAction>;
}

export function AlbumValueSection({ album, dispatch }: AlbumValueSectionProps) {
  return (
    <Section title="Value Block (Lightning)" icon="&#9889;">
      <RecipientsList
        recipients={album.value.recipients}
        onUpdate={(index, recipient) => dispatch({ type: 'UPDATE_RECIPIENT', payload: { index, recipient } })}
        onRemove={index => dispatch({ type: 'REMOVE_RECIPIENT', payload: index })}
        onAdd={recipient => dispatch({ type: 'ADD_RECIPIENT', payload: recipient })}
      />
    </Section>
  );
}
