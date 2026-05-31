import { useState, useEffect } from 'react';
import { generateRssFeed, generatePublisherRssFeed, downloadXml, copyToClipboard } from '../../utils/xmlGenerator';
import { saveFeedToNostr, publishNostrMusicTracks, deleteNostrMusicTracks } from '../../utils/nostrSync';
import { uploadFeedToBlossom } from '../../utils/blossom';
import { publishToNsite, defaultSiteId } from '../../utils/nsite';
import type { PublishProgress } from '../../utils/nostrSync';
import type { Album, PublisherFeed } from '../../types/feed';
import type { FeedType } from '../../store/feedStore';
import {
  getHostedFeedInfo,
  saveHostedFeedInfo,
  clearHostedFeedInfo,
  buildHostedUrl,
  createHostedFeedWithNostr,
  updateHostedFeedWithNostr,
  type HostedFeedInfo
} from '../../utils/hostedFeed';
import { albumStorage, videoStorage, publisherStorage } from '../../utils/storage';
import { useNostr } from '../../store/nostrStore';
import { useExperimental } from '../../store/experimentalStore';
import { checkSignerConnection } from '../../utils/nostrSigner';
import { getFeedUrlError } from '../../utils/urlValidation';
import { ModalWrapper } from './ModalWrapper';

const DEFAULT_BLOSSOM_SERVER = 'https://blossom.primal.net/';

interface SaveModalProps {
  onClose: () => void;
  album: Album;
  publisherFeed?: PublisherFeed | null;
  feedType?: FeedType;
  isDirty: boolean;
  isLoggedIn: boolean;
  onImport?: (xml: string) => void;
}

