// MSP 2.0 - Music Side Project Studio
import { useState, useEffect, useRef } from 'react';
import { FeedProvider, useFeed } from './store/feedStore.tsx';
import { NostrProvider, useNostr } from './store/nostrStore.tsx';
import { parseRssFeed } from './utils/xmlParser';
import { createEmptyAlbum } from './types/feed';
import { NostrLoginButton } from './components/NostrLoginButton';
import { ImportModal } from './components/modals/ImportModal';
import { SaveModal } from './components/modals/SaveModal';
import { InfoModal } from './components/modals/InfoModal';
import { Editor } from './components/Editor/Editor';
import type { Album } from './types/feed';
import mspLogo from './assets/msp-logo.png';
import './App.css';

// Main App Content (needs access to context)
function AppContent() {
  const { state, dispatch } = useFeed();
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { state: nostrState, login: nostrLogin, logout: nostrLogout } = useNostr();

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

  const handleImport = (xml: string) => {
    try {
      const album = parseRssFeed(xml);

      // Warn if not a music feed
      if (album.medium && album.medium !== 'music' && album.medium !== 'musicL') {
        const proceed = confirm(
          `This feed has medium "${album.medium}" which is not a music feed. ` +
          `MSP 2.0 is designed for music feeds. Continue anyway?`
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
    dispatch({ type: 'SET_ALBUM', payload: album });
  };

  const handleNew = () => {
    if (confirm('Create a new feed? This will clear all current data.')) {
      dispatch({ type: 'SET_ALBUM', payload: createEmptyAlbum() });
    }
  };

  return (
    <>
      <div className="app">
        <header className="header">
          <div className="header-title">
            <img src={mspLogo} alt="MSP Logo" className="header-logo" />
            <h1>MSP 2.0 - Music Side Project Studio</h1>
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
                  <button
                    className="dropdown-item"
                    onClick={() => { handleNew(); setShowDropdown(false); }}
                  >
                    📂 New
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { setShowImportModal(true); setShowDropdown(false); }}
                  >
                    📥 Import
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { setShowSaveModal(true); setShowDropdown(false); }}
                  >
                    💾 Save
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { setShowInfoModal(true); setShowDropdown(false); }}
                  >
                    ℹ️ Info
                  </button>
                  <div className="dropdown-divider" />
                  {nostrState.isLoggedIn ? (
                    <button
                      className="dropdown-item"
                      onClick={() => { nostrLogout(); setShowDropdown(false); }}
                    >
                      🚪 Sign Out (nostr)
                    </button>
                  ) : (
                    <button
                      className="dropdown-item"
                      onClick={() => { nostrLogin(); setShowDropdown(false); }}
                      disabled={!nostrState.hasExtension}
                    >
                      🔑 {nostrState.hasExtension ? 'Sign In (nostr)' : 'No Extension'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <Editor />
      </div>

      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          onLoadAlbum={handleLoadAlbum}
          isLoggedIn={nostrState.isLoggedIn}
        />
      )}

      {showSaveModal && (
        <SaveModal
          onClose={() => setShowSaveModal(false)}
          album={state.album}
          isDirty={state.isDirty}
          isLoggedIn={nostrState.isLoggedIn}
          onImport={handleImport}
        />
      )}

      {showInfoModal && (
        <InfoModal onClose={() => setShowInfoModal(false)} />
      )}
    </>
  );
}

// Main App
function App() {
  return (
    <NostrProvider>
      <FeedProvider>
        <AppContent />
      </FeedProvider>
    </NostrProvider>
  );
}

export default App;
