// src/components/Onboarding/steps/AuthStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';
import { NostrLoginPanel } from '../NostrLoginPanel';
import { useNostr } from '../../../store/nostrStore';
import { Section } from '../../Section';

export function AuthStep({ w }: { w: OnboardingDraft }) {
  const { state: nostrState } = useNostr();
  const isLoggedIn = !!nostrState.user?.npub;

  return (
    <Section title="Sign in with Nostr" icon="🔑" defaultOpen>
      <NostrLoginPanel />

      {isLoggedIn && w.lookingUp && (
        <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: '0.9em' }}>
          Checking for your existing feeds…
        </p>
      )}

      {isLoggedIn && !w.lookingUp && w.publisherChoices.length === 0 && (
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={w.startNewPublisher}>
          Continue
        </button>
      )}

      {isLoggedIn && !w.lookingUp && w.publisherChoices.length > 0 && (
        <div className="publisher-chooser">
          <p>You already own {w.publisherChoices.length} publisher feed
            {w.publisherChoices.length > 1 ? 's' : ''}. Add this release to one,
            or start a new project:</p>
          <ul>
            {w.publisherChoices.map((feed) => (
              <li key={feed.podcastGuid}>
                <button className="chooser-item" onClick={() => w.choosePublisher(feed)}>
                  <strong>{feed.title || 'Untitled publisher'}</strong>
                  <span> · {(feed.remoteItems || []).length} release
                    {(feed.remoteItems || []).length === 1 ? '' : 's'}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn btn-secondary btn-small" onClick={w.startNewPublisher}>
            + Start a new publisher
          </button>
        </div>
      )}
    </Section>
  );
}
