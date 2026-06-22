// src/components/Onboarding/steps/AuthStep.tsx
import { useState } from 'react';
import type { OnboardingDraft } from '../useOnboardingDraft';
import { NostrLoginPanel } from '../NostrLoginPanel';
import { NewToNostrPanel } from '../NewToNostrPanel';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { useNostr } from '../../../store/nostrStore';
import { Section } from '../../Section';

// Which sign-in path the (logged-out) user is looking at. 'choose' shows the
// three-way picker; the others show that path's panel with a Back link.
type AuthChoice = 'choose' | 'google' | 'new' | 'have';

export function AuthStep({ w }: { w: OnboardingDraft }) {
  const { state: nostrState } = useNostr();
  const isLoggedIn = !!nostrState.user?.npub;
  const [choice, setChoice] = useState<AuthChoice>('choose');

  const backLink = (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      onClick={() => setChoice('choose')}
      style={{ marginBottom: 12 }}
    >
      ← Back
    </button>
  );

  return (
    <Section title="Sign in" icon="🔑" defaultOpen>
      {/* Logged-out: three-way chooser ----------------------------------- */}
      {!isLoggedIn && choice === 'choose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            You'll need a Nostr identity to publish — it's what links your feeds to you and
            lets you host files. Pick whichever is easiest:
          </p>

          <button type="button" className="auth-choice-card auth-choice-card-primary" onClick={() => setChoice('google')}>
            <span className="auth-choice-title">Just use Google <span className="auth-choice-badge">Easiest</span></span>
            <span className="auth-choice-desc">
              Sign in with Google and we'll create and manage a Nostr identity for you. No Nostr
              knowledge needed — you can export your keys later.
            </span>
          </button>

          <button type="button" className="auth-choice-card" onClick={() => setChoice('new')}>
            <span className="auth-choice-title">Try Nostr — I'm new</span>
            <span className="auth-choice-desc">
              Set up a real Nostr identity with Primal (works across many apps), then connect.
            </span>
          </button>

          <button type="button" className="auth-choice-card" onClick={() => setChoice('have')}>
            <span className="auth-choice-title">I already have Nostr</span>
            <span className="auth-choice-desc">
              Connect with a browser extension or a remote signer (Amber, nsecBunker, Primal).
            </span>
          </button>
        </div>
      )}

      {!isLoggedIn && choice === 'google' && (
        <div>
          {backLink}
          <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
            Sign in with Google and we'll create a Nostr identity for you automatically.
            No Nostr knowledge required.
          </p>
          <GoogleSignInButton />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 12 }}>
            You can always export your Nostr keys later from the menu.
          </p>
        </div>
      )}

      {!isLoggedIn && choice === 'new' && (
        <div>
          {backLink}
          <NewToNostrPanel />
        </div>
      )}

      {!isLoggedIn && choice === 'have' && (
        <div>
          {backLink}
          <NostrLoginPanel />
        </div>
      )}

      {/* Logged-in: identity confirmation + publisher lookup ------------- */}
      {isLoggedIn && (
        <>
          <NostrLoginPanel />

          {w.lookingUp && (
            <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: '0.9em' }}>
              Checking for your existing feeds…
            </p>
          )}

          {!w.lookingUp && w.publisherChoices.length === 0 && (
            <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
              You're all set — press <strong>Next</strong> to start building your release.
            </p>
          )}

          {!w.lookingUp && w.publisherChoices.length > 0 && (
            <div className="publisher-chooser">
              <p>{w.publisherChoices.length > 1
                ? 'Welcome back! Here are your catalogs — pick one, then press Next to add this release to it:'
                : "Welcome back! Here's your current catalog — press Next to add this release to it:"}</p>
              <ul>
                {w.publisherChoices.map((feed) => {
                  const releases = feed.remoteItems || [];
                  const selected = w.selectedPublisherGuid === feed.podcastGuid;
                  return (
                    <li key={feed.podcastGuid}>
                      <button
                        className={`chooser-item${selected ? ' selected' : ''}`}
                        aria-pressed={selected}
                        onClick={() => w.selectPublisher(feed.podcastGuid)}
                      >
                        <strong>{feed.title || 'Untitled publisher'}</strong>
                        <span> · {releases.length} release{releases.length === 1 ? '' : 's'}</span>
                        {releases.length > 0 && (
                          <span className="chooser-item-releases">
                            {releases.map((ri, i) => (
                              <span key={ri.feedGuid || i} className="chooser-item-release">
                                {ri.title || 'Untitled release'}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
