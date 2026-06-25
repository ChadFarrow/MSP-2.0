// MSP 2.0 - Music Side Project Studio
import { useState, useEffect, useRef } from 'react';
import { FeedProvider, useFeed } from './store/feedStore.tsx';
import type { FeedType } from './store/feedStore.tsx';
import { NostrProvider, useNostr } from './store/nostrStore.tsx';
import { ThemeProvider, useTheme } from './store/themeStore.tsx';
import { ExperimentalProvider, useExperimental } from './store/experimentalStore.tsx';
import { FeaturePrefsProvider } from './store/featurePrefsStore.tsx';
import { parseRssFeed, isPublisherFeed, isVideoFeed, parsePublisherRssFeed } from './utils/xmlParser';
import { createEmptyAlbum, createEmptyPublisherFeed, createEmptyVideoAlbum } from './types/feed';
import { pendingHostedStorage, onboardingStorage, wizardStorage } from './utils/storage';
import { generateTestAlbum, generateLinkedTestArtistFeeds } from './utils/testData';
import { buildArtistSetupActions } from './utils/artistSetup';
import { NostrLoginButton } from './components/NostrLoginButton';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import { ImportModal } from './components/modals/ImportModal';
import { SaveModal } from './components/modals/SaveModal';
import { PreviewModal } from './components/modals/PreviewModal';
import { PodpingModal } from './components/modals/PodpingModal';
import { InfoModal } from './components/modals/InfoModal';
import { NostrConnectModal } from './components/modals/NostrConnectModal';
import { ManagedKeyModal } from './components/modals/ManagedKeyModal';
import { NewFeedChoiceModal } from './components/modals/NewFeedChoiceModal';
import { OnboardingPage } from './components/OnboardingPage';
import { Editor } from './components/Editor/Editor';
import { PublisherEditor } from './components/Editor/PublisherEditor';
import { ArtistEditor } from './components/Editor/ArtistEditor';
import { ArtistProfile } from './components/Profile/ArtistProfile';
import { AdminPage } from './components/admin/AdminPage';
import { useMyHostedFeeds } from './utils/useMyHostedFeeds';
import { buildHostedUrl, buildHostedInfoForEdit, saveHostedFeedInfo } from './utils/hostedFeed';
import type { Album } from './types/feed';
import mspLogo from './assets/msp-logo.png';
import './App.css';

