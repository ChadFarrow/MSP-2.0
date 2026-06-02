import { useState, useEffect, useCallback } from 'react';
import { useFeed } from '../../store/feedStore';
import { useNostr } from '../../store/nostrStore';
import { useFeaturePrefs } from '../../store/featurePrefsStore';
import { createEmptyPersonRole } from '../../types/feed';
import { FIELD_INFO } from '../../data/fieldInfo';
import { getFeedUrlError } from '../../utils/urlValidation';
import { InfoIcon } from '../InfoIcon';
import { Section } from '../Section';
import { EditorChrome } from './EditorChrome';
import { AlbumValueSection } from './AlbumEditor/AlbumValueSection';
import { AlbumFundingSection } from './AlbumEditor/AlbumFundingSection';
import { AlbumArtworkSection } from './AlbumEditor/AlbumArtworkSection';
import { AlbumInfoSection } from './AlbumEditor/AlbumInfoSection';
import { PersonsSection } from './AlbumEditor/PersonsSection';
import { TrackList } from './AlbumEditor/TrackList';

interface EditorProps {
  chromeless?: boolean;
}

export function Editor({ chromeless = false }: EditorProps = {}) {
  const { state, dispatch } = useFeed();
  const { state: nostrState } = useNostr();
  const { isEnabled } = useFeaturePrefs();
  // Get the active album based on feedType (album or videoFeed)
  const album = state.feedType === 'video' && state.videoFeed ? state.videoFeed : state.album;

  const [publisherLookup, setPublisherLookup] = useState<{
    loading: boolean;
    error: string | null;
    feedTitle: string | null;
    feedImage: string | null;
  }>({ loading: false, error: null, feedTitle: null, feedImage: null });

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
          <TrackList album={album} dispatch={dispatch} isEnabled={isEnabled} />
      </EditorChrome>
    </>
  );
}
