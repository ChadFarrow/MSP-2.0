// src/components/Onboarding/OnboardingWizard.tsx
//
// New-artist onboarding wizard (7 steps), wired to useOnboardingDraft.
// Each step renders the SAME real editor sections the main editor uses
// (AlbumInfoSection, AlbumArtworkSection, TrackList, PersonsSection, plus the
// publisher sections) so there's one source of truth and full field parity —
// no parallel simplified fields to drift.

import { useEffect, useRef, useState } from 'react';
import { useOnboardingDraft, type StepId } from './useOnboardingDraft';
import { NostrLoginPanel } from './NostrLoginPanel';
import { useNostr } from '../../store/nostrStore';
import { createEmptyPersonRole } from '../../types/feed';
import { Section } from '../Section';
import { ArtworkFields } from '../ArtworkFields';
import { RecipientsList } from '../RecipientsList';
import { FundingFields } from '../FundingFields';
import { PublisherInfoSection } from '../Editor/PublisherEditor/PublisherInfoSection';
import { AlbumInfoSection } from '../Editor/AlbumEditor/AlbumInfoSection';
import { AlbumArtworkSection } from '../Editor/AlbumEditor/AlbumArtworkSection';
import { PersonsSection } from '../Editor/AlbumEditor/PersonsSection';
import { TrackList } from '../Editor/AlbumEditor/TrackList';
import { wizardStorage } from '../../utils/storage';
import { loadPublisherFeedsFromNostr } from '../../utils/nostrSync';
import { checkSignerConnection } from '../../utils/nostrSigner';
import type { Album, PublisherFeed } from '../../types/feed';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEP_LABELS: Record<StepId, string> = {
  auth: 'Sign in',
  publisher: 'Artist',
  album: 'Album',
  tracks: 'Tracks',
  value: 'Value',
  extras: 'Credits',
  review: 'Review',
};

// Returning artists skip the publisher-shell step.
function visibleSteps(isReturning: boolean): StepId[] {
  const all: StepId[] = ['auth', 'publisher', 'album', 'tracks', 'value', 'extras', 'review'];
  return isReturning ? all.filter((s) => s !== 'publisher') : all;
}

// Wire the returning-artist lookup to the npub's saved publisher feeds on Nostr.
// The signer pubkey drives the query, so no npub arg is needed (a zero-arg fn is
// still assignable to ExistingPublisherLookup).
async function lookupExistingPublishers(): Promise<PublisherFeed[]> {
  const { feeds } = await loadPublisherFeedsFromNostr();
  return feeds;
}

// Per-track value/persons overrides are hidden during onboarding; the wizard
// never gates on the lightning feature flag, so a constant false suffices.
const wizardIsEnabled = () => false;

// ── Review summary ───────────────────────────────────────────────────────────
function ReviewRow({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0', fontSize: '0.9em' }}>
      <span style={{ flex: '0 0 130px', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ flex: 1, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 6px', fontSize: '0.95em', color: 'var(--text-primary)' }}>{title}</h4>
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 6 }}>{children}</div>
    </div>
  );
}

