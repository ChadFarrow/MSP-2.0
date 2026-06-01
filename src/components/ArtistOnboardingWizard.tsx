import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useNostr } from '../store/nostrStore';
import { useFeed } from '../store/feedStore';
import { createEmptyAlbum, createEmptyTrack, createEmptyPublisherFeed, createEmptyRemoteItem, createSupportRecipients, LANGUAGES, ITUNES_CATEGORIES } from '../types/feed';
import type { Album } from '../types/feed';
import { Toggle } from './Toggle';
import { wizardStorage } from '../utils/storage';
import { uploadMediaToBlossom } from '../utils/blossom';
import { getAudioDuration, secondsToHHMMSS } from '../utils/audioUtils';
import { hostBothOnMSP } from '../utils/artistPublish';
import type { PublishStep } from '../utils/artistPublish';
import { buildHostedUrl } from '../utils/hostedFeed';
import { checkSignerConnection } from '../utils/nostrSigner';
import { InfoIcon } from './InfoIcon';

interface ArtistOnboardingWizardProps {
  onComplete: () => void;
}

const STEP_LABELS = ['Login', 'Your Info', 'Upload Music', 'Publish'];

interface WizardTrack {
  id: string;
  title: string;
  duration: string;
  url: string;
  mimeType: string;
  uploading: boolean;
  error: string;
  file: File | null;
}

