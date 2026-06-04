// src/components/Onboarding/steps/ReviewStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';
import { Section } from '../../Section';
import { ReviewSummary } from '../ReviewSummary';
import { CopyableUrlRow } from '../CopyableUrlRow';
import { buildHostedUrl } from '../../../utils/hostedFeed';

interface ReviewStepProps {
  w: OnboardingDraft;
  publishError: string;
  publisherWarning: string;
  feedUrl: string;
  piUrl: string;
}

export function ReviewStep({ w, publishError, publisherWarning, feedUrl, piUrl }: ReviewStepProps) {
  const { state } = w;
  // The album feed is the subscribable one (apps can't subscribe to a
  // publisher/catalog feed). feedId === podcastGuid for MSP-hosted feeds, so the
  // album URL is deterministic from the album's GUID.
  const albumFeedUrl = buildHostedUrl(state.album.podcastGuid);
  const piLink = piUrl || `https://podcastindex.org/search?q=${encodeURIComponent(state.album.podcastGuid)}&type=all`;

  return (
    <Section title="Review & publish" icon="🚀" defaultOpen>
      {!feedUrl && (
        <>
          <ReviewSummary album={state.album} publisher={state.publisherFeed} />
          <p style={{ color: 'var(--text-secondary)', margin: '16px 0 0', fontSize: '0.9em' }}>
            MSP will host your album feed and {w.isReturningArtist ? 'add it to your existing publisher catalog' : 'a publisher catalog'} — cross-linked and submitted to Podcast Index automatically.
          </p>
          {w.progress && <p style={{ fontSize: '0.9em' }}>{w.progress.step}: {w.progress.message}</p>}
          {publishError && <div style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>{publishError}</div>}
        </>
      )}

      {feedUrl && (
        <div className="onboarding-publish-result">
          <div className="onboarding-publish-live">🎉 Your feed is live!</div>
          {publisherWarning && (
            <div className="onboarding-publish-warning">⚠️ {publisherWarning}</div>
          )}
          <CopyableUrlRow
            label="Album feed — subscribe & submit to podcast apps"
            value={albumFeedUrl}
            helpText={
              <>
                This is the feed listeners subscribe to — it's already been submitted to Podcast Index.{' '}
                <a href={piLink} target="_blank" rel="noopener noreferrer" className="onboarding-link">
                  View on Podcast Index →
                </a>{' '}
                (may take a few minutes to appear after publishing)
              </>
            }
          />
          <CopyableUrlRow
            label="Publisher catalog — links all your releases"
            value={feedUrl}
            helpText="An index that ties your releases together — apps use it for discovery, but it isn't directly subscribable."
          />
        </div>
      )}
    </Section>
  );
}
