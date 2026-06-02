// src/components/Onboarding/OnboardingWizard.tsx
//
// New-artist onboarding wizard (7 steps), wired to useOnboardingDraft.
// Reuses existing section components (PublisherInfoSection, PublisherArtworkSection,
// ArtworkFields, RecipientsList, FundingFields) and the multi-track Blossom
// uploader pattern so every field has a single source of truth in the feed store.

import { useEffect, useId, useRef, useState } from 'react';
import { useOnboardingDraft, type StepId } from './useOnboardingDraft';
import { NostrLoginPanel } from './NostrLoginPanel';
import { useNostr } from '../../store/nostrStore';
import { createEmptyTrack, LANGUAGES, ITUNES_CATEGORIES } from '../../types/feed';
import type { Track } from '../../types/feed';
import { Section } from '../Section';
import { Toggle } from '../Toggle';
import { InfoIcon } from '../InfoIcon';
import { ArtworkFields } from '../ArtworkFields';
import { BlossomFileUpload } from '../BlossomFileUpload';
import { RecipientsList } from '../RecipientsList';
import { FundingFields } from '../FundingFields';
import { PublisherInfoSection } from '../Editor/PublisherEditor/PublisherInfoSection';
import { wizardStorage } from '../../utils/storage';
import { loadPublisherFeedsFromNostr } from '../../utils/nostrSync';
import { uploadMediaToBlossom } from '../../utils/blossom';
import { getAudioDuration, secondsToHHMMSS } from '../../utils/audioUtils';
import { checkSignerConnection } from '../../utils/nostrSigner';
import type { PublisherFeed } from '../../types/feed';

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

interface WizardTrack {
  id: string;
  title: string;
  duration: string;
  url: string;
  mimeType: string;
  uploading: boolean;
  error: string;
  file: File | null;
  // Optional per-track details (collapsed by default in the UI).
  description: string;
  explicit: boolean;
  trackArtUrl: string;
  transcriptUrl: string;
}

// Empty optional-detail fields shared by every WizardTrack creation site.
const EMPTY_TRACK_DETAILS = { description: '', explicit: false, trackArtUrl: '', transcriptUrl: '' };