export function ArtistOnboardingWizard({ onComplete }: ArtistOnboardingWizardProps) {
  const { state: nostrState, login, loginWithNip46 } = useNostr();
  const { dispatch } = useFeed();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => (nostrState.isLoggedIn ? 2 : 1));

  const closeRef = useRef<HTMLButtonElement>(null);

  // Step 1 — login
  const [bunkerUri, setBunkerUri] = useState('');
  const [loginError, setLoginError] = useState('');
  // NIP-46 QR login (scan with Amber etc.) — folded in from the old "More login
  // options" modal so mobile users can connect without a second dialog.
  const [connectUri, setConnectUri] = useState<string | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Step 2 — album info
  const [artistName, setArtistName] = useState('');
  const [albumName, setAlbumName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('en');
  const [website, setWebsite] = useState('');
  // Step 2 — optional details (discovery + payments)
  const [category, setCategory] = useState('Music');
  const [explicit, setExplicit] = useState(false);
  const [lightningAddress, setLightningAddress] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [keywords, setKeywords] = useState('');
  const [fundingUrl, setFundingUrl] = useState('');

  // Step 3 — tracks + artwork
  const [tracks, setTracks] = useState<WizardTrack[]>([]);
  const [artworkUrl, setArtworkUrl] = useState('');
  const [uploadingArtwork, setUploadingArtwork] = useState(false);
  const [artworkUploadError, setArtworkUploadError] = useState('');
  const lastArtworkFile = useRef<File | null>(null);

  // Step 4 — publish
  const [publishing, setPublishing] = useState(false);
  const [publishSteps, setPublishSteps] = useState<PublishStep[]>([]);
  const [publishError, setPublishError] = useState('');
  const [publisherWarning, setPublisherWarning] = useState('');
  const [albumFeedUrl, setAlbumFeedUrl] = useState('');
  // Generate the feed GUIDs once and reuse them across publish retries — a fresh
  // pair each attempt would orphan the already-hosted album and create duplicates.
  const guidsRef = useRef<{ album: string; publisher: string } | null>(null);

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

  const handleGenerateQr = async () => {
    setLoginError('');
    setGeneratingQr(true);
    setConnectUri(null);
    try {
      // Passing no bunker URI + a callback makes the signer generate a
      // nostrconnect:// URI we render as a QR for the user to scan.
      await loginWithNip46(undefined, (uri) => setConnectUri(uri));
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Could not start QR login');
    } finally {
      setGeneratingQr(false);
    }
  };

  const handleCopyConnectUri = async () => {
    if (!connectUri) return;
    try {
      await navigator.clipboard.writeText(connectUri);
    } catch {
      // Fallback for older / non-secure-context browsers
      const textArea = document.createElement('textarea');
      textArea.value = connectUri;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  // Render the QR onto the canvas whenever the connect URI changes.
  useEffect(() => {
    if (connectUri && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, connectUri, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch((err) => console.error('Failed to generate QR code:', err));
    }
  }, [connectUri]);

  // ── Step 3 handlers ──────────────────────────────────────────────────────────

  const updateTrack = (id: string, patch: Partial<WizardTrack>) =>
    setTracks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));

  const removeTrack = (id: string) => setTracks(prev => prev.filter(t => t.id !== id));

  // Upload one track's file to Blossom and pull its duration locally (in parallel,
  // via an object URL, so we don't depend on the hosted copy being CORS-readable).
  const uploadTrackFile = async (id: string, file: File) => {
    updateTrack(id, { uploading: true, error: '', file });

    const durationUrl = URL.createObjectURL(file);
    getAudioDuration(durationUrl)
      .then((secs) => { if (secs !== null) updateTrack(id, { duration: secondsToHHMMSS(secs) }); })
      .finally(() => URL.revokeObjectURL(durationUrl));

    try {
      const result = await uploadMediaToBlossom(file);
      if (result.success && result.url) {
        updateTrack(id, {
          url: result.url,
          mimeType: file.type || 'audio/mpeg',
        });
      } else {
        updateTrack(id, { error: result.message });
      }
    } finally {
      updateTrack(id, { uploading: false });
    }
  };

  // One or more audio files selected — append a track per file and upload each.
  const handleAddAudioFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const newTracks: WizardTrack[] = files.map((file) => ({
      id: crypto.randomUUID(),
      title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      duration: '',
      url: '',
      mimeType: file.type || 'audio/mpeg',
      uploading: true,
      error: '',
      file,
    }));
    setTracks(prev => [...prev, ...newTracks]);
    newTracks.forEach(t => uploadTrackFile(t.id, t.file!));
  };

  const handleRetryTrack = (id: string) => {
    const track = tracks.find(t => t.id === id);
    if (track?.file) uploadTrackFile(id, track.file);
  };

  const handleArtworkChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    lastArtworkFile.current = file;
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

  const handleRetryArtwork = () => {
    const file = lastArtworkFile.current;
    if (!file) return;
    handleArtworkChange({ target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  // ── Step 4 handler ──────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!nostrState.user?.pubkey) return;

    // Fail fast if the signer is unreachable (sleeping phone, backgrounded Amber,
    // dropped relay) instead of hanging through two sequential 60 s sign timeouts.
    const health = await checkSignerConnection();
    if (!health.connected) {
      setPublishError(health.error || 'Your Nostr signer is not responding. Open your signer app and try again.');
      return;
    }

    if (!guidsRef.current) {
      guidsRef.current = { album: crypto.randomUUID(), publisher: crypto.randomUUID() };
    }
    const { album: albumGuid, publisher: publisherGuid } = guidsRef.current;

    const lnAddr = lightningAddress.trim();
    const album: Album = {
      ...createEmptyAlbum(),
      podcastGuid: albumGuid,
      title: albumName,
      author: artistName,
      // We always have the npub from Nostr login — emit it as <podcast:txt purpose="npub">.
      artistNpub: nostrState.user.npub,
      description,
      language: language || 'en',
      link: website,
      imageUrl: artworkUrl,
      categories: category ? [category] : [],
      keywords,
      explicit,
      ownerName,
      ownerEmail,
      funding: fundingUrl.trim()
        ? [{ url: fundingUrl.trim(), text: `Support ${artistName}`.trim() }]
        : [],
      // Artist gets the lion's share; MSP + Podcast Index keep their 1/1 support
      // splits. No Lightning address → no recipients (the generator drops the
      // empty value block).
      value: {
        type: 'lightning',
        method: 'keysend',
        suggested: '0.000033333',
        recipients: lnAddr
          ? [
              {
                name: artistName || 'Artist',
                address: lnAddr,
                split: 98,
                type: /^[0-9a-f]{66}$/i.test(lnAddr) ? 'node' : 'lnaddress',
              },
              ...createSupportRecipients(),
            ]
          : [],
      },
      publisher: { feedGuid: publisherGuid, feedUrl: '' },
      tracks: tracks.map((t, i) => ({
        ...createEmptyTrack(i + 1),
        title: t.title || albumName,
        enclosureUrl: t.url,
        enclosureType: t.mimeType,
        duration: t.duration,
        guid: crypto.randomUUID(),
      })),
    };

    const publisherFeed = {
      ...createEmptyPublisherFeed(),
      podcastGuid: publisherGuid,
      title: artistName,
      author: artistName,
      description,
      language: language || 'en',
      link: website,
      ownerName,
      ownerEmail,
      // Carry the album art onto the publisher too — PI half-indexes (or skips)
      // publisher feeds with no image, which strands the verify step.
      imageUrl: artworkUrl,
      remoteItems: [{ ...createEmptyRemoteItem(), feedGuid: albumGuid }],
    };

    setPublishError('');
    setPublisherWarning('');
    setPublishing(true);
    setPublishSteps([]);

    // hostBothOnMSP hosts the album first, then the publisher. If the publisher
    // leg fails the album is already live — capture its URL from the step events
    // so we can still show the user their working feed instead of a bare error.
    let albumHostedUrl = '';

    try {
      const result = await hostBothOnMSP(
        album,
        publisherFeed,
        nostrState.user.pubkey,
        (s) => {
          if (s.id === 'album-host' && s.status === 'done') {
            albumHostedUrl = buildHostedUrl(albumGuid);
          }
          setPublishSteps(prev => {
            const idx = prev.findIndex(p => p.id === s.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = s;
              return next;
            }
            return [...prev, s];
          });
        }
      );

      dispatch({ type: 'SET_PUBLISHER_FEED', payload: result.patchedPublisherFeed });
      dispatch({ type: 'SET_ALBUM', payload: result.patchedAlbum });

      setAlbumFeedUrl(result.album.url);
      wizardStorage.markComplete();
    } catch (e) {
      if (albumHostedUrl) {
        // Album published; only the publisher catalog failed. Surface the live
        // album feed and a non-blocking note rather than a dead-end error.
        setAlbumFeedUrl(albumHostedUrl);
        setPublisherWarning(
          'Your album feed is live, but the publisher catalog didn’t finish hosting. You can retry it later from the editor.'
        );
        wizardStorage.markComplete();
      } else {
        setPublishError(e instanceof Error ? e.message : 'Publishing failed');
      }
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
        {!connectUri ? (
          <>
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleGenerateQr}
              disabled={generatingQr || nostrState.isLoading}
              style={{ marginTop: 8 }}
            >
              {generatingQr ? 'Generating…' : 'Or scan a QR code'}
            </button>
          </>
        ) : (
          <div className="connect-qr-container">
            <div className="qr-code-wrapper">
              <canvas ref={qrCanvasRef} />
            </div>
            <p className="connect-waiting">Waiting for your signer to connect…</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-small" onClick={handleCopyConnectUri}>
                Copy URI
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setConnectUri(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
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
          <InfoIcon text="Your artist or band name." />
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
          Album / Single Name <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
          <InfoIcon text="The name of your release. For a single, use the song's name." />
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
          <InfoIcon text="A short description of your release." />
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
        <div className="form-group" style={{ flex: '0 0 160px' }}>
          <label className="form-label">
            Language <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
            <InfoIcon text="The main language of your release." />
          </label>
          <select
            className="form-select"
            value={language}
            onChange={e => setLanguage(e.target.value)}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Website <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span><InfoIcon text="Your artist or band website." /></label>
          <input
            className="form-input"
            placeholder="https://yoursite.com"
            value={website}
            onChange={e => setWebsite(e.target.value)}
          />
        </div>
      </div>

      {/* Optional details — discovery + payments */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 14,
        marginTop: 4, paddingTop: 16, borderTop: '1px solid var(--border-color)',
      }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85em', margin: 0 }}>
          Optional — improves discovery and lets fans pay you.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">
              Category
              <InfoIcon text="The category podcast apps file your release under." />
            </label>
            <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
              {ITUNES_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '0 0 auto', paddingBottom: 8 }}>
            <Toggle checked={explicit} onChange={setExplicit} label="Explicit" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">
            Lightning address <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span>
            <InfoIcon text="Your Lightning address (e.g. you@getalby.com) so fans can stream sats to you while they listen." />
          </label>
          <input
            className="form-input"
            placeholder="you@getalby.com"
            value={lightningAddress}
            onChange={e => setLightningAddress(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Owner name <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span></label>
            <input
              className="form-input"
              placeholder="Your name"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Owner email <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span></label>
            <input
              className="form-input"
              type="email"
              placeholder="you@email.com"
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">
            Keywords <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span>
            <InfoIcon text="Comma-separated tags for search (e.g. rock, indie, guitar)." />
          </label>
          <input
            className="form-input"
            placeholder="rock, indie, guitar"
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">
            Support link <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(optional)</span>
            <InfoIcon text="A page where fans can support you (Patreon, Ko-fi, your site)." />
          </label>
          <input
            className="form-input"
            placeholder="https://patreon.com/you"
            value={fundingUrl}
            onChange={e => setFundingUrl(e.target.value)}
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
        Upload your audio and artwork directly.
      </p>

      {/* Tracks */}
      <div>
        <label className="form-label">
          Tracks <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
        </label>
        <label className="wizard-upload-btn">
          {tracks.length > 0 ? '+ Add more tracks' : 'Choose audio files'}
          <input
            type="file"
            accept="audio/*"
            multiple
            onChange={handleAddAudioFiles}
          />
        </label>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginTop: 4 }}>
          Select one or more audio files. You can add more anytime.
        </div>

        {tracks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {tracks.map((t, i) => (
              <div
                key={t.id}
                style={{
                  border: '1px solid var(--border-color, #ccc)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85em', minWidth: 16 }}>{i + 1}.</span>
                  <input
                    className="form-input"
                    style={{ flex: 1, minWidth: 140 }}
                    placeholder="Track title"
                    value={t.title}
                    onChange={e => updateTrack(t.id, { title: e.target.value })}
                  />
                  <input
                    className="form-input"
                    style={{ width: 90 }}
                    placeholder="0:00:00"
                    value={t.duration}
                    onChange={e => updateTrack(t.id, { duration: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => removeTrack(t.id)}
                    aria-label={`Remove track ${i + 1}`}
                  >
                    ×
                  </button>
                </div>

                {t.uploading && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>
                    Uploading to Blossom servers…
                  </div>
                )}
                {t.error && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>{t.error}</span>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => handleRetryTrack(t.id)}>
                      Retry
                    </button>
                  </div>
                )}
                {t.url && !t.uploading && (
                  <audio controls src={t.url} style={{ width: '100%' }}>
                    Your browser does not support audio playback.
                  </audio>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Artwork upload */}
      <div>
        <label className="form-label">
          Album / Single art <span style={{ color: 'var(--error, #dc2626)' }}>*</span>
          <InfoIcon text="Cover art for your whole release. You can add art to each track later in the editor." />
        </label>
        {!artworkUrl && (
          <label className={`wizard-upload-btn${uploadingArtwork ? ' is-disabled' : ''}`}>
            Choose image
            <input
              type="file"
              accept="image/*"
              disabled={uploadingArtwork}
              onChange={handleArtworkChange}
            />
          </label>
        )}
        {uploadingArtwork && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginTop: 4 }}>
            Uploading to Blossom servers…
          </div>
        )}
        {artworkUploadError && (
          <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>{artworkUploadError}</span>
            <button type="button" className="btn btn-secondary btn-small" onClick={handleRetryArtwork}>
              Retry
            </button>
          </div>
        )}
        {artworkUrl && !uploadingArtwork && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <img src={artworkUrl} alt="Artwork preview" style={{ width: 180, height: 180, objectFit: 'cover', borderRadius: 6 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--success, #16a34a)', fontSize: '0.85em' }}>✓ Uploaded</span>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => { setArtworkUrl(''); setArtworkUploadError(''); }}
                aria-label="Remove artwork"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Duration must be present AND non-zero — a 00:00:00 enclosure duration breaks
  // playback/seek in some podcast apps. /[1-9]/ rejects empty and all-zero values.
  // Every track must be uploaded, titled, and have a non-zero duration (a
  // 00:00:00 enclosure duration breaks playback/seek in some podcast apps).
  const step3Valid =
    tracks.length > 0 &&
    !uploadingArtwork &&
    !!artworkUrl &&
    tracks.every(t => t.url && !t.uploading && t.title.trim() && /[1-9]/.test(t.duration));

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
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>{tracks.length} track{tracks.length === 1 ? '' : 's'} · {language.toUpperCase()}</span>
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
          {publisherWarning && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--bg-secondary, #f5f5f5)',
              color: 'var(--text-secondary)',
              fontSize: '0.85em',
            }}>
              ⚠️ {publisherWarning}
            </div>
          )}
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
