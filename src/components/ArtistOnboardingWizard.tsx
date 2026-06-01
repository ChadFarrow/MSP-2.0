import { useState, useEffect, useRef } from 'react';
import { useNostr } from '../store/nostrStore';
import { useFeed } from '../store/feedStore';
import { createEmptyAlbum, createEmptyTrack, createEmptyPublisherFeed, createEmptyRemoteItem } from '../types/feed';
import { wizardStorage } from '../utils/storage';
import { uploadMediaToBlossom } from '../utils/blossom';
import { hostBothOnMSP } from '../utils/artistPublish';
import type { PublishStep } from '../utils/artistPublish';

interface ArtistOnboardingWizardProps {
  onComplete: () => void;
  onOpenLogin: () => void;
}

const STEP_LABELS = ['Login', 'Your Info', 'Upload Music', 'Publish'];

export function ArtistOnboardingWizard({ onComplete, onOpenLogin }: ArtistOnboardingWizardProps) {
  const { state: nostrState, login, loginWithNip46 } = useNostr();
  const { dispatch } = useFeed();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => (nostrState.isLoggedIn ? 2 : 1));

  const closeRef = useRef<HTMLButtonElement>(null);

  // Step 1 — login
  const [bunkerUri, setBunkerUri] = useState('');
  const [loginError, setLoginError] = useState('');

  // Step 2 — album info
  const [artistName, setArtistName] = useState('');
  const [albumName, setAlbumName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('en');
  const [website, setWebsite] = useState('');

  // Step 3 — upload + track info
  const [trackTitle, setTrackTitle] = useState('');
  const [trackDuration, setTrackDuration] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioMimeType, setAudioMimeType] = useState('audio/mpeg');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingArtwork, setUploadingArtwork] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState('');
  const [artworkUploadError, setArtworkUploadError] = useState('');
  const lastAudioFile = useRef<File | null>(null);

  // Step 4 — publish
  const [publishing, setPublishing] = useState(false);
  const [publishSteps, setPublishSteps] = useState<PublishStep[]>([]);
  const [publishError, setPublishError] = useState('');
  const [albumFeedUrl, setAlbumFeedUrl] = useState('');

  // Auto-advance past step 1 when login completes
  useEffect(() => {
    if (nostrState.isLoggedIn && step === 1) {
      setLoginError('');
      setStep(2);
    }
  }, [nostrState.isLoggedIn, step]);

  const handleDismiss = () => {
    wizardStorage.markComplete();
    onComplete();
  };

  // Close on Escape (full-page dialog provides its own key handling now that
  // ModalWrapper is gone)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // handleDismiss is stable for the component's lifetime (only closes the wizard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus into the dialog on mount so keyboard users land inside
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // ── Step 1 handlers ──────────────────────────────────────────────────────────

  const handleExtensionLogin = async () => {
    setLoginError('');
    try {
      await login();
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  const handleBunkerLogin = async () => {
    const uri = bunkerUri.trim();
    if (!uri) return;
    setLoginError('');
    try {
      await loginWithNip46(uri);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  // ── Step 3 handlers ──────────────────────────────────────────────────────────

  const handleAudioChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    lastAudioFile.current = file;
    setAudioUploadError('');
    setUploadingAudio(true);
    try {
      const result = await uploadMediaToBlossom(file);
      if (result.success && result.url) {
        setAudioUrl(result.url);
        setAudioMimeType(file.type || 'audio/mpeg');
        // Pre-fill track title from filename if not already set
        if (!trackTitle) {
          const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
          setTrackTitle(name);
        }
      } else {
        setAudioUploadError(result.message);
      }
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleArtworkChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setArtworkUploadError('');
    setUploadingArtwork(true);
    try {
      const result = await uploadMediaToBlossom(file);
      if (result.success && result.url) {
        setArtworkUrl(result.url);
      } else {
        setArtworkUploadError(result.message);
      }
    } finally {
      setUploadingArtwork(false);
    }
  };

  const handleRetryAudio = () => {
    const file = lastAudioFile.current;
    if (!file) return;
    handleAudioChange({ target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  // ── Step 4 handler ──────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!nostrState.user?.npub) return;

    const albumGuid = crypto.randomUUID();
    const publisherGuid = crypto.randomUUID();

    const album = {
      ...createEmptyAlbum(),
      podcastGuid: albumGuid,
      title: albumName,
      author: artistName,
      description,
      language: language || 'en',
      link: website,
      imageUrl: artworkUrl,
      publisher: { feedGuid: publisherGuid, feedUrl: '' },
      tracks: [{
        ...createEmptyTrack(1),
        title: trackTitle || albumName,
        enclosureUrl: audioUrl,
        enclosureType: audioMimeType,
        duration: trackDuration,
        guid: crypto.randomUUID(),
      }],
    };

    const publisherFeed = {
      ...createEmptyPublisherFeed(),
      podcastGuid: publisherGuid,
      title: artistName,
      author: artistName,
      description,
      language: language || 'en',
      link: website,
      remoteItems: [{ ...createEmptyRemoteItem(), feedGuid: albumGuid }],
    };

    setPublishError('');
    setPublishing(true);
    setPublishSteps([]);

    try {
      const result = await hostBothOnMSP(
        album,
        publisherFeed,
        nostrState.user.npub,
        (s) => setPublishSteps(prev => {
          const idx = prev.findIndex(p => p.id === s.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = s;
            return next;
          }
          return [...prev, s];
        })
      );

      dispatch({ type: 'SET_PUBLISHER_FEED', payload: result.patchedPublisherFeed });
      dispatch({ type: 'SET_ALBUM', payload: result.patchedAlbum });

      setAlbumFeedUrl(result.album.url);
      wizardStorage.markComplete();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Publishing failed');
    } finally {
      setPublishing(false);
    }
  };

  // ── Step progress dots ───────────────────────────────────────────────────────

  const progressDots = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      {([1, 2, 3, 4] as const).map(n => (
        <div
          key={n}
          title={STEP_LABELS[n - 1]}
          style={{
            width: 10, height: 10, borderRadius: '50%',
            background: n === step
              ? 'var(--accent-primary, #7c3aed)'
              : n < step
                ? 'var(--success, #16a34a)'
                : 'var(--border-color, #ccc)',
            transition: 'background 0.2s',
          }}
        />
      ))}
      <span style={{ fontSize: '0.8em', color: 'var(--text-secondary)', marginLeft: 8 }}>
        Step {step} of 4 — {STEP_LABELS[step - 1]}
      </span>
    </div>
  );

  // ── Step 1 — Login ─────────────────────────────────────────────────────────

  const step1 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        MSP uses Nostr for authentication. Login once and your feeds are linked to your identity.
      </p>
      {nostrState.hasExtension && (
        <button
          className="btn btn-primary"
          onClick={handleExtensionLogin}
          disabled={nostrState.isLoading}
          style={{ width: '100%' }}
        >
          {nostrState.isLoading ? 'Connecting…' : 'Connect with Browser Extension'}
        </button>
      )}
      <div>
        <label className="form-label">Remote signer (Amber, nsecBunker)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="bunker://..."
            value={bunkerUri}
            onChange={e => setBunkerUri(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleBunkerLogin(); }}
          />
          <button
            className="btn btn-primary"
            onClick={handleBunkerLogin}
            disabled={!bunkerUri.trim() || nostrState.isLoading}
          >
            Connect
          </button>
        </div>
      </div>
      {!nostrState.hasExtension && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85em', margin: 0 }}>
          Or install a Nostr browser extension (Alby, nos2x) to connect with one click.
        </p>
      )}
      {(loginError || nostrState.error) && (
        <div style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>
          {loginError || nostrState.error}
        </div>
      )}
      <button
        className="btn btn-link"
        onClick={onOpenLogin}
        style={{ textAlign: 'left', padding: 0, fontSize: '0.85em', color: 'var(--text-secondary)' }}
      >
        More login options →
      </button>
    </div>
  );

  // ── Step 2 — Album Info ────────────────────────────────────────────────────

  const step2 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        Tell us about your release. Fields marked <span style={{ color: 'var(--error, #dc2626)' }}>*</span> are required.
      </p>

      <div className="form-group">
        <label className="form-label">
          Artist / Band Name <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
        </label>
        <input
          className="form-input"
          placeholder="e.g. The Midnight"
          value={artistName}
          onChange={e => setArtistName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          Album Name <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
        </label>
        <input
          className="form-input"
          placeholder="e.g. Monsters"
          value={albumName}
          onChange={e => setAlbumName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          Description <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
        </label>
        <textarea
          className="form-input"
          placeholder="What is this album about? A few sentences is plenty."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          style={{ resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ flex: '0 0 100px' }}>
          <label className="form-label">
            Language <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
          </label>
          <input
            className="form-input"
            placeholder="en"
            value={language}
            onChange={e => setLanguage(e.target.value)}
            maxLength={10}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Website <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span></label>
          <input
            className="form-input"
            placeholder="https://yoursite.com"
            value={website}
            onChange={e => setWebsite(e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const step2Valid = artistName.trim() && albumName.trim() && description.trim() && language.trim();

  // ── Step 3 — Upload + Track Info ───────────────────────────────────────────

  const step3 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        Upload your audio and artwork directly to Blossom — no hosting account needed.
      </p>

      {/* Audio upload */}
      <div>
        <label className="form-label">
          Audio file <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
        </label>
        <input
          type="file"
          accept="audio/*"
          disabled={uploadingAudio}
          style={{ display: 'block', width: '100%' }}
          onChange={handleAudioChange}
        />
        {uploadingAudio && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginTop: 4 }}>
            Uploading to Blossom servers…
          </div>
        )}
        {audioUploadError && (
          <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>{audioUploadError}</span>
            <button type="button" className="btn btn-secondary btn-small" onClick={handleRetryAudio}>
              Retry
            </button>
          </div>
        )}
        {audioUrl && !uploadingAudio && (
          <div style={{ color: 'var(--success, #16a34a)', fontSize: '0.85em', marginTop: 4 }}>✓ Uploaded</div>
        )}
      </div>

      {/* Track metadata (shown once audio is uploaded) */}
      {(audioUrl || uploadingAudio) && (
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">
              Track Title <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
            </label>
            <input
              className="form-input"
              placeholder="e.g. Track 1"
              value={trackTitle}
              onChange={e => setTrackTitle(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '0 0 110px' }}>
            <label className="form-label">Duration <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span></label>
            <input
              className="form-input"
              placeholder="0:00:00"
              value={trackDuration}
              onChange={e => setTrackDuration(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Artwork upload */}
      <div>
        <label className="form-label">
          Album artwork <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional — required for most podcast apps)</span>
        </label>
        <input
          type="file"
          accept="image/*"
          disabled={uploadingArtwork}
          style={{ display: 'block', width: '100%' }}
          onChange={handleArtworkChange}
        />
        {uploadingArtwork && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginTop: 4 }}>
            Uploading to Blossom servers…
          </div>
        )}
        {artworkUploadError && (
          <div style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em', marginTop: 4 }}>{artworkUploadError}</div>
        )}
        {artworkUrl && !uploadingArtwork && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <img src={artworkUrl} alt="Artwork preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
            <span style={{ color: 'var(--success, #16a34a)', fontSize: '0.85em' }}>✓ Uploaded</span>
          </div>
        )}
      </div>
    </div>
  );

  const step3Valid = audioUrl && !uploadingAudio && !uploadingArtwork && trackTitle.trim();

  // ── Step 4 — Publish ───────────────────────────────────────────────────────

  const stepStatusIcon = (status: PublishStep['status']) => {
    if (status === 'done') return <span style={{ color: 'var(--success, #16a34a)' }}>✓</span>;
    if (status === 'in-progress') return <span style={{ color: 'var(--text-secondary)' }}>⋯</span>;
    if (status === 'failed') return <span style={{ color: 'var(--error, #dc2626)' }}>✗</span>;
    return <span style={{ color: 'var(--text-secondary)' }}>○</span>;
  };

  const stepLabels: Record<string, string> = {
    'album-host': 'Hosting album feed',
    'publisher-host': 'Hosting publisher catalog',
  };

  const step4 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!albumFeedUrl && (
        <>
          <div style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--bg-secondary, #f5f5f5)',
            fontSize: '0.9em',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}>
            {artworkUrl && (
              <img src={artworkUrl} alt="Album art" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong>{albumName}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>by {artistName}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>{trackTitle} · {language.toUpperCase()}</span>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9em' }}>
            MSP will host your album feed and a publisher catalog — both cross-linked and submitted to Podcast Index automatically.
          </p>
          {publishSteps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {publishSteps.map(s => (
                <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9em' }}>
                  {stepStatusIcon(s.status)}
                  <span>{stepLabels[s.id] || s.id}</span>
                  {s.message && <span style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>{s.message}</span>}
                </div>
              ))}
            </div>
          )}
          {publishError && (
            <div style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>{publishError}</div>
          )}
        </>
      )}

      {albumFeedUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: 'var(--success, #16a34a)', fontWeight: 600, fontSize: '1.05em' }}>
            🎉 Your feed is live!
          </div>
          <div>
            <label className="form-label">Feed URL (for podcast apps)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                readOnly
                value={albumFeedUrl}
                style={{ flex: 1, fontSize: '0.85em' }}
                onFocus={e => e.target.select()}
              />
              <button
                className="btn btn-secondary btn-small"
                onClick={() => navigator.clipboard.writeText(albumFeedUrl)}
              >
                Copy
              </button>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85em', margin: 0 }}>
            Use this URL in Fountain, Castamatic, Apple Podcasts, or any Podcasting 2.0 app to listen and support you with streaming payments.
          </p>
        </div>
      )}
    </div>
  );

  // ── Footer buttons ─────────────────────────────────────────────────────────

  const footer = (
    <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'center' }}>
      {step === 3 && (
        <button className="btn btn-secondary" onClick={() => setStep(2)}>
          Back
        </button>
      )}
      {step === 4 && !albumFeedUrl && (
        <button className="btn btn-secondary" onClick={() => setStep(3)} disabled={publishing}>
          Back
        </button>
      )}

      {step === 2 && (
        <button
          className="btn btn-primary"
          onClick={() => setStep(3)}
          disabled={!step2Valid}
        >
          Next
        </button>
      )}
      {step === 3 && (
        <button
          className="btn btn-primary"
          onClick={() => setStep(4)}
          disabled={!step3Valid}
        >
          Next: Publish
        </button>
      )}
      {step === 4 && !albumFeedUrl && (
        <button
          className="btn btn-primary"
          onClick={handlePublish}
          disabled={publishing}
          style={{ minWidth: 140 }}
        >
          {publishing ? 'Publishing…' : publishError ? 'Retry' : 'Host on MSP'}
        </button>
      )}
      {albumFeedUrl && (
        <button className="btn btn-primary" onClick={onComplete}>
          Open in Editor →
        </button>
      )}

      <div style={{ flex: 1 }} />

      {!albumFeedUrl && (
        <button
          className="btn btn-secondary"
          onClick={handleDismiss}
          title="Skip wizard and go to editor"
        >
          Skip
        </button>
      )}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="onboarding-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="artist-wizard-title"
    >
      <header className="onboarding-page-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 id="artist-wizard-title" className="onboarding-page-title">New Artist Setup</h1>
          {progressDots}
        </div>
        <button
          type="button"
          ref={closeRef}
          className="onboarding-page-close"
          onClick={handleDismiss}
          aria-label="Close new artist setup"
        >
          ×
        </button>
      </header>

      <main className="onboarding-page-content">
        <div className="onboarding-step">
          {step === 1 && step1}
          {step === 2 && step2}
          {step === 3 && step3}
          {step === 4 && step4}
        </div>
      </main>

      <footer className="onboarding-page-footer">
        {footer}
      </footer>
    </div>
  );
}
