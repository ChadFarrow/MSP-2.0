// src/components/Onboarding/steps/PublisherStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';
import { Section } from '../../Section';
import { ArtworkFields } from '../../ArtworkFields';
import { PublisherInfoSection } from '../../Editor/PublisherEditor/PublisherInfoSection';

export function PublisherStep({ w }: { w: OnboardingDraft }) {
  const { state, dispatch } = w;
  if (!state.publisherFeed) return null;

  return (
    <>
      <Section title="Your artist identity" icon="🎤" defaultOpen>
        <button
          className="btn btn-secondary btn-small"
          style={{ marginBottom: 12 }}
          onClick={() => w.pullProfileFromNostr(true)}
        >
          Use my Nostr name &amp; photo
        </button>
        <PublisherInfoSection publisherFeed={state.publisherFeed} dispatch={dispatch} isArtistMode />
      </Section>
      <Section title="Publisher Artwork" icon="🎨" defaultOpen>
        <ArtworkFields
          toggleSource
          imageUrl={state.publisherFeed.imageUrl}
          imageTitle={state.publisherFeed.imageTitle}
          imageDescription={state.publisherFeed.imageDescription}
          onUpdate={(field, value) => dispatch({ type: 'UPDATE_PUBLISHER_FEED', payload: { [field]: value } })}
          urlLabel="Logo URL"
          urlPlaceholder="https://example.com/logo.jpg"
          titlePlaceholder="Publisher logo description"
          previewAlt="Publisher logo preview"
        />
      </Section>
    </>
  );
}