export function SaveModal({ onClose, album, publisherFeed, feedType = 'album', isDirty, isLoggedIn }: SaveModalProps) {
  const { state: nostrState } = useNostr();
  const { showExperimental } = useExperimental();
  const [mode, setMode] = useState<'local' | 'download' | 'clipboard' | 'nostr' | 'nostrMusic' | 'blossom' | 'nsite' | 'hosted' | 'podcastIndex'>('local');
  const isPublisherMode = feedType === 'publisher';
  const isVideoMode = feedType === 'video';

  // Helper to get current feed's GUID and title based on mode
  const currentFeedGuid = isPublisherMode && publisherFeed ? publisherFeed.podcastGuid : album.podcastGuid;
  const currentFeedTitle = isPublisherMode && publisherFeed ? publisherFeed.title : album.title;

  // Helper function to generate XML for current feed type
  // Always updates lastBuildDate to current time per RSS 2.0 spec
  const generateCurrentFeedXml = () => {
    const now = new Date().toUTCString();
    if (isPublisherMode && publisherFeed) {
      return generatePublisherRssFeed({ ...publisherFeed, lastBuildDate: now });
    }
    return generateRssFeed({ ...album, lastBuildDate: now });
  };

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [blossomServer, setBlossomServer] = useState(DEFAULT_BLOSSOM_SERVER);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [stableUrl, setStableUrl] = useState<string | null>(null);
  const [hostedInfo, setHostedInfo] = useState<HostedFeedInfo | null>(null);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [podcastIndexPending, setPodcastIndexPending] = useState(false); // True when PI notified but not yet indexed
  const nsiteSiteId = defaultSiteId(currentFeedGuid);
  const [nsiteUrl, setNsiteUrl] = useState<string | null>(null);
  const [nsiteBlossomUrl, setNsiteBlossomUrl] = useState<string | null>(null);
  const [nsitePiUrl, setNsitePiUrl] = useState<string | null>(null);
  const [nsiteProgress, setNsiteProgress] = useState<string | null>(null);
  const [podcastIndexSubmitUrl, setPodcastIndexSubmitUrl] = useState('');
  const [podcastIndexResultUrl, setPodcastIndexResultUrl] = useState<string | null>(null);

  // Check if feed is owned by current Nostr user
  const isNostrOwner = hostedInfo?.ownerPubkey && nostrState.user?.pubkey === hostedInfo.ownerPubkey;

  // Helper to get button text based on mode and loading state
  const getButtonText = () => {
    if (loading) {
      if (mode === 'nostrMusic' || mode === 'blossom' || mode === 'hosted' || mode === 'nsite') return 'Uploading...';
      if (mode === 'download') return 'Downloading...';
      if (mode === 'clipboard') return 'Copying...';
      if (mode === 'podcastIndex') return 'Submitting...';
      return 'Saving...';
    }
    if (mode === 'nostrMusic') return 'Publish';
    if (mode === 'blossom' || mode === 'hosted' || mode === 'nsite') return 'Upload';
    if (mode === 'download') return 'Download';
    if (mode === 'clipboard') return 'Copy to Clipboard';
    if (mode === 'podcastIndex') return 'Submit to PodcastIndex';
    return 'Save';
  };

  const podcastIndexUrlError = mode === 'podcastIndex' ? getFeedUrlError(podcastIndexSubmitUrl.trim()) : null;

  // Helper to determine if button should be disabled
  const isButtonDisabled = () => {
    if (loading) return true;
    if (mode === 'hosted' && !isLoggedIn) return true;
    if (mode === 'podcastIndex' && (!podcastIndexSubmitUrl.trim() || !!podcastIndexUrlError)) return true;
    return false;
  };

  // Reset mode if the current selection is an experimental option that just got hidden
  useEffect(() => {
    if (!showExperimental && (mode === 'nostr' || mode === 'blossom' || mode === 'nsite')) {
      setMode('local');
    }
  }, [showExperimental, mode]);

  // Auto-fill the Podcast Index submission URL from whichever hosted URL we have
  useEffect(() => {
    if (mode !== 'podcastIndex') return;
    if (podcastIndexSubmitUrl) return; // don't overwrite user edits
    const url = hostedUrl ?? stableUrl ?? nsiteUrl ?? '';
    if (url) setPodcastIndexSubmitUrl(url);
  }, [mode, hostedUrl, stableUrl, nsiteUrl, podcastIndexSubmitUrl]);

  // Check for existing hosted feed info on mount
  useEffect(() => {
    if (!currentFeedGuid) return;
    const info = getHostedFeedInfo(currentFeedGuid);
    if (info) {
      setHostedInfo(info);
      setHostedUrl(buildHostedUrl(info.feedId));
    }
  }, [currentFeedGuid]);

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    setProgress(null);

    // Validate required fields only for publishing modes (not local/download/clipboard/podcastIndex)
    const requiresValidation = !['local', 'download', 'clipboard', 'podcastIndex'].includes(mode);
    if (requiresValidation) {
      const errors: string[] = [];

      if (isPublisherMode && publisherFeed) {
        // Publisher feed validation
        if (!publisherFeed.author?.trim()) errors.push('Artist Name');
        if (!publisherFeed.title?.trim()) errors.push('Catalog Title');
        if (!publisherFeed.description?.trim()) errors.push('Description');
        if (!publisherFeed.podcastGuid?.trim()) errors.push('Publisher GUID');
      } else {
        // Album validation
        // Nostr Music (kind 36787 / 34139) doesn't carry description, file size,
        // or require numeric duration — skip those so imported Nostr Music
        // albums can be re-published without adding fields the events don't use.
        const isNostrMusicMode = mode === 'nostrMusic';

        if (!album.author?.trim()) errors.push('Artist/Band');
        if (!album.title?.trim()) errors.push('Album Title');
        if (!isNostrMusicMode && !album.description?.trim()) errors.push('Description');
        if (!album.imageUrl?.trim()) errors.push('Album Art URL');
        if (!album.language?.trim()) errors.push('Language');
        if (!album.podcastGuid?.trim()) errors.push('Podcast GUID');

        const itemLabel = isVideoMode ? 'Video' : 'Track';
        const urlLabel = isVideoMode ? 'Video URL' : 'MP3 URL';
        album.tracks.forEach((track, i) => {
          if (!track.title?.trim()) errors.push(`${itemLabel} ${i + 1} Title`);
          if (!isNostrMusicMode && !track.duration?.trim()) errors.push(`${itemLabel} ${i + 1} Duration`);
          if (!track.enclosureUrl?.trim()) errors.push(`${itemLabel} ${i + 1} ${urlLabel}`);
          if (!isNostrMusicMode && !track.enclosureLength?.trim()) errors.push(`${itemLabel} ${i + 1} File Size`);
        });
      }

      if (errors.length > 0) {
        setMessage({ type: 'error', text: `Missing required fields: ${errors.join(', ')}` });
        setLoading(false);
        return;
      }
    }

    // Pre-flight: verify signer is reachable before any Nostr operation
    const nostrSignModes = ['nostr', 'nostrMusic', 'blossom', 'nsite'] as const;
    if ((nostrSignModes as readonly string[]).includes(mode)) {
      const health = await checkSignerConnection();
      if (!health.connected) {
        setMessage({ type: 'error', text: health.error ?? 'Nostr signer is not connected.' });
        setLoading(false);
        return;
      }
    }

    // Helper to show success and auto-close
    const showSuccessAndClose = (text: string, delay = 1500) => {
      setMessage({ type: 'success', text });
      setTimeout(() => onClose(), delay);
    };

    try {
      switch (mode) {
        case 'local':
          if (isPublisherMode && publisherFeed) {
            publisherStorage.save(publisherFeed);
          } else if (isVideoMode) {
            videoStorage.save(album);
          } else {
            albumStorage.save(album);
          }
          showSuccessAndClose('Saved to browser storage');
          break;
        case 'download': {
          const xml = generateCurrentFeedXml();
          const feedTitle = isPublisherMode && publisherFeed ? publisherFeed.title : album.title;
          const publisherName = isPublisherMode && publisherFeed?.author ? `${publisherFeed.author}_` : '';
          const filename = `${publisherName}${feedTitle || 'feed'}.xml`.replace(/[^a-z0-9.-]/gi, '_');
          downloadXml(xml, filename);
          showSuccessAndClose('Download started');
          break;
        }
        case 'clipboard': {
          const xmlContent = generateCurrentFeedXml();
          await copyToClipboard(xmlContent);
          showSuccessAndClose('Copied to clipboard');
          break;
        }
        case 'nostr': {
          const nostrResult = isPublisherMode && publisherFeed
            ? await saveFeedToNostr(publisherFeed, 'publisher', isDirty)
            : await saveFeedToNostr(album, 'album', isDirty);
          if (nostrResult.success) {
            showSuccessAndClose(nostrResult.message);
          } else {
            setMessage({ type: 'error', text: nostrResult.message });
          }
          break;
        }
        case 'nostrMusic': {
          const musicResult = await publishNostrMusicTracks(album, undefined, setProgress);
          setProgress(null);
          // Show error/warning if not all tracks published or playlist failed
          const allTracksPublished = musicResult.publishedCount === album.tracks.length;
          const playlistExpected = album.tracks.length >= 2;
          const hasPartialFailure = !allTracksPublished || (playlistExpected && !musicResult.playlistPublished);
          if (musicResult.success && !hasPartialFailure) {
            showSuccessAndClose(musicResult.message);
          } else {
            setMessage({ type: 'error', text: musicResult.message });
          }
          break;
        }
        case 'blossom': {
          const blossomResult = isPublisherMode && publisherFeed
            ? await uploadFeedToBlossom(publisherFeed, 'publisher', blossomServer)
            : await uploadFeedToBlossom(album, 'album', blossomServer);
          if (blossomResult.success) {
            if (blossomResult.url) {
              setFeedUrl(blossomResult.url);
            }
            if (blossomResult.stableUrl) {
              setStableUrl(blossomResult.stableUrl);
            }
          }
          setMessage({
            type: blossomResult.success ? 'success' : 'error',
            text: blossomResult.message
          });
          break;
        }
        case 'nsite': {
          const nsiteFeed = isPublisherMode && publisherFeed ? publisherFeed : album;
          const nsiteFeedType = isPublisherMode ? 'publisher' as const : (feedType === 'video' ? 'video' as const : 'album' as const);
          const nsiteResult = await publishToNsite(
            nsiteFeed,
            nsiteFeedType,
            blossomServer,
            nsiteSiteId,
            (status) => setNsiteProgress(status)
          );
          if (nsiteResult.success) {
            if (nsiteResult.nsiteUrl) {
              setNsiteUrl(nsiteResult.nsiteUrl);
              // Submit to Podcast Index
              setNsiteProgress('Submitting to Podcast Index...');
              try {
                const piMedium = isPublisherMode ? publisherFeed?.medium : album.medium;
                const piParams = new URLSearchParams({ url: nsiteResult.nsiteUrl, guid: currentFeedGuid });
                if (piMedium) piParams.set('medium', piMedium);
                const piRes = await fetch(`/api/pubnotify?${piParams.toString()}`);
                if (piRes.ok) {
                  const piData = await piRes.json();
                  if (piData.podcastIndexUrl) setNsitePiUrl(piData.podcastIndexUrl);
                }
              } catch {
                // Non-fatal — feed is already published to nsite
              }
            }
            if (nsiteResult.blossomUrl) setNsiteBlossomUrl(nsiteResult.blossomUrl);
          }
          setNsiteProgress(null);
          setMessage({
            type: nsiteResult.success ? 'success' : 'error',
            text: nsiteResult.success
              ? nsiteResult.message + ' Feed submitted to Podcast Index.'
              : nsiteResult.message
          });
          break;
        }
        case 'hosted': {
          const health = await checkSignerConnection();
          if (!health.connected) {
            setMessage({ type: 'error', text: health.error ?? 'Nostr signer is not connected.' });
            setLoading(false);
            return;
          }

          const hostedXml = generateCurrentFeedXml();

          if (hostedInfo) {
            const updateResult = await updateHostedFeedWithNostr(hostedInfo.feedId, hostedXml, currentFeedTitle);
            const updatedInfo = { ...hostedInfo, lastUpdated: Date.now() };
            saveHostedFeedInfo(currentFeedGuid, updatedInfo);
            setHostedInfo(updatedInfo);

            if (updateResult.podcastIndexId) {
              setPodcastIndexPending(true);
              setMessage({ type: 'success', text: 'Feed updated! Podcast Index notified.' });
            } else {
              showSuccessAndClose('Feed updated!');
            }
          } else {
            const hostedResult = await createHostedFeedWithNostr(hostedXml, currentFeedTitle, currentFeedGuid);
            const newInfo: HostedFeedInfo = {
              feedId: hostedResult.feedId,
              createdAt: Date.now(),
              lastUpdated: Date.now(),
              ownerPubkey: nostrState.user!.pubkey,
              linkedAt: Date.now()
            };
            saveHostedFeedInfo(currentFeedGuid, newInfo);
            setHostedInfo(newInfo);
            setHostedUrl(buildHostedUrl(hostedResult.feedId));

            let successMsg = 'Feed created and linked to your Nostr identity!';
            if (hostedResult.podcastIndexId) {
              setPodcastIndexPending(true);
              successMsg += ' Podcast Index notified.';
            }
            setMessage({ type: 'success', text: successMsg });
          }
          break;
        }
        case 'podcastIndex': {
          const submitUrl = podcastIndexSubmitUrl.trim();
          if (!submitUrl) {
            setMessage({ type: 'error', text: 'Feed URL is required' });
            setLoading(false);
            return;
          }
          if (podcastIndexUrlError) {
            setMessage({ type: 'error', text: podcastIndexUrlError });
            setLoading(false);
            return;
          }
          setPodcastIndexResultUrl(null);
          const params = new URLSearchParams({ url: submitUrl });
          if (currentFeedGuid) params.set('guid', currentFeedGuid);
          const piMedium = isPublisherMode ? publisherFeed?.medium : album.medium;
          if (piMedium) params.set('medium', piMedium);
          const response = await fetch(`/api/pubnotify?${params}`);
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            setMessage({ type: 'error', text: (data as { error?: string }).error ?? 'Failed to submit to Podcast Index' });
            setLoading(false);
            return;
          }
          if ((data as { podcastIndexUrl?: string }).podcastIndexUrl) {
            setPodcastIndexResultUrl((data as { podcastIndexUrl: string }).podcastIndexUrl);
            setMessage({ type: 'success', text: 'Feed added to Podcast Index!' });
          } else {
            setPodcastIndexResultUrl(`https://podcastindex.org/search?q=${encodeURIComponent(submitUrl)}`);
            setMessage({ type: 'success', text: 'Feed submitted! It may take a moment to appear in the index.' });
          }
          break;
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <>
      <ModalWrapper
        isOpen={true}
        onClose={handleClose}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Save Feed
            <span
              className="import-help-icon"
              onClick={() => setShowHelp(true)}
              title="Show save type descriptions"
              role="button"
              aria-label="Show save type descriptions"
            >
              i
            </span>
          </div>
        }
        footer={
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isButtonDisabled()}
            >
              {getButtonText()}
            </button>
            {mode === 'nostrMusic' && (
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  if (!confirm('Request deletion of all published tracks and playlist for this album from Nostr relays?')) return;
                  setLoading(true);
                  setMessage(null);
                  const result = await deleteNostrMusicTracks(album);
                  setLoading(false);
                  setMessage({ type: result.success ? 'success' : 'error', text: result.message });
                }}
                disabled={loading}
                style={{ color: 'var(--error)' }}
              >
                Unpublish (delete)
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
          </div>
        }
      >
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Save Destination</label>
            <select
              className="form-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="local">Local Storage</option>
              <option value="download">Download XML</option>
              <option value="clipboard">Copy to Clipboard</option>
              <option value="hosted">Host on MSP</option>
              <option value="podcastIndex">Submit to PodcastIndex</option>
              {!isPublisherMode && isLoggedIn && <option value="nostrMusic">Publish to Nostr Music</option>}
              {showExperimental && isLoggedIn && <option value="nostr">Save RSS feed to Nostr 🧪</option>}
              {showExperimental && isLoggedIn && <option value="blossom">Publish RSS feed to a Blossom server 🧪</option>}
              {showExperimental && isLoggedIn && <option value="nsite">Publish RSS feed to nsite 🧪</option>}
            </select>
          </div>

          <div className="nostr-album-preview">
            {isPublisherMode && publisherFeed ? (
              <>
                <h3>{publisherFeed.title || 'Untitled Publisher Feed'}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  {publisherFeed.author || 'No publisher'} &bull; {publisherFeed.remoteItems.length} feed{publisherFeed.remoteItems.length !== 1 ? 's' : ''} in catalog
                </p>
              </>
            ) : (
              <>
                <h3>{album.title || (isVideoMode ? 'Untitled Video Feed' : 'Untitled Album')}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  {album.author || 'No author'} &bull; {album.tracks.length} {isVideoMode ? 'video' : 'track'}{album.tracks.length !== 1 ? 's' : ''}
                </p>
              </>
            )}
          </div>

          {mode === 'local' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Save to your browser's local storage. Data persists until you clear browser data.
            </p>
          )}
          {mode === 'download' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Download the RSS feed as an XML file to your computer.
            </p>
          )}
          {mode === 'clipboard' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Copy the RSS XML to your clipboard for pasting elsewhere.
            </p>
          )}
          {mode === 'nostr' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Publish your feed to Nostr relays. Load it later on any device with your Nostr key.
            </p>
          )}
          {mode === 'nostrMusic' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Publish tracks and playlist to Nostr (kinds 36787 + 34139). Compatible with Nostr music clients.
            </p>
          )}
          {mode === 'blossom' && (
            <div style={{ marginTop: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '12px' }}>
                Upload your RSS feed to a Blossom server. Get a permanent MSP-hosted URL for podcast apps that always resolves to your latest upload.
              </p>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
                  Blossom Server URL
                </label>
                <input
                  type="text"
                  value={blossomServer}
                  onChange={(e) => setBlossomServer(e.target.value)}
                  placeholder="https://blossom.example.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              {feedUrl && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Direct Blossom URL (changes with each update)
                  </label>
                  <input
                    type="text"
                    value={feedUrl}
                    readOnly
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>
              )}
              {stableUrl && (
                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--success)' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem', fontWeight: 600, color: 'var(--success)' }}>
                    Stable Feed URL (for podcast apps)
                  </label>
                  <input
                    type="text"
                    value={stableUrl}
                    readOnly
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid var(--success)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace'
                    }}
                  />
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '8px', marginBottom: '8px' }}>
                    Use this URL in Apple Podcasts, Spotify, etc. It always points to the latest version.
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      navigator.clipboard.writeText(stableUrl);
                      setMessage({ type: 'success', text: 'Stable URL copied to clipboard' });
                    }}
                  >
                    Copy Stable URL
                  </button>
                </div>
              )}
            </div>
          )}
          {mode === 'nsite' && (
            <div style={{ marginTop: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '12px' }}>
                Publish your feed as a decentralized nsite (NIP-5A) — experimental. Uploads to Blossom and creates a Nostr site manifest, reachable through any nsite gateway.
              </p>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
                  Blossom Server URL
                </label>
                <input
                  type="text"
                  value={blossomServer}
                  onChange={(e) => setBlossomServer(e.target.value)}
                  placeholder="https://blossom.example.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              {nsiteProgress && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '12px' }}>
                  {nsiteProgress}
                </p>
              )}
              {nsiteUrl && (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--success)' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem', fontWeight: 600, color: 'var(--success)' }}>
                    nsite Feed URL
                  </label>
                  <input
                    type="text"
                    value={nsiteUrl}
                    readOnly
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid var(--success)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace'
                    }}
                  />
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '8px', marginBottom: '8px' }}>
                    This URL serves your feed through the nsite.lol gateway. It may take a moment for gateways to pick up the manifest.
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (nsiteUrl) {
                        navigator.clipboard.writeText(nsiteUrl);
                        setMessage({ type: 'success', text: 'nsite URL copied to clipboard' });
                      }
                    }}
                  >
                    Copy nsite URL
                  </button>
                </div>
              )}
              {nsiteBlossomUrl && (
                <div style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Direct Blossom URL (changes with each update)
                  </label>
                  <input
                    type="text"
                    value={nsiteBlossomUrl}
                    readOnly
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.7rem',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>
              )}
              {nsitePiUrl && (
                <div style={{ marginTop: '8px' }}>
                  <a
                    href={nsitePiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.875rem', color: 'var(--accent-color)' }}
                  >
                    View on Podcast Index →
                  </a>
                </div>
              )}
            </div>
          )}
          {mode === 'hosted' && (
            <div style={{ marginTop: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '12px' }}>
                {hostedInfo
                  ? 'Your feed is already hosted. Click Upload to update it with your latest changes.'
                  : isLoggedIn
                    ? 'Host your RSS feed on MSP. Managed with your Nostr identity — no token needed.'
                    : 'Nostr login required to host a feed.'}
              </p>
              {!isLoggedIn && (
                <p style={{ color: 'var(--warning, #f59e0b)', fontSize: '0.75rem', padding: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                  Sign in with Nostr to host and manage your feed from any device.
                </p>
              )}
              {hostedUrl && (
                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--success)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '0.875rem', fontWeight: 600, color: 'var(--success)' }}>
                    Your Feed URL
                    {isNostrOwner && (
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', borderRadius: '4px' }}>
                        Linked to Nostr
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={hostedUrl}
                    readOnly
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid var(--success)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace'
                    }}
                  />
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '8px', marginBottom: '8px' }}>
                    Use this URL in Apple Podcasts, Spotify, etc. It always points to the latest version.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        navigator.clipboard.writeText(hostedUrl);
                        setMessage({ type: 'success', text: 'Feed URL copied to clipboard' });
                      }}
                    >
                      Copy URL
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => {
                        clearHostedFeedInfo(currentFeedGuid);
                        setHostedInfo(null);
                        setHostedUrl(null);
                        setMessage({ type: 'success', text: 'Feed unlinked from this browser' });
                      }}
                    >
                      Unlink
                    </button>
                  </div>
                  {podcastIndexPending && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Podcast Index
                      </label>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                        Feed submitted to Podcast Index. It may take a few minutes to appear.
                        <br />
                        <a
                          href={`https://podcastindex.org/search?q=${encodeURIComponent(hostedUrl || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#3b82f6' }}
                        >
                          Check status or add manually →
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {mode === 'podcastIndex' && (
            <div style={{ marginTop: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '12px' }}>
                Submit a feed URL to Podcast Index so it gets indexed and becomes discoverable in apps like Fountain, Castamatic, and others.
              </p>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Feed URL
              </label>
              <input
                type="text"
                value={podcastIndexSubmitUrl}
                onChange={(e) => setPodcastIndexSubmitUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: `1px solid ${podcastIndexUrlError ? 'var(--error, #ef4444)' : 'var(--border-color)'}`,
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace'
                }}
              />
              {podcastIndexUrlError && (
                <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--error, #ef4444)' }}>
                  {podcastIndexUrlError}
                </div>
              )}
              {podcastIndexResultUrl && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid var(--success)'
                }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)' }}>
                    View on Podcast Index
                  </label>
                  <a
                    href={podcastIndexResultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.875rem', color: '#3b82f6', wordBreak: 'break-all' }}
                  >
                    {podcastIndexResultUrl}
                  </a>
                </div>
              )}
              <div style={{ marginTop: '12px' }}>
                <a
                  href="https://podcastindex.org/add"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', color: '#3b82f6' }}
                >
                  Add feed manually on podcastindex.org →
                </a>
              </div>
            </div>
          )}
          {progress && (
            <div style={{ marginTop: '12px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {progress.phase === 'tracks'
                ? `Publishing track ${progress.current} of ${progress.total}: ${progress.trackTitle}`
                : `Publishing playlist: ${progress.trackTitle}`
              }
            </div>
          )}

          {message && (
            <div style={{
              color: message.type === 'error' ? 'var(--error)' : 'var(--success)',
              marginTop: '12px',
              fontSize: '0.875rem'
            }}>
              {message.text}
            </div>
          )}
        </ModalWrapper>

      {showHelp && (
        <ModalWrapper
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title="Save Types"
          className="import-help-modal"
          style={{ zIndex: 1001 }}
          footer={
            <button className="btn btn-primary" onClick={() => setShowHelp(false)}>Got it</button>
          }
        >
          <ul className="import-help-list">
                <li><strong>Local Storage</strong> - Save to your browser's local storage. Data persists until you clear browser data.</li>
                <li><strong>Download XML</strong> - Download the RSS feed as an XML file to your computer.</li>
                <li><strong>Copy to Clipboard</strong> - Copy the RSS XML to your clipboard for pasting elsewhere.</li>
                <li><strong>Host on MSP</strong> - Host your feed on MSP servers. Get a permanent URL for your RSS feed to use in any app. Managed with your Nostr identity — edit from any device.</li>
                <li><strong>Submit to PodcastIndex</strong> - Submit a feed URL to Podcast Index so it gets indexed and becomes discoverable in apps like Fountain, Castamatic, and others.</li>
                <li><strong>Publish to Nostr Music</strong> - Publishes each track (kind 36787) and the playlist (kind 34139) as Nostr events for Nostr-native music clients like Wavlake and Fountain. Audio files must already be hosted somewhere - these events just point to them. Not a podcast RSS feed.</li>
                {showExperimental && <li><strong>Save RSS feed to Nostr 🧪</strong> - Stores the entire RSS XML inside a Nostr event (kind 30054) on your relays. Personal cross-device backup tied to your Nostr key. Not readable by podcast apps.</li>}
                {showExperimental && <li><strong>Publish RSS feed to a Blossom server 🧪</strong> - Uploads the RSS file to a Blossom server and registers a Nostr pointer (kind 1063) so MSP can serve a permanent URL. Subscribable in any podcast app.</li>}
                {showExperimental && <li><strong>Publish RSS feed to nsite 🧪</strong> - Uploads the RSS file to a Blossom server and publishes an nsite site manifest (NIP-5A). Reachable as a permanent web URL through any nsite gateway. Subscribable in podcast apps.</li>}
              </ul>
            </ModalWrapper>
      )}
    </>
  );
}