// Main App Content (needs access to context)
function AppContent() {
  const { state, dispatch } = useFeed();
  const { theme, toggleTheme } = useTheme();
  const { showExperimental, toggleExperimental } = useExperimental();
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPodpingModal, setShowPodpingModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showNostrConnectModal, setShowNostrConnectModal] = useState(false);
  // True when the Sign In modal was opened from the returning-artist gate, so its
  // copy welcomes them back rather than describing first-time setup.
  const [nostrConnectReturning, setNostrConnectReturning] = useState(false);
  const [showManagedKeyModal, setShowManagedKeyModal] = useState(false);
  const [showNewFeedChoiceModal, setShowNewFeedChoiceModal] = useState(false);
  const [pendingNewFeedType, setPendingNewFeedType] = useState<FeedType>('album');
  const [isTemplateMode, setIsTemplateMode] = useState(false);
  // Show onboarding (starting at the "have you used this before?" gate) on first visit.
  // Testing aid: load `?onboarding=1` ONCE to arm — from then on every load
  // (including plain hard refreshes with no query param, new tabs, and restarts)
  // shows the gate regardless of saved completion, so the onboarding flow can be
  // re-tested without clearing localStorage. The flag persists in localStorage
  // until you disarm it with `?onboarding=0`. No-op in normal use.
  const forceOnboarding = (() => {
    const FLAG = 'msp:force-onboarding';
    const v = new URLSearchParams(window.location.search).get('onboarding');
    if (v !== null) {
      if (v === '0') { localStorage.removeItem(FLAG); return false; }
      localStorage.setItem(FLAG, '1');
      return true;
    }
    return localStorage.getItem(FLAG) === '1';
  })();

  // A returning user — onboarding marked complete, or the dead-simple wizard already
  // finished — skips the gate.
  const [showOnboarding, setShowOnboarding] = useState(
    () => forceOnboarding || (!onboardingStorage.isComplete() && !wizardStorage.isComplete())
  );
  // Whether the onboarding overlay opens at the "have you used this before?" gate.
  // Only relevant on first visit / forced testing — the menu entry that re-opened it
  // mid-step was removed, so this is now a one-shot derived value.
  const onboardingStartAtGate = forceOnboarding || (!onboardingStorage.isComplete() && !wizardStorage.isComplete());
  // The dead-simple artist wizard (#67) — opened from the onboarding gate's
  // first-time branch and from the "New Artist (Guided)" choice in NewFeedChoiceModal.
  // Initialized from the in-progress flag so the Google OAuth full-page redirect
  // (which unmounts the SPA) re-opens the wizard at its saved step on return.
  const [showArtistWizard, setShowArtistWizard] = useState(() => wizardStorage.isInProgress());
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { state: nostrState, logout: nostrLogout } = useNostr();

  // Returning-artist home. `view === 'profile'` swaps the editor body for the
  // Artist Profile page. The hosted-feeds state is lifted here so the one-shot
  // auto-route lookup and the profile page share a single fetch.
  const [view, setView] = useState<'profile' | 'editor'>('editor');
  const [profileDecided, setProfileDecided] = useState(false);
  const myFeeds = useMyHostedFeeds();
  const { refetch: refetchMyFeeds } = myFeeds;

  // Auto-route a logged-in owner of ≥1 hosted feed to their profile on load.
  // Runs once per session (profileDecided). Bails while the onboarding gate /
  // wizard own the screen, or while the Nostr session is still restoring.
  useEffect(() => {
    if (profileDecided) return;
    if (showOnboarding || showArtistWizard || forceOnboarding) return;
    if (nostrState.isLoading) return;
    if (!nostrState.isLoggedIn || !nostrState.user?.pubkey) return;

    let cancelled = false;
    setProfileDecided(true);
    refetchMyFeeds().then(feeds => {
      if (!cancelled && feeds.length >= 1) setView('profile');
    });
    return () => { cancelled = true; };
    // forceOnboarding is derived once per render and stable enough for this gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileDecided, showOnboarding, showArtistWizard, nostrState.isLoading, nostrState.isLoggedIn, nostrState.user?.pubkey, refetchMyFeeds]);

  const handleOnboardingClose = () => {
    onboardingStorage.markComplete();
    setShowOnboarding(false);
  };

  // Open an already-hosted feed for editing from the profile. Persists hosted
  // credentials (keyed by podcastGuid === feedId) so the next Save does a PUT
  // (update) rather than a POST that would 409. See buildHostedInfoForEdit.
  const handleEditHostedFeed = async (feedId: string) => {
    try {
      const res = await fetch(`/api/hosted/${feedId}.xml`);
      if (!res.ok) throw new Error('Could not load feed');
      const xml = await res.text();
      handleImport(xml, buildHostedUrl(feedId));
      if (nostrState.user?.pubkey) {
        saveHostedFeedInfo(feedId, buildHostedInfoForEdit(feedId, nostrState.user.pubkey));
      }
      setView('editor');
    } catch (err) {
      alert('Failed to open feed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // Start a fresh album attached to the artist's existing publisher. Passing only
  // the publisher (not the full state) makes buildArtistSetupActions mint a NEW
  // album GUID and link it — preserving the one-publisher-per-npub constraint.
  // If no publisher is in local state (e.g. new device / cleared storage), load the
  // artist's existing hosted publisher first so we never mint a SECOND publisher.
  const handleAddAlbumToProfile = async () => {
    // Starting a new album replaces the current working album in the editor. Only
    // warn when there are unsaved local edits to lose (hosted feeds are untouched).
    if (state.isDirty && !confirm('Start a new album? Unsaved changes to the album currently open in the editor will be discarded.')) {
      return;
    }
    let publisherFeed = state.publisherFeed;
    if (!publisherFeed) {
      const hostedPublisher = myFeeds.feeds.find(f => f.medium === 'publisher');
      if (hostedPublisher) {
        try {
          const res = await fetch(`/api/hosted/${hostedPublisher.feedId}.xml`);
          if (res.ok) {
            publisherFeed = parsePublisherRssFeed(await res.text());
            // Load it into state and keep its hosted creds so a later Save PUTs.
            dispatch({ type: 'SET_PUBLISHER_FEED', payload: publisherFeed });
            if (nostrState.user?.pubkey) {
              saveHostedFeedInfo(hostedPublisher.feedId, buildHostedInfoForEdit(hostedPublisher.feedId, nostrState.user.pubkey));
            }
          }
        } catch {
          // Fall through — buildArtistSetupActions will create a blank publisher.
        }
      }
    }
    pendingHostedStorage.clear();
    buildArtistSetupActions({ publisherFeed }, { regenerateGuids: false }).forEach(dispatch);
    setView('editor');
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleImport = (xml: string, sourceUrl?: string) => {
    try {
      // Check if this is a publisher feed
      if (isPublisherFeed(xml)) {
        const publisherFeed = parsePublisherRssFeed(xml);
        // Attach source URL if provided (for auto-populating Publisher Feed URL field)
        if (sourceUrl) {
          publisherFeed.sourceUrl = sourceUrl;
        }
        dispatch({ type: 'SET_PUBLISHER_FEED', payload: publisherFeed });
        return;
      }

      // Check if this is a video feed
      if (isVideoFeed(xml)) {
        const videoFeed = parseRssFeed(xml);
        dispatch({ type: 'SET_VIDEO_FEED', payload: videoFeed });
        return;
      }

      // Parse as regular album feed
      const album = parseRssFeed(xml);

      // Warn if not a music feed
      if (album.medium !== 'music') {
        const mediumMsg = album.medium
          ? `This feed has medium "${album.medium}" which is not a music feed.`
          : `This feed has no medium tag specified.`;
        const proceed = confirm(
          `${mediumMsg} MSP 2.0 is designed for music feeds. Continue anyway?`
        );
        if (!proceed) return;
        album.medium = 'music';
      }

      dispatch({ type: 'SET_ALBUM', payload: album });
    } catch (err) {
      alert('Failed to parse feed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleLoadAlbum = (album: Album) => {
    // Clear stale hosted credentials - Nostr/music imports don't use pending hosted storage
    pendingHostedStorage.clear();
    dispatch({ type: 'SET_ALBUM', payload: album });
  };

  const handleNew = (feedType: FeedType = 'album') => {
    setPendingNewFeedType(feedType);
    setShowNewFeedChoiceModal(true);
  };

  const handleStartBlank = () => {
    // Clear any stale hosted import credentials so they don't
    // accidentally overwrite a previously imported feed's content
    pendingHostedStorage.clear();
    if (pendingNewFeedType === 'publisher') {
      dispatch({ type: 'SET_PUBLISHER_FEED', payload: createEmptyPublisherFeed() });
    } else if (pendingNewFeedType === 'video') {
      dispatch({ type: 'SET_VIDEO_FEED', payload: createEmptyVideoAlbum() });
    } else if (pendingNewFeedType === 'artist') {
      buildArtistSetupActions({}, { regenerateGuids: true }).forEach(dispatch);
    } else {
      dispatch({ type: 'SET_ALBUM', payload: createEmptyAlbum() });
    }
    setShowNewFeedChoiceModal(false);
  };

  const handleArtistSetup = () => {
    handleSwitchFeedType('artist');
    setShowNewFeedChoiceModal(false);
  };

  const handleUseTemplate = () => {
    setShowNewFeedChoiceModal(false);
    setIsTemplateMode(true);
    setShowImportModal(true);
  };

  const handleTemplateImport = (xml: string) => {
    // Import without sourceUrl so hosted link isn't set
    handleImport(xml);
    // After import, regenerate the GUID and clear hosted credentials
    const newGuid = crypto.randomUUID();
    if (isPublisherFeed(xml)) {
      dispatch({ type: 'UPDATE_PUBLISHER_FEED', payload: { podcastGuid: newGuid } });
    } else if (isVideoFeed(xml)) {
      dispatch({ type: 'UPDATE_VIDEO_FEED', payload: { podcastGuid: newGuid } });
    } else {
      dispatch({ type: 'UPDATE_ALBUM', payload: { podcastGuid: newGuid } });
    }
    pendingHostedStorage.clear();
  };

  const handleTemplateLoadAlbum = (album: Album) => {
    pendingHostedStorage.clear();
    dispatch({ type: 'SET_ALBUM', payload: { ...album, podcastGuid: crypto.randomUUID() } });
  };

  const handleSwitchFeedType = (feedType: FeedType) => {
    if (feedType === 'artist') {
      buildArtistSetupActions(state).forEach(dispatch);
      return;
    }

    dispatch({ type: 'SET_FEED_TYPE', payload: feedType });
    if (feedType === 'video' && !state.videoFeed) {
      dispatch({ type: 'CREATE_NEW_VIDEO_FEED' });
    }
    if (feedType === 'publisher' && !state.publisherFeed) {
      dispatch({ type: 'CREATE_NEW_PUBLISHER_FEED' });
    }
  };

  if (showOnboarding) {
    return (
      <OnboardingPage
        startAtGate={onboardingStartAtGate}
        onClose={handleOnboardingClose}
        onChooseReturning={() => {
          // Returning artist: close the gate and land in the editor. Sign-in is
          // OFFERED via the header (not forced) so a self-host returner isn't walled.
          // If a session restores (or they sign in) and owns >=1 hosted feed, the
          // auto-route effect moves them to their Profile.
          onboardingStorage.markComplete();
          setShowOnboarding(false);
        }}
        onChooseSelfHost={() => {
          // Self-host: no account, no wizard — straight to the editor. They make the
          // feed, download the XML, and host it themselves. Nostr/Lightning stay
          // optional. Force plain album mode (not artist mode, which scaffolds
          // publisher/V4V setup via buildArtistSetupActions) so self-host stays minimal.
          onboardingStorage.markComplete();
          setShowOnboarding(false);
          dispatch({ type: 'SET_FEED_TYPE', payload: 'album' });
        }}
        onChooseMspHost={() => {
          // MSP-host: the guided wizard (account via Google/Nostr), ends with a
          // hosted feed. Mark the gate complete, enter Artist mode, open the wizard.
          onboardingStorage.markComplete();
          setShowOnboarding(false);
          handleSwitchFeedType('artist');
          wizardStorage.markInProgress();
          setShowArtistWizard(true);
        }}
      />
    );
  }

  return (
    <>
      <div className="app">
        <header className="header">
          <div className="header-left">
            <div className="header-title">
              <img src={mspLogo} alt="MSP Logo" className="header-logo" />
              <h1><span className="title-short">MSP 2.0</span><span className="title-full"> - Music Side Project Studio</span></h1>
            </div>
            {/* Feed Type Dropdown */}
            <select
              className="feed-type-select"
              value={state.feedType}
              onChange={(e) => handleSwitchFeedType(e.target.value as FeedType)}
            >
              <option value="album">Album</option>
              <option value="video">Video</option>
              <option value="publisher">Publisher</option>
              <option value="artist">New Artist</option>
            </select>
          </div>
          <div className="header-actions">
            <NostrLoginButton />
            <div className="header-dropdown" ref={dropdownRef}>
              <button
                className="btn btn-secondary btn-small dropdown-trigger"
                onClick={() => setShowDropdown(!showDropdown)}
                aria-expanded={showDropdown}
                aria-label="Menu"
              >
                ☰
              </button>
              {showDropdown && (
                <div className="dropdown-menu">
                  {nostrState.isLoggedIn && (
                    <button
                      className="dropdown-item"
                      onClick={() => { setView('profile'); setShowDropdown(false); }}
                    >
                      👤 My Profile
                    </button>
                  )}
                  <button
                    className="dropdown-item"
                    onClick={() => { setShowInfoModal(true); setShowDropdown(false); }}
                  >
                    ℹ️ Info
                  </button>
                  <a
                    className="dropdown-item"
                    href="https://podtards.com/bae35f5f42e952ff9e3f9fa0fc4c6c0de179cce6a6e08dd1f4cc19d9b2120dfe.mp4"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowDropdown(false)}
                  >
                    🎬 Overview Video
                  </a>
                  <a
                    className="dropdown-item"
                    href="https://podtards.com/579676ff386928d3eb1275ead3d11be25200707dccc20f40ad95c3192f5faf0c.mp4"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowDropdown(false)}
                  >
                    🎬 Publisher Overview
                  </a>
                  <button
                    className="dropdown-item"
                    onClick={() => { toggleTheme(); setShowDropdown(false); }}
                  >
                    {theme === 'dark' ? '☀️' : '🌙'} Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { toggleExperimental(); setShowDropdown(false); }}
                  >
                    🧪 {showExperimental ? 'Hide' : 'Show'} Experimental Features
                  </button>
                  <div className="dropdown-divider" />
                  {nostrState.isLoggedIn ? (
                    <>
                      <button
                        className="dropdown-item"
                        onClick={() => { nostrLogout(); setShowDropdown(false); }}
                      >
                        🚪 Sign Out{nostrState.connectionMethod !== 'managed' ? ' (nostr)' : ''}
                      </button>
                      {nostrState.connectionMethod === 'managed' && (
                        <button
                          className="dropdown-item"
                          onClick={() => { setShowManagedKeyModal(true); setShowDropdown(false); }}
                        >
                          🔑 My Nostr Keys
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      className="dropdown-item"
                      onClick={() => { setNostrConnectReturning(false); setShowNostrConnectModal(true); setShowDropdown(false); }}
                    >
                      🔑 Sign In
                    </button>
                  )}
                  {showExperimental && (
                    <>
                      <div className="dropdown-divider" />
                      <button
                        className="dropdown-item"
                        onClick={() => {
                          if (state.feedType === 'artist') {
                            const { album, publisher } = generateLinkedTestArtistFeeds();
                            dispatch({ type: 'SET_PUBLISHER_FEED', payload: publisher });
                            dispatch({ type: 'SET_ALBUM', payload: album });
                            // SET_ALBUM resets feedType to 'album'; restore artist mode last
                            dispatch({ type: 'SET_FEED_TYPE', payload: 'artist' });
                          } else {
                            dispatch({ type: 'SET_ALBUM', payload: generateTestAlbum() });
                          }
                          setShowDropdown(false);
                        }}
                      >
                        🧪 Load Test Data
                      </button>
                      <div className="dropdown-divider" />
                      <a
                        className="dropdown-item"
                        href="https://msp-2-0-git-fafo-chadfs-projects.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowDropdown(false)}
                      >
                        🧪 Experimental (FAFO)
                      </a>
                    </>
                  )}
                  <div className="dropdown-divider" />
                  <div className="dropdown-version">v{__APP_VERSION__}</div>
                </div>
              )}
            </div>
          </div>
        </header>
        {view === 'profile' ? (
          <ArtistProfile
            feedsState={myFeeds}
            fallbackName={state.publisherFeed?.title}
            onEditFeed={handleEditHostedFeed}
            onAddAlbum={handleAddAlbumToProfile}
            onOpenEditor={() => setView('editor')}
          />
        ) : state.feedType === 'publisher' ? <PublisherEditor />
          : state.feedType === 'artist' ? <ArtistEditor />
          : <Editor key={`${state.feedType}-${state.album?.podcastGuid}-${state.videoFeed?.podcastGuid}`} />}
        <div className="bottom-toolbar">
          <button
            className="bottom-toolbar-btn"
            onClick={() => handleNew(state.feedType)}
            title={`New ${state.feedType === 'publisher' ? 'Publisher' : state.feedType === 'video' ? 'Video Feed' : state.feedType === 'artist' ? 'Artist' : 'Album'}`}
          >
            <span className="bottom-toolbar-icon">📂</span>
            <span className="bottom-toolbar-label">New</span>
          </button>
          <button
            className="bottom-toolbar-btn"
            onClick={() => setShowImportModal(true)}
            title="Import"
          >
            <span className="bottom-toolbar-icon">📥</span>
            <span className="bottom-toolbar-label">Import</span>
          </button>
          <button
            className="bottom-toolbar-btn"
            onClick={() => setShowSaveModal(true)}
            title="Save"
          >
            <span className="bottom-toolbar-icon">💾</span>
            <span className="bottom-toolbar-label">Save</span>
          </button>
          <button
            className="bottom-toolbar-btn"
            onClick={() => setShowPodpingModal(true)}
            title="Send Podping"
          >
            <span className="bottom-toolbar-icon">📡</span>
            <span className="bottom-toolbar-label">Podping</span>
          </button>
          <button
            className="bottom-toolbar-btn"
            onClick={() => setShowPreviewModal(true)}
            title="View Feed"
          >
            <span className="bottom-toolbar-icon">👁️</span>
            <span className="bottom-toolbar-label">View Feed</span>
          </button>
        </div>
      </div>

      {showImportModal && (
        <ImportModal
          onClose={() => { setShowImportModal(false); setIsTemplateMode(false); }}
          onImport={isTemplateMode ? handleTemplateImport : handleImport}
          onLoadAlbum={isTemplateMode ? handleTemplateLoadAlbum : handleLoadAlbum}
          isLoggedIn={nostrState.isLoggedIn}
          templateMode={isTemplateMode}
        />
      )}

      {showSaveModal && (
        <SaveModal
          onClose={() => setShowSaveModal(false)}
          album={state.feedType === 'video' && state.videoFeed ? state.videoFeed : state.album}
          publisherFeed={state.publisherFeed}
          feedType={state.feedType}
          isDirty={state.isDirty}
          isLoggedIn={nostrState.isLoggedIn}
          onImport={handleImport}
        />
      )}

      {showPreviewModal && (
        <PreviewModal
          onClose={() => setShowPreviewModal(false)}
          album={state.feedType === 'video' && state.videoFeed ? state.videoFeed : state.album}
          publisherFeed={state.publisherFeed}
          feedType={state.feedType}
        />
      )}

      {showPodpingModal && (
        <PodpingModal
          onClose={() => setShowPodpingModal(false)}
          feedGuid={
            state.feedType === 'publisher' && state.publisherFeed
              ? state.publisherFeed.podcastGuid
              : state.feedType === 'video' && state.videoFeed
                ? state.videoFeed.podcastGuid
                : state.album.podcastGuid
          }
          medium={
            state.feedType === 'publisher' && state.publisherFeed
              ? state.publisherFeed.medium
              : state.feedType === 'video' && state.videoFeed
                ? state.videoFeed.medium
                : state.album.medium
          }
        />
      )}

      {showInfoModal && (
        <InfoModal onClose={() => setShowInfoModal(false)} />
      )}


      {showNostrConnectModal && (
        <NostrConnectModal
          returning={nostrConnectReturning}
          onClose={() => { setShowNostrConnectModal(false); setNostrConnectReturning(false); }}
        />
      )}
      {showManagedKeyModal && (
        <ManagedKeyModal onClose={() => setShowManagedKeyModal(false)} />
      )}

      <NewFeedChoiceModal
        isOpen={showNewFeedChoiceModal}
        feedType={pendingNewFeedType}
        onStartBlank={handleStartBlank}
        onUseTemplate={handleUseTemplate}
        onArtistSetup={pendingNewFeedType === 'album' ? handleArtistSetup : undefined}
        onCancel={() => setShowNewFeedChoiceModal(false)}
        onNewArtist={() => {
          setShowNewFeedChoiceModal(false);
          wizardStorage.markInProgress();
          setShowArtistWizard(true);
        }}
      />

      {showArtistWizard && (
        <OnboardingWizard
          onComplete={() => {
            wizardStorage.clearInProgress();
            setShowArtistWizard(false);
          }}
        />
      )}
    </>
  );
}

// Main App
function App() {
  const isAdminRoute = window.location.pathname === '/admin';

  if (isAdminRoute) {
    return (
      <ThemeProvider>
        <ExperimentalProvider>
          <FeaturePrefsProvider>
            <NostrProvider>
              <AdminPage />
            </NostrProvider>
          </FeaturePrefsProvider>
        </ExperimentalProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ExperimentalProvider>
        <FeaturePrefsProvider>
          <NostrProvider>
            <FeedProvider>
              <AppContent />
            </FeedProvider>
          </NostrProvider>
        </FeaturePrefsProvider>
      </ExperimentalProvider>
    </ThemeProvider>
  );
}

export default App;
