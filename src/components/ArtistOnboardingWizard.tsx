import { useState, useEffect, useRef } from 'react';
import { useNostr } from '../store/nostrStore';
import { useFeed } from '../store/feedStore';
import { createEmptyAlbum, createEmptyTrack, createEmptyPublisherFeed, createEmptyRemoteItem } from '../types/feed';
import { wizardStorage } from '../utils/storage';
import { uploadMediaToBlossom } from '../utils/blossom';
import { hostBothOnMSP } from '../utils/artistPublish';
import type { PublishStep } from '../utils/artistPublish';
import { ModalWrapper } from './modals/ModalWrapper';

interface ArtistOnboardingWizardProps {
  onComplete: () => void;
  onOpenLogin: () => void;
}

const STEP_LABELS = ['Login', 'Your Info', 'Upload Music', 'Publish'];

export function ArtistOnboardingWizard({ onComplete, onOpenLogin }: ArtistOnboardingWizardProps) {
  const { state: nostrState, login, loginWithNip46 } = useNostr();
  const { dispatch } = useFeed();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => (nostrState.isLoggedIn ? 2 : 1));

  // Step 1 — login
  const [bunkerUri, setBunkerUri] = useState('');
  const [loginError, setLoginError] = useState('');

  // Step 2 — names
  const [artistName, setArtistName] = useState('');
  const [albumName, setAlbumName] = useState('');

  // Step 3 — upload
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
      image: artworkUrl,
      publisher: { feedGuid: publisherGuid, feedUrl: '' },
      tracks: [{
        ...createEmptyTrack(1),
        title: albumName,
        enclosureUrl: audioUrl,
        enclosureType: audioMimeType,
        guid: crypto.randomUUID(),
      }],
    };

    const publisherFeed = {
      ...createEmptyPublisherFeed(),
      podcastGuid: publisherGuid,
      title: artistName,
      author: artistName,
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
        (step) => setPublishSteps(prev => {
          const idx = prev.findIndex(s => s.id === step.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = step;
            return next;
          }
          return [...prev, step];
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

  // ── Step 2 — Names ─────────────────────────────────────────────────────────

  const step2 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        What are you releasing?
      </p>
      <div className="form-group">
        <label className="form-label">Artist / Band Name</label>
        <input
          className="form-input"
          placeholder="e.g. The Midnight"
          value={artistName}
          onChange={e => setArtistName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label">Album Name</label>
        <input
          className="form-input"
          placeholder="e.g. Monsters"
          value={albumName}
          onChange={e => setAlbumName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && artistName.trim() && albumName.trim()) setStep(3); }}
        />
      </div>
    </div>
  );

  // ── Step 3 — Upload ────────────────────────────────────────────────────────

  const step3 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        Upload your audio and artwork directly to Blossom — no hosting account needed.
      </p>

      {/* Audio upload */}
      <div>
        <label className="form-label">Audio track</label>
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
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={handleRetryAudio}
            >
              Retry
            </button>
          </div>
        )}
        {audioUrl && !uploadingAudio && (
          <div style={{ color: 'var(--success, #16a34a)', fontSize: '0.85em', marginTop: 4 }}>
            ✓ Uploaded
          </div>
        )}
      </div>

      {/* Artwork upload */}
      <div>
        <label className="form-label">Album artwork <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span></label>
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
          <div style={{ color: 'var(--success, #16a34a)', fontSize: '0.85em', marginTop: 4 }}>
            ✓ Uploaded
          </div>
        )}
      </div>
    </div>
  );

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
            flexDirection: 'column',
            gap: 4,
          }}>
            <strong>{artistName}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>{albumName}</span>
            {artworkUrl && (
              <img src={artworkUrl} alt="Album art" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, marginTop: 4 }} />
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9em' }}>
            MSP will host your album feed and create a publisher catalog — both linked together and submitted to Podcast Index automatically.
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
          disabled={!artistName.trim() || !albumName.trim()}
        >
          Next
        </button>
      )}
      {step === 3 && (
        <button
          className="btn btn-primary"
          onClick={() => setStep(4)}
          disabled={!audioUrl || uploadingAudio || uploadingArtwork}
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
    <ModalWrapper
      isOpen={true}
      onClose={handleDismiss}
      title={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>New Artist Setup</span>
          {progressDots}
        </div>
      }
      footer={footer}
    >
      {step === 1 && step1}
      {step === 2 && step2}
      {step === 3 && step3}
      {step === 4 && step4}
    </ModalWrapper>
  );
}