// Compact either/or media input (Upload a file / Paste a URL), reused for
// per-track artwork and lyrics. Source state is internal; defaults to URL when
// a value already exists. useId keeps each instance's radio group independent.
function MediaPicker({ value, onChange, accept, urlPlaceholder, showPreview }: {
  value: string;
  onChange: (url: string) => void;
  accept: string;
  urlPlaceholder: string;
  showPreview?: boolean;
}) {
  const [src, setSrc] = useState<'upload' | 'url'>(value ? 'url' : 'upload');
  const name = useId();
  return (
    <>
      <div className="source-radios" role="radiogroup">
        <label className="source-radio">
          <input type="radio" name={name} checked={src === 'upload'} onChange={() => setSrc('upload')} />
          Upload a file
        </label>
        <label className="source-radio">
          <input type="radio" name={name} checked={src === 'url'} onChange={() => setSrc('url')} />
          Paste a URL
        </label>
      </div>
      {src === 'url' ? (
        <input
          className="form-input"
          placeholder={urlPlaceholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <BlossomFileUpload accept={accept} onUploaded={({ url }) => onChange(url)} />
      )}
      {showPreview && value && (
        <img
          src={value}
          alt="Track art preview"
          style={{ maxWidth: 120, marginTop: 8, borderRadius: 6, border: '1px solid var(--border-color)' }}
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
      )}
    </>
  );
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const w = useOnboardingDraft(lookupExistingPublishers);
  const { state: nostrState } = useNostr();
  const { step, index, state, dispatch } = w;

  const isLoggedIn = !!nostrState.user?.npub;
  const steps = visibleSteps(w.isReturningArtist);

  const closeRef = useRef<HTMLButtonElement>(null);

  // Local track-upload state (transient uploading/file/error don't belong in the
  // store Track model; keyed by stable id to avoid index races with remove).
  const [tracks, setTracks] = useState<WizardTrack[]>([]);
  // Either/or track source: upload audio files vs paste an audio URL.
  const [trackSource, setTrackSource] = useState<'upload' | 'url'>('upload');
  const [trackUrlDraft, setTrackUrlDraft] = useState('');
  // Track details are expanded by default; we track which rows are COLLAPSED.
  // Adding new tracks collapses the existing ones so the list stays manageable
  // while the just-added track(s) stay open for editing.
  const [collapsedTracks, setCollapsedTracks] = useState<Set<string>>(new Set());
  const toggleTrackDetails = (id: string) =>
    setCollapsedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const collapseExistingTracks = () =>
    setCollapsedTracks((prev) => new Set([...prev, ...tracks.map((t) => t.id)]));
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

  // ── Hydrate local tracks from the store on first entry into the tracks step ──
  useEffect(() => {
    if (step !== 'tracks' || tracks.length > 0) return;
    const stored = state.album.tracks.filter((t) => t.enclosureUrl);
    if (stored.length > 0) {
      const hydrated = stored.map((t) => ({
        id: crypto.randomUUID(),
        title: t.title,
        duration: t.duration || '',
        url: t.enclosureUrl,
        mimeType: t.enclosureType || 'audio/mpeg',
        uploading: false,
        error: '',
        file: null,
        description: t.description || '',
        explicit: t.explicit || false,
        trackArtUrl: t.trackArtUrl || '',
        transcriptUrl: t.transcriptUrl || '',
      }));
      setTracks(hydrated);
      // Pre-filled tracks start collapsed.
      setCollapsedTracks(new Set(hydrated.map((t) => t.id)));
    }
    // Only hydrate once when the step opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Track upload handlers ────────────────────────────────────────────────────
  const updateTrack = (id: string, patch: Partial<WizardTrack>) =>
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeTrack = (id: string) => setTracks((prev) => prev.filter((t) => t.id !== id));

  const uploadTrackFile = async (id: string, file: File) => {
    updateTrack(id, { uploading: true, error: '', file });
    const durationUrl = URL.createObjectURL(file);
    getAudioDuration(durationUrl)
      .then((secs) => { if (secs !== null) updateTrack(id, { duration: secondsToHHMMSS(secs) }); })
      .finally(() => URL.revokeObjectURL(durationUrl));
    try {
      const result = await uploadMediaToBlossom(file);
      if (result.success && result.url) {
        updateTrack(id, { url: result.url, mimeType: file.type || 'audio/mpeg' });
      } else {
        updateTrack(id, { error: result.message });
      }
    } finally {
      updateTrack(id, { uploading: false });
    }
  };

  const handleAddAudioFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    collapseExistingTracks();
    const newTracks: WizardTrack[] = files.map((file) => ({
      id: crypto.randomUUID(),
      title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      duration: '',
      url: '',
      mimeType: file.type || 'audio/mpeg',
      uploading: true,
      error: '',
      file,
      ...EMPTY_TRACK_DETAILS,
    }));
    setTracks((prev) => [...prev, ...newTracks]);
    newTracks.forEach((t) => uploadTrackFile(t.id, t.file!));
  };

  const handleRetryTrack = (id: string) => {
    const track = tracks.find((t) => t.id === id);
    if (track?.file) uploadTrackFile(id, track.file);
  };

  // Add a track from a pasted audio URL (no upload). Title is derived from the
  // filename; duration is pulled from the URL when the host allows it (CORS).
  const AUDIO_MIME: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
    opus: 'audio/opus', wav: 'audio/wav', flac: 'audio/flac', aiff: 'audio/aiff',
  };
  const handleAddUrlTrack = () => {
    const url = trackUrlDraft.trim();
    if (!url) return;
    collapseExistingTracks();
    const id = crypto.randomUUID();
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
    const name = url.split('?')[0].split('/').pop()?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || '';
    setTracks((prev) => [...prev, {
      id, title: name, duration: '', url,
      mimeType: AUDIO_MIME[ext] || 'audio/mpeg', uploading: false, error: '', file: null,
      ...EMPTY_TRACK_DETAILS,
    }]);
    getAudioDuration(url)
      .then((secs) => { if (secs !== null) updateTrack(id, { duration: secondsToHHMMSS(secs) }); })
      .catch(() => { /* CORS or unreachable — user can type the duration */ });
    setTrackUrlDraft('');
  };

  // Commit local tracks into the store (replaces the seeded empty track).
  const commitTracks = () => {
    const mapped: Track[] = tracks.map((t, i) => ({
      ...createEmptyTrack(i + 1),
      title: t.title || state.album.title,
      enclosureUrl: t.url,
      enclosureType: t.mimeType,
      duration: t.duration,
      guid: crypto.randomUUID(),
      description: t.description,
      explicit: t.explicit,
      trackArtUrl: t.trackArtUrl || undefined,
      transcriptUrl: t.transcriptUrl || undefined,
    }));
    dispatch({ type: 'UPDATE_ALBUM', payload: { tracks: mapped } });
  };

  const anyTrackExpanded = tracks.some((t) => !collapsedTracks.has(t.id));
  const collapseAllTracks = () => setCollapsedTracks(new Set(tracks.map((t) => t.id)));
  const expandAllTracks = () => setCollapsedTracks(new Set());

  const tracksValid =
    tracks.length > 0 &&
    tracks.every((t) => t.url && !t.uploading && t.title.trim() && /[1-9]/.test(t.duration));

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

      {/* Step: Album basics */}
      {step === 'album' && (
        <Section title="Album basics" icon="💿" defaultOpen>
          <div className="form-group">
            <label className="form-label">
              Album / Single title <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
            </label>
            <input
              className="form-input"
              placeholder="e.g. Monsters"
              value={state.album.title}
              onChange={(e) => dispatch({ type: 'UPDATE_ALBUM', payload: { title: e.target.value } })}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              rows={3}
              style={{ resize: 'vertical' }}
              placeholder="What is this release about?"
              value={state.album.description}
              onChange={(e) => dispatch({ type: 'UPDATE_ALBUM', payload: { description: e.target.value } })}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: '0 0 160px' }}>
              <label className="form-label">Language</label>
              <select
                className="form-select"
                value={state.album.language || 'en'}
                onChange={(e) => dispatch({ type: 'UPDATE_ALBUM', payload: { language: e.target.value } })}
              >
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={state.album.categories?.[0] || 'Music'}
                onChange={(e) => dispatch({ type: 'UPDATE_ALBUM', payload: { categories: [e.target.value] } })}
              >
                {ITUNES_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <Toggle
              checked={state.album.explicit}
              onChange={(v) => dispatch({ type: 'UPDATE_ALBUM', payload: { explicit: v } })}
              label="Explicit content"
            />
          </div>

          <ArtworkFields
            toggleSource
            imageUrl={state.album.imageUrl}
            imageTitle={state.album.imageTitle}
            imageDescription={state.album.imageDescription}
            onUpdate={(field, value) => dispatch({ type: 'UPDATE_ALBUM', payload: { [field]: value } })}
            urlLabel="Album Art URL"
            urlPlaceholder="https://example.com/album-art.jpg"
          />
        </Section>
      )}

      {/* Step: Tracks */}
      {step === 'tracks' && (
        <Section title="Tracks" icon="🎵" defaultOpen>
          <div className="source-radios" role="radiogroup" aria-label="Track source">
            <label className="source-radio">
              <input
                type="radio"
                name="track-source"
                checked={trackSource === 'upload'}
                onChange={() => setTrackSource('upload')}
              />
              Upload a file
            </label>
            <label className="source-radio">
              <input
                type="radio"
                name="track-source"
                checked={trackSource === 'url'}
                onChange={() => setTrackSource('url')}
              />
              Paste a URL
            </label>
          </div>

          {trackSource === 'upload' ? (
            <>
              <label className="wizard-upload-btn">
                {tracks.length > 0 ? '+ Add more tracks' : 'Choose audio files'}
                <input type="file" accept="audio/*" multiple onChange={handleAddAudioFiles} />
              </label>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginTop: 4 }}>
                Select one or more audio files. Title and duration are filled in automatically.
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder="https://example.com/track.mp3"
                  value={trackUrlDraft}
                  onChange={(e) => setTrackUrlDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrlTrack(); }}
                />
                <button type="button" className="btn btn-primary" onClick={handleAddUrlTrack} disabled={!trackUrlDraft.trim()}>
                  Add track
                </button>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginTop: 4 }}>
                Paste a direct link to an audio file. Duration is pulled automatically when the host allows it — otherwise type it in below.
              </div>
            </>
          )}

          {tracks.length > 0 && (
            <>
              {tracks.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={anyTrackExpanded ? collapseAllTracks : expandAllTracks}
                  >
                    {anyTrackExpanded ? 'Collapse All' : 'Expand All'}
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {tracks.map((t, i) => {
                  const expanded = !collapsedTracks.has(t.id);
                  return (
                    <div key={t.id} className="wizard-track-card">
                      <div
                        className="wizard-track-header"
                        onClick={() => toggleTrackDetails(t.id)}
                        role="button"
                        aria-expanded={expanded}
                      >
                        <span className="wizard-track-chevron">{expanded ? '▾' : '▸'}</span>
                        <span className="wizard-track-num">{i + 1}</span>
                        <span className="wizard-track-title">{t.title || 'Untitled track'}</span>
                        {t.uploading && <span className="wizard-track-status">Uploading…</span>}
                        {t.error && <span className="wizard-track-status error">Upload failed</span>}
                        {t.duration && <span className="wizard-track-dur">{t.duration}</span>}
                        <button
                          type="button"
                          className="wizard-track-remove"
                          onClick={(e) => { e.stopPropagation(); removeTrack(t.id); }}
                          aria-label={`Remove track ${i + 1}`}
                        >
                          ×
                        </button>
                      </div>

                      {expanded && (
                        <div className="wizard-track-body">
                          {t.error && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>{t.error}</span>
                              {t.file && <button type="button" className="btn btn-secondary btn-small" onClick={() => handleRetryTrack(t.id)}>Retry</button>}
                            </div>
                          )}

                          <div className="form-grid">
                            <div className="form-group">
                              <label className="form-label">Track Title <span className="required">*</span></label>
                              <input
                                className="form-input"
                                placeholder="Track title"
                                value={t.title}
                                onChange={(e) => updateTrack(t.id, { title: e.target.value })}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Duration <span className="required">*</span></label>
                              <input
                                className="form-input"
                                placeholder="0:00:00"
                                value={t.duration}
                                onChange={(e) => updateTrack(t.id, { duration: e.target.value })}
                              />
                            </div>
                          </div>

                          {t.url && !t.uploading && (
                            <audio controls src={t.url} style={{ width: '100%' }}>Your browser does not support audio playback.</audio>
                          )}

                          <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                              className="form-input"
                              rows={2}
                              style={{ resize: 'vertical' }}
                              placeholder="Notes about this track (optional)"
                              value={t.description}
                              onChange={(e) => updateTrack(t.id, { description: e.target.value })}
                            />
                          </div>

                          <div className="form-grid">
                            <div className="form-group">
                              <label className="form-label">Track artwork <InfoIcon text="Cover image for this track. If left empty, the album art is used." /></label>
                              <MediaPicker
                                value={t.trackArtUrl}
                                onChange={(url) => updateTrack(t.id, { trackArtUrl: url })}
                                accept="image/*"
                                urlPlaceholder="https://example.com/track-art.jpg"
                                showPreview
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Lyrics / transcript <InfoIcon text="A link to an SRT or VTT lyrics/transcript file shown during playback." /></label>
                              <MediaPicker
                                value={t.transcriptUrl}
                                onChange={(url) => updateTrack(t.id, { transcriptUrl: url })}
                                accept=".srt,.vtt"
                                urlPlaceholder="https://example.com/lyrics.srt"
                              />
                            </div>
                          </div>

                          <div className="form-group">
                            <Toggle
                              checked={t.explicit}
                              onChange={(v) => updateTrack(t.id, { explicit: v })}
                              label="Explicit"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Section>
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

      {/* Step: Credits & extras */}
      {step === 'extras' && (
        <Section title="Credits & extras" icon="✨" defaultOpen={false}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
            Optional. Publisher link: confirmed ✓
          </p>
          <div className="form-group">
            <label className="form-label">Keywords <InfoIcon text="Comma-separated tags for search (e.g. rock, indie, guitar)." /></label>
            <input
              className="form-input"
              placeholder="rock, indie, guitar"
              value={state.album.keywords}
              onChange={(e) => dispatch({ type: 'UPDATE_ALBUM', payload: { keywords: e.target.value } })}
            />
          </div>
          <FundingFields
            funding={state.album.funding}
            onUpdate={(funding) => dispatch({ type: 'UPDATE_ALBUM', payload: { funding } })}
          />
        </Section>
      )}

      {/* Step: Review & publish */}
      {step === 'review' && (
        <Section title="Review & publish" icon="🚀" defaultOpen>
          {!feedUrl && (
            <>
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--bg-secondary, #f5f5f5)', fontSize: '0.9em', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {state.album.imageUrl && (
                  <img src={state.album.imageUrl} alt="Album art" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <strong>{state.album.title || 'Untitled album'}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}>by {state.publisherFeed?.title || state.album.author || 'Unknown artist'}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>{state.album.tracks.length} track{state.album.tracks.length === 1 ? '' : 's'}</span>
                </div>
              </div>
              <p style={{ color: 'var(--text-secondary)', margin: '12px 0 0', fontSize: '0.9em' }}>
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
    if (step === 'tracks') commitTracks();
    w.next();
  };

  const nextDisabled =
    (step === 'publisher' && !state.publisherFeed?.title?.trim()) ||
    (step === 'album' && !state.album.title.trim()) ||
    (step === 'tracks' && !tracksValid);

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
