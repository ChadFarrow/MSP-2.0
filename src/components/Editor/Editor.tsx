import { useState, useEffect, useCallback } from 'react';
import { useFeed } from '../../store/feedStore';
import { useNostr } from '../../store/nostrStore';
import { useFeaturePrefs } from '../../store/featurePrefsStore';
import { PERSON_GROUPS, PERSON_ROLES, createEmptyPersonRole, createEmptyTrack, isVideoMedium, isCommunitySupport, createSupportRecipients, hasUserRecipients } from '../../types/feed';
import type { PersonGroup } from '../../types/feed';
import { FIELD_INFO } from '../../data/fieldInfo';
import { detectAddressType } from '../../utils/addressUtils';
import { getMediaDuration, secondsToHHMMSS, formatDuration, getAudioMimeType, isKnownAudioFormat } from '../../utils/audioUtils';
import { getVideoMimeType } from '../../utils/videoUtils';
import { isNaddrString, resolveNostrVideo } from '../../utils/nostrVideoConverter';
import { isBlossomMediaUrl } from '../../utils/blossom';
import { BlossomFileUpload } from '../BlossomFileUpload';
import { getFeedUrlError } from '../../utils/urlValidation';
import { InfoIcon } from '../InfoIcon';
import { Section } from '../Section';
import { Toggle } from '../Toggle';
import { EditorChrome } from './EditorChrome';
import { AddRecipientSelect } from '../AddRecipientSelect';
import { AlbumValueSection } from './AlbumEditor/AlbumValueSection';
import { AlbumFundingSection } from './AlbumEditor/AlbumFundingSection';
import { AlbumArtworkSection } from './AlbumEditor/AlbumArtworkSection';
import { AlbumInfoSection } from './AlbumEditor/AlbumInfoSection';
import { PersonsSection } from './AlbumEditor/PersonsSection';

interface EditorProps {
  chromeless?: boolean;
}

