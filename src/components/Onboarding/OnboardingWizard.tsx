// src/components/Onboarding/OnboardingWizard.tsx
//
// New-artist onboarding wizard (8 steps), wired to useOnboardingDraft. This
// component owns the dialog chrome (header/rail/footer), the step-gated effects,
// and the publish handler; each step's body lives in its own presentational
// component under ./steps/ and receives the shared `w` (useOnboardingDraft) bag.
// The steps render the SAME real editor sections the main editor uses, so
// there's one source of truth and full field parity.

import { useEffect, useRef, useState } from 'react';
import { useOnboardingDraft, type StepId } from './useOnboardingDraft';
import { useNostr } from '../../store/nostrStore';
import { wizardStorage } from '../../utils/storage';
import { loadPublisherFeedsFromNostr } from '../../utils/nostrSync';
import { checkSignerConnection } from '../../utils/nostrSigner';
import { buildHostedUrl } from '../../utils/hostedFeed';
import type { PublisherFeed } from '../../types/feed';
import { IntroStep } from './steps/IntroStep';
import { AuthStep } from './steps/AuthStep';
import { PublisherStep } from './steps/PublisherStep';
import { AlbumStep } from './steps/AlbumStep';
import { TracksStep } from './steps/TracksStep';
import { ValueStep } from './steps/ValueStep';
import { ExtrasStep } from './steps/ExtrasStep';
import { ReviewStep } from './steps/ReviewStep';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEP_LABELS: Record<StepId, string> = {
  intro: 'Start',
  auth: 'Sign in',
  publisher: 'Artist',
  album: 'Album',
  tracks: 'Tracks',
  value: 'Value',
  extras: 'Credits',
  review: 'Review',
};

// Every artist walks the full order, including the Artist/Publisher step — for
// returning artists it's pre-filled with their chosen publisher feed.
const WIZARD_STEPS: StepId[] = ['intro', 'auth', 'publisher', 'album', 'tracks', 'value', 'extras', 'review'];

// Wire the returning-artist lookup to the npub's saved publisher feeds on Nostr.
// The signer pubkey drives the query, so no npub arg is needed (a zero-arg fn is
// still assignable to ExistingPublisherLookup).
async function lookupExistingPublishers(): Promise<PublisherFeed[]> {
  const { feeds } = await loadPublisherFeedsFromNostr();
  return feeds;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const w = useOnboardingDraft(lookupExistingPublishers);
  const { state: nostrState } = useNostr();
  const { step, index, state, dispatch } = w;

  const isLoggedIn = !!nostrState.user?.npub;
  const steps = WIZARD_STEPS;

  const closeRef = useRef<HTMLButtonElement>(null);
  const strippedSeedTrack = useRef(false);

  // Publish result / status (review step).
  const [publishError, setPublishError] = useState('');
  const [publisherWarning, setPublisherWarning] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  // Numeric Podcast Index page URL for the album, resolved after publish. PI's web
  // UI only resolves numeric feed IDs (not podcastguid:…), and add/byfeedurl returns
  // the ID on submission — so we look it up once the album is hosted.
  const [piUrl, setPiUrl] = useState('');

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
      // Resolve the album's numeric Podcast Index page URL (add/byfeedurl returns
      // the ID on submission). Best-effort — leaves piUrl empty if PI hasn't
      // registered it yet, in which case the link falls back to a search.
      try {
        const albumUrl = buildHostedUrl(state.album.podcastGuid);
        const params = new URLSearchParams({ url: albumUrl, guid: state.album.podcastGuid });
        if (state.album.medium) params.set('medium', state.album.medium);
        const piRes = await fetch(`/api/pubnotify?${params}`);
        const piData = await piRes.json();
        if (piData?.podcastIndexUrl) setPiUrl(piData.podcastIndexUrl);
      } catch {
        // ignore — link falls back to a Podcast Index search
      }
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

  // ── Step bodies (each step's UI lives in its own component) ──────────────────
  const body = (
    <>
      {step === 'intro' && <IntroStep w={w} />}
      {step === 'auth' && <AuthStep w={w} />}
      {step === 'publisher' && <PublisherStep w={w} />}
      {step === 'album' && <AlbumStep w={w} />}
      {step === 'tracks' && <TracksStep w={w} />}
      {step === 'value' && <ValueStep w={w} />}
      {step === 'extras' && <ExtrasStep w={w} />}
      {step === 'review' && (
        <ReviewStep
          w={w}
          publishError={publishError}
          publisherWarning={publisherWarning}
          feedUrl={feedUrl}
          piUrl={piUrl}
        />
      )}
    </>
  );

  // ── Footer nav ───────────────────────────────────────────────────────────────
  const onNextFromStep = () => {
    if (step === 'album') w.linkAlbumToPublisher();
    w.next();
  };

  // Required-field gates mirror the SaveModal publish validator so a user who
  // walks every step lands on Review already publish-ready. Language defaults to
  // 'en' (a select that can't be blanked) and GUIDs auto-generate, so neither
  // needs gating. Value/Credits stay always-enabled — optional by design.
  const publisherValid =
    !!state.publisherFeed?.author?.trim() &&
    !!state.publisherFeed?.title?.trim() &&
    !!state.publisherFeed?.description?.trim();

  const albumValid =
    !!state.album.author?.trim() &&
    !!state.album.title.trim() &&
    !!state.album.description?.trim() &&
    !!state.album.imageUrl?.trim();

  const nextDisabled =
    (step === 'publisher' && !publisherValid) ||
    (step === 'album' && !albumValid) ||
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
      ) : step !== 'auth' && step !== 'intro' ? (
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
              const current = id === step;
              // "Done" = any step you've reached (high-water mark), behind or
              // ahead of the current one — so completed tabs stay green when you
              // jump back. Steps beyond the mark are locked (disabled/dimmed).
              const done = !current && stepIndex <= w.maxIndex;
              return (
                <button
                  key={id}
                  type="button"
                  className={`rail-step${current ? ' current' : ''}${done ? ' done' : ''}`}
                  disabled={stepIndex > w.maxIndex}
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