const truncate = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n)}…` : s);

function ReviewSummary({ album, publisher }: { album: Album; publisher: PublisherFeed | null }) {
  const recipients = album.value?.recipients?.filter((r) => r.address) ?? [];
  const persons = album.persons?.filter((p) => p.name?.trim()) ?? [];
  const funding = album.funding?.filter((f) => f.url?.trim()) ?? [];
  const owner = [album.ownerName, album.ownerEmail].filter(Boolean).join(' · ');

  return (
    <div>
      {/* Header card */}
      <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {album.imageUrl && (
          <img src={album.imageUrl} alt="Album art" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ fontSize: '1.1em' }}>{album.title || 'Untitled album'}</strong>
          <span style={{ color: 'var(--text-secondary)' }}>by {album.author || publisher?.title || 'Unknown artist'}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>
            {album.tracks.length} track{album.tracks.length === 1 ? '' : 's'}
            {album.language ? ` · ${album.language.toUpperCase()}` : ''}
            {album.categories?.[0] ? ` · ${album.categories[0]}` : ''}
            {album.explicit ? ' · Explicit' : ''}
          </span>
        </div>
      </div>

      {publisher && (
        <ReviewBlock title="Artist / Publisher">
          <ReviewRow label="Name" value={publisher.title} />
          <ReviewRow label="Website" value={publisher.link} />
          <ReviewRow label="Description" value={publisher.description} />
        </ReviewBlock>
      )}

      <ReviewBlock title="Album">
        <ReviewRow label="Title" value={album.title} />
        <ReviewRow label="Artist" value={album.author} />
        <ReviewRow label="Description" value={album.description} />
        <ReviewRow label="Website" value={album.link} />
        <ReviewRow label="Keywords" value={album.keywords} />
        <ReviewRow label="Owner" value={owner} />
      </ReviewBlock>

      <ReviewBlock title={`Tracks (${album.tracks.length})`}>
        {album.tracks.length === 0 ? (
          <div style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>No tracks added.</div>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {album.tracks.map((t, i) => (
              <li key={t.id || i} style={{ padding: '3px 0', fontSize: '0.9em' }}>
                <span>{t.title || 'Untitled track'}</span>
                {t.duration && t.duration !== '00:00:00' && (
                  <span style={{ color: 'var(--text-secondary)' }}> · {t.duration}</span>
                )}
                {t.explicit && <span style={{ color: 'var(--text-secondary)' }}> · Explicit</span>}
              </li>
            ))}
          </ol>
        )}
      </ReviewBlock>

      {recipients.length > 0 && (
        <ReviewBlock title="Value / V4V splits">
          {recipients.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '3px 0', fontSize: '0.9em' }}>
              <span style={{ flex: 1 }}>{r.name || 'Recipient'} <span style={{ color: 'var(--text-secondary)' }}>· {truncate(r.address)}</span></span>
              <span style={{ flex: '0 0 50px', textAlign: 'right' }}>{r.split}%</span>
            </div>
          ))}
        </ReviewBlock>
      )}

      {persons.length > 0 && (
        <ReviewBlock title="Credits">
          {persons.map((p, i) => (
            <div key={i} style={{ padding: '3px 0', fontSize: '0.9em' }}>
              <span>{p.name}</span>
              {p.roles?.length > 0 && (
                <span style={{ color: 'var(--text-secondary)' }}> · {p.roles.map((r) => r.role).join(', ')}</span>
              )}
            </div>
          ))}
        </ReviewBlock>
      )}

      {funding.length > 0 && (
        <ReviewBlock title="Funding">
          {funding.map((f, i) => (
            <ReviewRow key={i} label={f.text || 'Support'} value={f.url} />
          ))}
        </ReviewBlock>
      )}
    </div>
  );
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const w = useOnboardingDraft(lookupExistingPublishers);
  const { state: nostrState } = useNostr();
  const { step, index, state, dispatch } = w;

  const isLoggedIn = !!nostrState.user?.npub;
  const steps = visibleSteps(w.isReturningArtist);

  const closeRef = useRef<HTMLButtonElement>(null);
  const strippedSeedTrack = useRef(false);

  // Publish result / status (review step).
  const [publishError, setPublishError] = useState('');
  const [publisherWarning, setPublisherWarning] = useState('');
  const [feedUrl, setFeedUrl] = useState('');

  // ── Dialog chrome: Escape-to-close + mount focus ─────────────────────────────
  const handleDismiss = () => {
    wizardStorage.markComplete();
    onComplete();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleDismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // handleDismiss only closes the wizard — stable for the dialog's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { closeRef.current?.focus(); }, []);

  // ── Auto-advance past auth once logged in (runs lookup, branches) ────────────
  useEffect(() => {
    if (isLoggedIn && step === 'auth') {
      w.onSignedIn();
    }
    // w.onSignedIn is stable via useCallback; guarded internally by lookedUpRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, step]);

  // ── Set the artist npub on the album automatically once we have a user ───────
  useEffect(() => {
    if (nostrState.user?.npub && state.album.artistNpub !== nostrState.user.npub) {
      dispatch({ type: 'UPDATE_ALBUM', payload: { artistNpub: nostrState.user.npub } });
    }
  }, [nostrState.user?.npub, state.album.artistNpub, dispatch]);

  // ── Strip the seeded empty placeholder track once the Tracks step opens ──────
  // createEmptyAlbum seeds album.tracks with one blank track. Now that tracks are
  // store-driven, clear that placeholder on first entry so bulk-upload/add start
  // from a clean slate. Runs once — later manual "+ Add Track" blanks are kept.
  useEffect(() => {
    if (step !== 'tracks' || strippedSeedTrack.current) return;
    strippedSeedTrack.current = true;
    const real = state.album.tracks.filter((t) => t.enclosureUrl || t.title.trim());
    if (real.length !== state.album.tracks.length) {
      dispatch({ type: 'UPDATE_ALBUM', payload: { tracks: real } });
    }
  }, [step, state.album.tracks, dispatch]);

  // ── Auto-balance the artist's V4V split as the remainder ─────────────────────
  // The primary recipient (the artist, with their lightning address) always gets
  // 100 − (everyone else's splits): two 1% community splits → 98%, and any
  // collaborators you add reduce the artist's share automatically.
  useEffect(() => {
    if (step !== 'value') return;
    const recipients = state.album.value.recipients;
    const primary = recipients[0];
    if (!primary?.address) return;
    const others = recipients.slice(1).reduce((sum, r) => sum + (Number(r.split) || 0), 0);
    const computed = Math.max(0, 100 - others);
    if ((Number(primary.split) || 0) !== computed) {
      dispatch({ type: 'UPDATE_RECIPIENT', payload: { index: 0, recipient: { ...primary, split: computed } } });
    }
  }, [step, state.album.value.recipients, dispatch]);

  // ── Publish (review step) ────────────────────────────────────────────────────
  const handlePublish = async () => {
    setPublishError('');
    setPublisherWarning('');
    const health = await checkSignerConnection();
    if (!health.connected) {
      setPublishError(health.error || 'Your Nostr signer is not responding. Open your signer app and try again.');
      return;
    }
    try {
      const result = await w.publish();
      if (!result) {
        setPublishError('Could not publish — please try again.');
        return;
      }
      if (result.feedUrl) setFeedUrl(result.feedUrl);
      if (!result.success && result.error) {
        setPublisherWarning(result.error);
      }
      wizardStorage.markComplete();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Publishing failed');
    }
  };

  // Tracks are store-driven; a track is incomplete until it has an enclosure URL,
  // a title, and a non-zero duration (uploads in flight have no URL yet).
  const tracksInvalid =
    state.album.tracks.length === 0 ||
    state.album.tracks.some((t) => !t.enclosureUrl || !t.title.trim() || !/[1-9]/.test(t.duration || ''));

  // Required-field gate for publish.
  const reviewValid =
    !!state.publisherFeed?.title?.trim() &&
    !!state.album.title.trim() &&
    state.album.tracks.length > 0;

  // ── Step bodies ──────────────────────────────────────────────────────────────
  const body = (
    <>
      {/* Step: Auth (+ returning-artist publisher chooser) */}
      {step === 'auth' && (
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
      )}

      {/* Step: Artist identity (publisher shell) */}
      {step === 'publisher' && state.publisherFeed && (
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
      )}

      {/* Step: Album basics — the real album info + artwork sections */}
      {step === 'album' && (
        <>
          <AlbumInfoSection
            album={state.album}
            dispatch={dispatch}
            isArtistMode
            isLoggedIn={nostrState.isLoggedIn}
            userNpub={nostrState.user?.npub}
          />
          <AlbumArtworkSection album={state.album} dispatch={dispatch} toggleSource />
        </>
      )}

      {/* Step: Tracks — the real track list (store-driven, bulk upload on) */}
      {step === 'tracks' && (
        <TrackList
          album={state.album}
          dispatch={dispatch}
          isEnabled={wizardIsEnabled}
          allowBulkAdd
          showOverrides={false}
        />
      )}

      {/* Step: Value / V4V */}
      {step === 'value' && (
        <Section title="Value / V4V" icon="⚡" defaultOpen>
          {w.suggestedLightningAddress && !w.lightningPromptHandled && (
            <div className="ln-suggestion">
              <p>Found a lightning address on your Nostr profile:
                <strong> {w.suggestedLightningAddress}</strong></p>
              <p>Use it to receive V4V payments for this release?</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-small" onClick={() => w.confirmLightningAddress()}>
                  Use this address
                </button>
                <button className="btn btn-secondary btn-small" onClick={w.dismissLightningAddress}>
                  I&apos;ll enter a different one
                </button>
              </div>
            </div>
          )}
          {w.suggestedLightningAddress && w.lightningPromptHandled && (
            <button className="btn btn-secondary btn-small" style={{ marginBottom: 12 }} onClick={() => w.confirmLightningAddress()}>
              Use my Nostr lightning address ({w.suggestedLightningAddress})
            </button>
          )}
          {state.album.value.recipients[0]?.address && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85em', margin: '0 0 8px' }}>
              Your share is calculated automatically — you get whatever's left after the other recipients ({state.album.value.recipients[0].split}% right now).
            </p>
          )}
          <RecipientsList
            recipients={state.album.value.recipients}
            onUpdate={(idx, recipient) => dispatch({ type: 'UPDATE_RECIPIENT', payload: { index: idx, recipient } })}
            onRemove={(idx) => dispatch({ type: 'REMOVE_RECIPIENT', payload: idx })}
            onAdd={(recipient) => dispatch({ type: 'ADD_RECIPIENT', payload: recipient })}
          />
        </Section>
      )}

      {/* Step: Credits & extras — real persons section + funding */}
      {step === 'extras' && (
        <Section title="Credits & extras" icon="✨" defaultOpen>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em', marginTop: 0 }}>
            All optional. Publisher link: confirmed ✓
          </p>

          <label className="form-label">Credits / Persons</label>
          <PersonsSection
            persons={state.album.persons}
            onUpdatePerson={(index, person) => dispatch({ type: 'UPDATE_PERSON', payload: { index, person } })}
            onAddPerson={() => dispatch({ type: 'ADD_PERSON' })}
            onRemovePerson={(index) => dispatch({ type: 'REMOVE_PERSON', payload: index })}
            onUpdateRole={(personIndex, roleIndex, role) => dispatch({ type: 'UPDATE_PERSON_ROLE', payload: { personIndex, roleIndex, role } })}
            onAddRole={(personIndex) => dispatch({ type: 'ADD_PERSON_ROLE', payload: { personIndex, role: createEmptyPersonRole() } })}
            onRemoveRole={(personIndex, roleIndex) => dispatch({ type: 'REMOVE_PERSON_ROLE', payload: { personIndex, roleIndex } })}
            showThumbnailPreview
            showRolesModalButton
          />

          <div style={{ marginTop: 16 }}>
            <FundingFields
              funding={state.album.funding}
              onUpdate={(funding) => dispatch({ type: 'UPDATE_ALBUM', payload: { funding } })}
            />
          </div>
        </Section>
      )}

      {/* Step: Review & publish */}
      {step === 'review' && (
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: 'var(--success, #16a34a)', fontWeight: 600, fontSize: '1.05em' }}>🎉 Your feed is live!</div>
              {publisherWarning && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--bg-secondary, #f5f5f5)', color: 'var(--text-secondary)', fontSize: '0.85em' }}>⚠️ {publisherWarning}</div>
              )}
              <div>
                <label className="form-label">Feed URL (for podcast apps)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" readOnly value={feedUrl} style={{ flex: 1, fontSize: '0.85em' }} onFocus={(e) => e.target.select()} />
                  <button className="btn btn-secondary btn-small" onClick={() => navigator.clipboard.writeText(feedUrl)}>Copy</button>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}
    </>
  );

  // ── Footer nav ───────────────────────────────────────────────────────────────
  const onNextFromStep = () => {
    if (step === 'album') w.linkAlbumToPublisher();
    w.next();
  };

  const nextDisabled =
    (step === 'publisher' && !state.publisherFeed?.title?.trim()) ||
    (step === 'album' && !state.album.title.trim()) ||
    (step === 'tracks' && tracksInvalid);

  // Hide Back when the previous visible step is the auth gate — going back there
  // just bounces forward again (you can't un-sign-in via navigation).
  const canGoBack = index > 0 && steps[index - 1] !== 'auth';

  const footer = (
    <div className="step-nav" style={{ width: '100%' }}>
      {/* Left: Back */}
      {canGoBack && (
        <button className="btn btn-secondary" onClick={w.back} disabled={step === 'review' && w.publishing}>
          Back
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Right: Skip + primary action (Next / Publish / Open) */}
      {!feedUrl && (
        <button className="btn btn-secondary" onClick={handleDismiss} title="Skip wizard and go to editor">Skip</button>
      )}
      {step === 'review' ? (
        feedUrl ? (
          <button className="btn btn-primary" onClick={onComplete}>Open in Editor →</button>
        ) : (
          <button className="btn btn-primary" style={{ minWidth: 140 }} onClick={handlePublish} disabled={w.publishing || !reviewValid}>
            {w.publishing ? 'Publishing…' : publishError ? 'Retry' : 'Publish'}
          </button>
        )
      ) : step !== 'auth' ? (
        <button className="btn btn-primary" onClick={onNextFromStep} disabled={nextDisabled}>Next</button>
      ) : null}
    </div>
  );

  return (
    <div className="onboarding-page" role="dialog" aria-modal="true" aria-labelledby="onboarding-wizard-title">
      <header className="onboarding-page-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <h1 id="onboarding-wizard-title" className="onboarding-page-title">New Artist Setup</h1>
          <nav className="onboarding-rail">
            {steps.map((id, i) => {
              const stepIndex = steps.indexOf(id);
              const done = stepIndex < index;
              const current = id === step;
              return (
                <button
                  key={id}
                  type="button"
                  className={`rail-step${current ? ' current' : ''}${done ? ' done' : ''}`}
                  disabled={stepIndex > index}
                  onClick={() => w.setStep(id)}
                >
                  <span className="rail-num">{i + 1}</span> {STEP_LABELS[id]}
                </button>
              );
            })}
            <span className="rail-progress">{steps.indexOf(step) + 1} / {steps.length}</span>
          </nav>
        </div>
        <button type="button" ref={closeRef} className="onboarding-page-close" onClick={handleDismiss} aria-label="Close new artist setup">×</button>
      </header>

      <main className="onboarding-page-content">
        <div className="onboarding-body">
          {body}
        </div>
      </main>

      <footer className="onboarding-page-footer">
        {footer}
      </footer>
    </div>
  );
}