export function Editor({ chromeless = false }: EditorProps = {}) {
  const { state, dispatch } = useFeed();
  const { state: nostrState } = useNostr();
  const { isEnabled } = useFeaturePrefs();
  // Get the active album based on feedType (album or videoFeed)
  const album = state.feedType === 'video' && state.videoFeed ? state.videoFeed : state.album;

  // Simple collapse state - all tracks start expanded (empty object = nothing collapsed)
  // Editor remounts on album change (via key prop), so this always starts fresh
  const [collapsedTracks, setCollapsedTracks] = useState<Record<string, boolean>>({});
  const [publisherLookup, setPublisherLookup] = useState<{
    loading: boolean;
    error: string | null;
    feedTitle: string | null;
    feedImage: string | null;
  }>({ loading: false, error: null, feedTitle: null, feedImage: null });

  // Nostr naddr resolution state (per-track index)
  const [resolvingNaddr, setResolvingNaddr] = useState<Record<number, boolean>>({});
  const [naddrError, setNaddrError] = useState<Record<number, string>>({});

  // Submit to Podcast Index state
  const [piSubmitting, setPiSubmitting] = useState(false);
  const [piSubmitResult, setPiSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
  const publisherFeedUrlError = getFeedUrlError((album.publisher?.feedUrl || '').trim());

  // Auto-lookup publisher feed in Podcast Index when URL changes
  const lookupPublisherFeed = useCallback(async (feedUrl: string) => {
    if (!feedUrl) {
      setPublisherLookup({ loading: false, error: null, feedTitle: null, feedImage: null });
      return;
    }

    // Only lookup actual URLs, not search terms
    if (!feedUrl.startsWith('http://') && !feedUrl.startsWith('https://')) {
      setPublisherLookup({ loading: false, error: null, feedTitle: null, feedImage: null });
      return;
    }

    setPublisherLookup({ loading: true, error: null, feedTitle: null, feedImage: null });

    try {
      const response = await fetch(`/api/pisearch?q=${encodeURIComponent(feedUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        setPublisherLookup({ loading: false, error: data.error || 'Feed not found', feedTitle: null, feedImage: null });
        return;
      }

      const feed = data.feeds?.[0];
      if (feed?.podcastGuid) {
        dispatch({
          type: 'UPDATE_ALBUM',
          payload: {
            publisher: {
              feedGuid: feed.podcastGuid,
              feedUrl: feedUrl
            }
          }
        });
        setPublisherLookup({ loading: false, error: null, feedTitle: feed.title || null, feedImage: feed.image || null });
      } else {
        setPublisherLookup({ loading: false, error: 'Feed not found in Podcast Index', feedTitle: null, feedImage: null });
      }
    } catch {
      setPublisherLookup({ loading: false, error: 'Failed to lookup feed', feedTitle: null, feedImage: null });
    }
  }, [dispatch]);

  // Debounce publisher URL lookup
  useEffect(() => {
    const url = album.publisher?.feedUrl;
    if (!url) {
      setPublisherLookup({ loading: false, error: null, feedTitle: null, feedImage: null });
      return;
    }

    const timer = setTimeout(() => {
      lookupPublisherFeed(url);
    }, 500);

    return () => clearTimeout(timer);
  }, [album.publisher?.feedUrl, lookupPublisherFeed]);

  // Submit feed to Podcast Index
  const handleSubmitToPI = async () => {
    const feedUrl = album.publisher?.feedUrl;
    if (!feedUrl?.trim()) return;
    setPiSubmitting(true);
    setPiSubmitResult(null);
    try {
      // First validate it's an actual RSS feed
      const proxyRes = await fetch(`/api/proxy-feed?url=${encodeURIComponent(feedUrl)}`);
      if (!proxyRes.ok) {
        setPiSubmitResult({ success: false, message: 'Could not fetch URL - check the address' });
        return;
      }
      const content = await proxyRes.text();
      if (!content.includes('<rss') && !content.includes('<feed') && !content.includes('<channel')) {
        setPiSubmitResult({ success: false, message: 'URL does not appear to be an RSS feed' });
        return;
      }

      // Submit to Podcast Index
      const response = await fetch('/api/pisubmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: feedUrl })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setPiSubmitResult({ success: true, message: 'Submitted! May take a few minutes to index.' });
      } else {
        setPiSubmitResult({ success: false, message: data.error || data.details?.description || 'Failed to submit' });
      }
    } catch {
      setPiSubmitResult({ success: false, message: 'Failed to submit' });
    } finally {
      setPiSubmitting(false);
    }
  };

  // Determine if this is a video feed
  const isVideo = isVideoMedium(album.medium);

  const toggleTrackCollapse = (trackId: string) => {
    setCollapsedTracks(prev => ({
      ...prev,
      [trackId]: !prev[trackId]
    }));
  };

  const allTracksCollapsed = album?.tracks?.length > 0 && album.tracks.every(t => collapsedTracks[t.id]);

  const toggleAllTracks = () => {
    if (allTracksCollapsed) {
      setCollapsedTracks({});
    } else {
      const allCollapsed: Record<string, boolean> = {};
      album?.tracks?.forEach(t => { allCollapsed[t.id] = true; });
      setCollapsedTracks(allCollapsed);
    }
  };

  return (
    <>
      <EditorChrome chromeless={chromeless}>
          {/* Album/Video Info Section */}
          <AlbumInfoSection
            album={album}
            dispatch={dispatch}
            isArtistMode={state.feedType === 'artist'}
            isLoggedIn={nostrState.isLoggedIn}
            userNpub={nostrState.user?.npub}
          />

          {/* Artwork Section */}
          <AlbumArtworkSection album={album} dispatch={dispatch} />

          {/* Credits Section */}
          <Section title="Credits / Persons" icon="&#128100;">
            <PersonsSection
              persons={album.persons}
              onUpdatePerson={(index, person) => dispatch({ type: 'UPDATE_PERSON', payload: { index, person } })}
              onAddPerson={() => dispatch({ type: 'ADD_PERSON' })}
              onRemovePerson={index => dispatch({ type: 'REMOVE_PERSON', payload: index })}
              onUpdateRole={(personIndex, roleIndex, role) => dispatch({ type: 'UPDATE_PERSON_ROLE', payload: { personIndex, roleIndex, role } })}
              onAddRole={personIndex => dispatch({ type: 'ADD_PERSON_ROLE', payload: { personIndex, role: createEmptyPersonRole() } })}
              onRemoveRole={(personIndex, roleIndex) => dispatch({ type: 'REMOVE_PERSON_ROLE', payload: { personIndex, roleIndex } })}
              showThumbnailPreview
              showRolesModalButton
            />
          </Section>

          {/* Value Block Section */}
          {isEnabled('lightning') && <AlbumValueSection album={album} dispatch={dispatch} />}

          {/* Funding Section */}
          <AlbumFundingSection album={album} dispatch={dispatch} />

          {/* Publisher Section — hidden in Artist mode (combined editor handles cross-link via local publisher feed) */}
          {state.feedType !== 'artist' && (
          <Section title="Publisher Feed (Advanced)" icon="&#127970;">
            {state.publisherFeed && album.publisher?.feedGuid === state.publisherFeed.podcastGuid ? (
              <div style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)' }}>
                  Linked to publisher feed: <strong>{state.publisherFeed.title || 'Publisher Catalog'}</strong>. Switch to Publisher view to review the catalog and download both feeds.
                </p>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                  onClick={() => dispatch({ type: 'SET_FEED_TYPE', payload: 'publisher' })}
                >
                  Go to Publisher
                </button>
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>
                Link this album to a publisher catalog. If you haven't created a publisher feed yet, use <strong>Artist Setup</strong> when creating a new album, or switch to Publisher mode from the dropdown.
              </p>
            )}
            <div className="form-group">
              <label className="form-label">Publisher Feed URL<InfoIcon text={FIELD_INFO.publisherUrl} /></label>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com/publisher-feed.xml"
                value={album.publisher?.feedUrl || ''}
                onChange={e => dispatch({
                  type: 'UPDATE_ALBUM',
                  payload: {
                    publisher: {
                      feedGuid: '',
                      feedUrl: e.target.value
                    }
                  }
                })}
                style={publisherFeedUrlError ? { borderColor: 'var(--error, #ef4444)' } : undefined}
              />
              {publisherFeedUrlError && (
                <p style={{ color: 'var(--error, #ef4444)', fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>
                  {publisherFeedUrlError}
                </p>
              )}
              {publisherLookup.loading && (
                <p style={{ color: 'var(--text-tertiary)', marginTop: '8px', fontSize: '12px' }}>
                  Looking up feed in Podcast Index...
                </p>
              )}
              {publisherLookup.error && (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ color: 'var(--warning-color, #f59e0b)', fontSize: '12px', marginBottom: '8px' }}>
                    ⚠ {publisherLookup.error}
                  </p>
                  {publisherLookup.error === 'Feed not found in Podcast Index' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={handleSubmitToPI}
                        disabled={piSubmitting || !!publisherFeedUrlError}
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                      >
                        {piSubmitting ? 'Submitting...' : 'Submit to Podcast Index'}
                      </button>
                      {piSubmitResult && (
                        <span style={{
                          color: piSubmitResult.success ? 'var(--success-color, #22c55e)' : 'var(--danger-color, #ef4444)',
                          fontSize: '12px'
                        }}>
                          {piSubmitResult.message}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {album.publisher?.feedGuid && !publisherLookup.loading && !publisherLookup.error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                  {publisherLookup.feedImage && (
                    <img
                      src={publisherLookup.feedImage}
                      alt=""
                      style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }}
                    />
                  )}
                  <p style={{ color: 'var(--success)', fontSize: '12px', margin: 0 }}>
                    ✓ Found: {publisherLookup.feedTitle || 'Publisher Feed'}
                  </p>
                </div>
              )}
            </div>
          </Section>
          )}

          {/* Tracks/Videos Section */}
          <Section title={isVideo ? "Videos" : "Tracks"} icon={isVideo ? "🎬" : "🎵"}>
            {album.tracks.length > 0 && (
              <div style={{ marginBottom: '12px', textAlign: 'right' }}>
                <button
                  className="btn btn-secondary"
                  onClick={toggleAllTracks}
                  style={{ fontSize: '0.875rem', padding: '4px 12px' }}
                >
                  {allTracksCollapsed ? 'Expand All' : 'Collapse All'}
                </button>
              </div>
            )}
            <div className="track-list">
              {album.tracks.map((track, index) => (
                <div key={track.id} className="repeatable-item" style={{ flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, cursor: 'pointer' }}
                      onClick={() => toggleTrackCollapse(track.id)}
                    >
                      <span className="track-number">{track.trackNumber}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{track.title || (isVideo ? 'Untitled Video' : 'Untitled Track')}</span>
                      {track.duration && track.duration !== '00:00:00' && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{track.duration}</span>
                      )}
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {collapsedTracks[track.id] ? '▶' : '▼'}
                      </span>
                    </div>
                    <button
                      className="btn btn-icon btn-danger"
                      onClick={() => dispatch({ type: 'REMOVE_TRACK', payload: index })}
                    >
                      &#10005;
                    </button>
                  </div>
                  {!collapsedTracks[track.id] && (
                  <div className="form-grid" style={{ marginTop: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">{isVideo ? 'Video Title' : 'Track Title'} <span className="required">*</span><InfoIcon text={FIELD_INFO.trackTitle} /></label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={isVideo ? "Enter video title" : "Enter track title"}
                        value={track.title || ''}
                        onChange={e => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: { title: e.target.value } }
                        })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{isVideo ? 'Video URL' : 'MP3 URL'} <span className="required">*</span><InfoIcon text={FIELD_INFO.enclosureUrl} /></label>
                      <input
                          type="url"
                          className="form-input"
                          placeholder={isVideo ? "https://example.com/video.mp4" : "https://example.com/track.mp3"}
                          value={track.enclosureUrl || ''}
                          onChange={e => {
                            const url = e.target.value;
                            dispatch({
                              type: 'UPDATE_TRACK',
                              payload: { index, track: { enclosureUrl: url } }
                            });
                            if (url) {
                              const mimeType = isVideo ? getVideoMimeType(url) : getAudioMimeType(url);
                              dispatch({
                                type: 'UPDATE_TRACK',
                                payload: { index, track: { enclosureType: mimeType } }
                              });
                            }
                          }}
                          onPaste={async e => {
                            const pastedText = e.clipboardData.getData('text').trim();
                            if (isVideo && isNaddrString(pastedText)) {
                              e.preventDefault();
                              setResolvingNaddr(prev => ({ ...prev, [index]: true }));
                              setNaddrError(prev => { const next = { ...prev }; delete next[index]; return next; });
                              try {
                                const videoData = await resolveNostrVideo(pastedText);
                                if (videoData) {
                                  dispatch({
                                    type: 'UPDATE_TRACK',
                                    payload: {
                                      index,
                                      track: {
                                        enclosureUrl: videoData.url,
                                        enclosureType: videoData.mimeType,
                                        enclosureLength: '33',
                                        ...(videoData.duration && { duration: videoData.duration }),
                                      }
                                    }
                                  });
                                }
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : 'Failed to resolve Nostr video';
                                setNaddrError(prev => ({ ...prev, [index]: msg }));
                              } finally {
                                setResolvingNaddr(prev => ({ ...prev, [index]: false }));
                              }
                              return;
                            }
                            const url = pastedText;
                            if (url && url.startsWith('http')) {
                              e.preventDefault();
                              const isNewUrl = url !== track.enclosureUrl;
                              dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { enclosureUrl: url } } });
                              const mimeType = isVideo ? getVideoMimeType(url) : getAudioMimeType(url);
                              dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { enclosureType: mimeType } } });
                              if (isNewUrl || !track.duration) {
                                const duration = await getMediaDuration(url);
                                if (duration !== null) {
                                  dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { duration: secondsToHHMMSS(duration) } } });
                                }
                              }
                              if (isNewUrl || !track.enclosureLength) {
                                dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { enclosureLength: '33' } } });
                              }
                            }
                          }}
                          onBlur={async e => {
                            const url = e.target.value;
                            if (url && url.startsWith('http')) {
                              if (!track.duration) {
                                const duration = await getMediaDuration(url);
                                if (duration !== null) {
                                  dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { duration: secondsToHHMMSS(duration) } } });
                                }
                              }
                              if (!track.enclosureLength) {
                                dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { enclosureLength: '33' } } });
                              }
                            }
                          }}
                        />
                      {!isVideo && (
                        <BlossomFileUpload
                          accept="audio/*"
                          label="Upload audio to Blossom"
                          onUploaded={async ({ url, file }) => {
                            dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { enclosureUrl: url } } });
                            dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { enclosureType: file.type || getAudioMimeType(url) } } });
                            dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { enclosureLength: String(file.size) } } });
                            const duration = await getMediaDuration(url);
                            if (duration !== null) {
                              dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { duration: secondsToHHMMSS(duration) } } });
                            }
                          }}
                        />
                      )}
                      {isVideo && resolvingNaddr[index] && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginTop: '4px' }}>
                          Resolving Nostr video...
                        </div>
                      )}
                      {isVideo && naddrError[index] && (
                        <div style={{ color: 'var(--error)', fontSize: '0.85em', marginTop: '4px' }}>
                          {naddrError[index]}
                        </div>
                      )}
                      {isVideo && !resolvingNaddr[index] && !track.enclosureUrl && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginTop: '4px', opacity: 0.7 }}>
                          Tip: Paste a Nostr naddr to auto-fill video details
                        </div>
                      )}
                      {!isVideo && track.enclosureUrl && !isKnownAudioFormat(track.enclosureUrl) && !isBlossomMediaUrl(track.enclosureUrl) && (
                        <div style={{ color: 'var(--warning, #b8860b)', fontSize: '0.85em', marginTop: '4px' }}>
                          URL doesn't end with a recognized audio extension (mp3, flac, wav, m4a, aac, ogg, opus, aiff). Podcast apps may not play it.
                        </div>
                      )}
                      {track.enclosureUrl && (
                        isVideo ? (
                          <video
                            src={track.enclosureUrl}
                            controls
                            style={{ width: '100%', marginTop: '8px', maxHeight: '300px' }}
                            onError={e => (e.target as HTMLVideoElement).style.display = 'none'}
                          />
                        ) : (
                          <audio
                            src={track.enclosureUrl}
                            controls
                            style={{ width: '100%', marginTop: '8px' }}
                            onError={e => (e.target as HTMLAudioElement).style.display = 'none'}
                          />
                        )
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Duration (HH:MM:SS) <span className="required">*</span><InfoIcon text={FIELD_INFO.trackDuration} /></label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="00:00:00"
                        value={track.duration || ''}
                        onChange={e => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: { duration: e.target.value } }
                        })}
                        onBlur={e => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: { duration: formatDuration(e.target.value) } }
                        })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            dispatch({
                              type: 'UPDATE_TRACK',
                              payload: { index, track: { duration: formatDuration((e.target as HTMLInputElement).value) } }
                            });
                          }
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Pub Date<InfoIcon text={FIELD_INFO.trackPubDate} /></label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={track.pubDate ? new Date(track.pubDate).toISOString().slice(0, 16) : ''}
                        onChange={e => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: { pubDate: new Date(e.target.value).toUTCString() } }
                        })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{isVideo ? 'Video #' : 'Track #'} (Episode)<InfoIcon text={FIELD_INFO.trackEpisode} /></label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder={String(track.trackNumber)}
                        min="1"
                        value={track.episode ?? ''}
                        onChange={e => {
                          const newEpisode = e.target.value ? parseInt(e.target.value) : undefined;
                          dispatch({
                            type: 'UPDATE_TRACK',
                            payload: { index, track: { episode: newEpisode } }
                          });
                          // Also reorder to match episode number
                          if (newEpisode !== undefined) {
                            const newIndex = newEpisode - 1;
                            if (newIndex >= 0 && newIndex < album.tracks.length && newIndex !== index) {
                              dispatch({ type: 'REORDER_TRACKS', payload: { fromIndex: index, toIndex: newIndex } });
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="form-group full-width">
                      <div className="track-preview-container" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                        {/* Left column: Description */}
                        <div className="track-description" style={{ flex: 1, minWidth: 0 }}>
                          <label className="form-label">Description<InfoIcon text={FIELD_INFO.trackDescription} /></label>
                          <textarea
                            className="form-textarea"
                            placeholder="Track description or notes"
                            value={track.description || ''}
                            onChange={e => dispatch({
                              type: 'UPDATE_TRACK',
                              payload: { index, track: { description: e.target.value } }
                            })}
                          />
                        </div>
                        {/* Right column: Thumbnail preview (from Track Art URL) */}
                        <div className="track-thumbnail-preview" style={{
                          width: '140px',
                          flexShrink: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <div style={{
                            width: '100%',
                            ...(!isVideo && { aspectRatio: '1' }),
                            borderRadius: '8px',
                            overflow: 'hidden',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...(isVideo && !track.trackArtUrl && { aspectRatio: '16 / 9' })
                          }}>
                            {track.trackArtUrl ? (
                              <img
                                src={track.trackArtUrl}
                                alt={track.title || 'Track art thumbnail'}
                                style={{ width: '100%', display: 'block' }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                                onLoad={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'block';
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: '48px', color: 'var(--text-muted)' }}>
                                {isVideo ? '\u25B6' : '\u266B'}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>
                            {track.trackArtUrl ? (isVideo ? 'Thumbnail' : 'Track art') : (isVideo ? 'No thumbnail' : 'No track art')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">{isVideo ? 'Thumbnail URL' : 'Track Art URL'}<InfoIcon text={FIELD_INFO.trackArtUrl} /></label>
                      <input
                        type="url"
                        className="form-input"
                        placeholder={isVideo ? "Override cover art for this video" : "Override album art for this track"}
                        value={track.trackArtUrl || ''}
                        onChange={e => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: { trackArtUrl: e.target.value } }
                        })}
                      />
                      <BlossomFileUpload accept="image/*" onUploaded={({ url }) => dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { trackArtUrl: url } } })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Lyrics URL<InfoIcon text={FIELD_INFO.transcriptUrl} /></label>
                      <input
                        type="url"
                        className="form-input"
                        placeholder="https://example.com/lyrics.srt"
                        value={track.transcriptUrl || ''}
                        onChange={e => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: { transcriptUrl: e.target.value } }
                        })}
                      />
                      <BlossomFileUpload accept=".srt,.vtt,text/plain" label="Upload lyrics to Blossom (.srt / .vtt)" onUploaded={({ url }) => dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { transcriptUrl: url } } })} />
                    </div>
                    <div className="form-group">
                      <Toggle
                        checked={track.explicit}
                        onChange={val => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: { explicit: val } }
                        })}
                        label="Explicit"
                        labelSuffix={<InfoIcon text={FIELD_INFO.trackExplicit} />}
                      />
                    </div>
                    <div className="form-group">
                      <Toggle
                        checked={track.overridePersons}
                        onChange={val => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: {
                            overridePersons: val,
                            ...(val && track.persons.length === 0 ? {
                              persons: album.persons.map(p => ({ ...p, roles: p.roles.map(r => ({ ...r })) }))
                            } : {})
                          } }
                        })}
                        label="Override Persons"
                        labelSuffix={<InfoIcon text={FIELD_INFO.overridePersons} />}
                      />
                    </div>
                    {isEnabled('lightning') && (
                    <div className="form-group">
                      <Toggle
                        checked={track.overrideValue}
                        onChange={val => dispatch({
                          type: 'UPDATE_TRACK',
                          payload: { index, track: { overrideValue: val } }
                        })}
                        label="Override Value Split"
                        labelSuffix={<InfoIcon text={FIELD_INFO.overrideValue} />}
                      />
                    </div>
                    )}
                  </div>
                  )}

                  {/* Track-specific Persons */}
                  {track.overridePersons && !collapsedTracks[track.id] && (
                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                      <h5 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Track Credits / Persons</h5>
                      <div className="repeatable-list">
                        {track.persons.map((person, personIndex) => (
                          <div key={personIndex} className="repeatable-item">
                            <div className="repeatable-item-content">
                              <div className="form-grid">
                                <div className="form-group">
                                  <label className="form-label">Name<InfoIcon text={FIELD_INFO.personName} /></label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Person name"
                                    value={person.name || ''}
                                    onChange={e => dispatch({
                                      type: 'UPDATE_TRACK_PERSON',
                                      payload: { trackIndex: index, personIndex, person: { ...person, name: e.target.value } }
                                    })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Website<InfoIcon text={FIELD_INFO.personHref} /></label>
                                  <input
                                    type="url"
                                    className="form-input"
                                    placeholder="https://..."
                                    value={person.href || ''}
                                    onChange={e => dispatch({
                                      type: 'UPDATE_TRACK_PERSON',
                                      payload: { trackIndex: index, personIndex, person: { ...person, href: e.target.value } }
                                    })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Photo URL<InfoIcon text={FIELD_INFO.personImg} /></label>
                                  <input
                                    type="url"
                                    className="form-input"
                                    placeholder="https://..."
                                    value={person.img || ''}
                                    onChange={e => dispatch({
                                      type: 'UPDATE_TRACK_PERSON',
                                      payload: { trackIndex: index, personIndex, person: { ...person, img: e.target.value } }
                                    })}
                                  />
                                  <BlossomFileUpload accept="image/*" onUploaded={({ url }) => dispatch({ type: 'UPDATE_TRACK_PERSON', payload: { trackIndex: index, personIndex, person: { ...person, img: url } } })} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Nostr npub<InfoIcon text={FIELD_INFO.personNpub} /></label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    placeholder="npub1..."
                                    value={person.npub || ''}
                                    onChange={e => dispatch({
                                      type: 'UPDATE_TRACK_PERSON',
                                      payload: { trackIndex: index, personIndex, person: { ...person, npub: e.target.value } }
                                    })}
                                  />
                                </div>
                              </div>

                              {/* Roles */}
                              <div style={{ marginTop: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                  <label className="form-label" style={{ margin: 0 }}>Roles<InfoIcon text={FIELD_INFO.personRole} /></label>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                                  {person.roles.map((role, roleIndex) => (
                                    <div key={roleIndex} style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      background: 'var(--bg-tertiary)',
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      fontSize: '14px'
                                    }}>
                                      <select
                                        className="form-select"
                                        style={{ minWidth: '180px', padding: '8px 12px', fontSize: '14px' }}
                                        value={role.group}
                                        onChange={e => {
                                          const newGroup = e.target.value as PersonGroup;
                                          const newRole = PERSON_ROLES[newGroup]?.[0]?.value || 'band';
                                          dispatch({
                                            type: 'UPDATE_TRACK_PERSON_ROLE',
                                            payload: { trackIndex: index, personIndex, roleIndex, role: { group: newGroup, role: newRole } }
                                          });
                                        }}
                                      >
                                        {PERSON_GROUPS.map(g => (
                                          <option key={g.value} value={g.value}>{g.label}</option>
                                        ))}
                                      </select>
                                      <select
                                        className="form-select"
                                        style={{ minWidth: '200px', padding: '8px 12px', fontSize: '14px' }}
                                        value={role.role}
                                        onChange={e => dispatch({
                                          type: 'UPDATE_TRACK_PERSON_ROLE',
                                          payload: { trackIndex: index, personIndex, roleIndex, role: { ...role, role: e.target.value } }
                                        })}
                                      >
                                        {(PERSON_ROLES[role.group] || PERSON_ROLES.music).map(r => (
                                          <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                      </select>
                                      {person.roles.length > 1 && (
                                        <button
                                          className="btn btn-icon btn-danger"
                                          style={{ padding: '6px 10px', fontSize: '14px', minWidth: 'auto' }}
                                          onClick={() => dispatch({
                                            type: 'REMOVE_TRACK_PERSON_ROLE',
                                            payload: { trackIndex: index, personIndex, roleIndex }
                                          })}
                                          title="Remove role"
                                        >
                                          &#10005;
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <button
                                  className="btn btn-secondary"
                                  style={{ fontSize: '12px', padding: '4px 12px' }}
                                  onClick={() => dispatch({
                                    type: 'ADD_TRACK_PERSON_ROLE',
                                    payload: { trackIndex: index, personIndex, role: createEmptyPersonRole() }
                                  })}
                                >
                                  + Add Role
                                </button>
                              </div>
                            </div>
                            <div className="repeatable-item-actions">
                              <button
                                className="btn btn-icon btn-danger"
                                onClick={() => dispatch({ type: 'REMOVE_TRACK_PERSON', payload: { trackIndex: index, personIndex } })}
                              >
                                &#10005;
                              </button>
                            </div>
                          </div>
                        ))}
                        <button className="add-item-btn" onClick={() => dispatch({ type: 'ADD_TRACK_PERSON', payload: { trackIndex: index } })}>
                          + Add Person
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Track-specific Value Block */}
                  {isEnabled('lightning') && track.overrideValue && !collapsedTracks[track.id] && (() => {
                    const trackRecipients = track.value?.recipients || [];
                    const trackUserRecipients = trackRecipients.filter(r => !isCommunitySupport(r));
                    const trackPlatformRecipients = trackRecipients.filter(r => isCommunitySupport(r));
                    const trackHasUserWithAddress = hasUserRecipients(trackRecipients);
                    return (
                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                      <h5 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Track Value Recipients</h5>
                      <div className="repeatable-list">
                        {trackUserRecipients.map((recipient) => {
                          const rIndex = trackRecipients.indexOf(recipient);
                          return (
                          <div key={rIndex} className="repeatable-item">
                            <div className="repeatable-item-content">
                              <div className="form-grid">
                                <div className="form-group">
                                  <label className="form-label">Name<InfoIcon text={FIELD_INFO.recipientName} /></label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Recipient name"
                                    value={recipient.name || ''}
                                    onChange={e => {
                                      const newRecipients = [...trackRecipients];
                                      newRecipients[rIndex] = { ...recipient, name: e.target.value };
                                      dispatch({
                                        type: 'UPDATE_TRACK',
                                        payload: { index, track: { value: { type: 'lightning', method: 'keysend', recipients: newRecipients } } }
                                      });
                                    }}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Address<InfoIcon text={FIELD_INFO.recipientAddress} /></label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Node pubkey or LN address"
                                    value={recipient.address || ''}
                                    onChange={e => {
                                      const address = e.target.value;
                                      const detectedType = detectAddressType(address);
                                      const newRecipients = [...trackRecipients];
                                      newRecipients[rIndex] = { ...recipient, address, type: detectedType };
                                      dispatch({
                                        type: 'UPDATE_TRACK',
                                        payload: { index, track: { value: { type: 'lightning', method: 'keysend', recipients: newRecipients } } }
                                      });
                                    }}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Split %<InfoIcon text={FIELD_INFO.recipientSplit} /></label>
                                  <input
                                    type="number"
                                    className="form-input"
                                    placeholder="50"
                                    min="0"
                                    max="100"
                                    value={recipient.split ?? 0}
                                    onChange={e => {
                                      const newRecipients = [...trackRecipients];
                                      newRecipients[rIndex] = { ...recipient, split: parseInt(e.target.value) || 0 };
                                      dispatch({
                                        type: 'UPDATE_TRACK',
                                        payload: { index, track: { value: { type: 'lightning', method: 'keysend', recipients: newRecipients } } }
                                      });
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="repeatable-item-actions">
                              <button
                                className="btn btn-icon btn-danger"
                                onClick={() => {
                                  const newRecipients = [...trackRecipients];
                                  newRecipients.splice(rIndex, 1);
                                  dispatch({
                                    type: 'UPDATE_TRACK',
                                    payload: { index, track: { value: { type: 'lightning', method: 'keysend', recipients: newRecipients } } }
                                  });
                                }}
                              >
                                &#10005;
                              </button>
                            </div>
                          </div>
                          );
                        })}
                        <AddRecipientSelect onAdd={recipient => {
                          const newRecipients = [...trackRecipients, recipient];
                          dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { value: { type: 'lightning', method: 'keysend', recipients: newRecipients } } } });
                        }} />
                        {trackPlatformRecipients.length === 0 && trackHasUserWithAddress && (
                          <div style={{
                            borderTop: '1px solid var(--border-color)',
                            marginTop: '16px',
                            paddingTop: '16px',
                            textAlign: 'center'
                          }}>
                            <div style={{
                              fontSize: '13px',
                              color: 'var(--text-secondary)',
                              marginBottom: '8px',
                              lineHeight: 1.4
                            }}>
                              Support the Podcasting 2.0 ecosystem? Add small splits for MSP 2.0 and Podcast Index.
                            </div>
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: '13px' }}
                              onClick={() => {
                                const newRecipients = [...trackRecipients, ...createSupportRecipients()];
                                dispatch({ type: 'UPDATE_TRACK', payload: { index, track: { value: { type: 'lightning', method: 'keysend', recipients: newRecipients } } } });
                              }}
                            >
                              Add Community Support
                            </button>
                          </div>
                        )}
                        {trackPlatformRecipients.length > 0 && (
                          <div style={{
                            borderTop: '1px solid var(--border-color)',
                            marginTop: '16px',
                            paddingTop: '16px',
                            opacity: 0.8
                          }}>
                            <div style={{
                              fontSize: '12px',
                              color: 'var(--text-secondary)',
                              marginBottom: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              Community Support <span style={{ textTransform: 'none', opacity: 0.7 }}>(optional)</span>
                            </div>
                            <div style={{
                              fontSize: '13px',
                              color: 'var(--text-secondary)',
                              marginBottom: '12px',
                              lineHeight: 1.4
                            }}>
                              Help sustain the Podcasting 2.0 ecosystem. These splits support MSP 2.0 and Podcast Index. Click the red X to remove.
                            </div>
                            {trackPlatformRecipients.map((recipient) => {
                              const rIndex = trackRecipients.indexOf(recipient);
                              return (
                              <div key={rIndex} className="repeatable-item">
                                <div className="repeatable-item-content">
                                  <div className="form-grid">
                                    <div className="form-group">
                                      <label className="form-label">Name</label>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={recipient.name || ''}
                                        readOnly
                                        style={{ opacity: 0.7, cursor: 'default' }}
                                      />
                                    </div>
                                    <div className="form-group">
                                      <label className="form-label">Address</label>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={recipient.address || ''}
                                        readOnly
                                        style={{ opacity: 0.7, cursor: 'default' }}
                                      />
                                    </div>
                                    <div className="form-group">
                                      <label className="form-label">Split %<InfoIcon text={FIELD_INFO.recipientSplit} /></label>
                                      <input
                                        type="number"
                                        className="form-input"
                                        placeholder="0"
                                        min="0"
                                        max="100"
                                        value={recipient.split || ''}
                                        onChange={e => {
                                          const newRecipients = [...trackRecipients];
                                          newRecipients[rIndex] = { ...recipient, split: parseInt(e.target.value) || 0 };
                                          dispatch({
                                            type: 'UPDATE_TRACK',
                                            payload: { index, track: { value: { type: 'lightning', method: 'keysend', recipients: newRecipients } } }
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="repeatable-item-actions">
                                  <button
                                    className="btn btn-icon btn-danger"
                                    onClick={() => {
                                      const newRecipients = [...trackRecipients];
                                      newRecipients.splice(rIndex, 1);
                                      dispatch({
                                        type: 'UPDATE_TRACK',
                                        payload: { index, track: { value: { type: 'lightning', method: 'keysend', recipients: newRecipients } } }
                                      });
                                    }}
                                  >
                                    &#10005;
                                  </button>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              ))}
              <button className="add-item-btn" onClick={() => {
                dispatch({ type: 'ADD_TRACK', payload: createEmptyTrack(album.tracks.length + 1, isVideo ? 'video/mp4' : 'audio/mpeg') });
              }}>
                + Add {isVideo ? 'Video' : 'Track'}
              </button>
            </div>
          </Section>
      </EditorChrome>
    </>
  );
}
