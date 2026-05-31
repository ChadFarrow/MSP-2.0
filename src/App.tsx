import { useState, useEffect } from 'react';
import { useFeed } from './store/feedStore';
import { Editor } from './components/Editor/Editor';
import { ArtistEditor } from './components/Editor/ArtistEditor';
import { PublisherEditor } from './components/PublisherEditor/PublisherEditor';
import { Header } from './components/Header';
import { SaveModal } from './components/modals/SaveModal';
import { ImportModal } from './components/modals/ImportModal';
import { NewFeedChoiceModal } from './components/modals/NewFeedChoiceModal';
import { OnboardingPage } from './components/OnboardingPage';
import { ArtistOnboardingWizard } from './components/ArtistOnboardingWizard';
import { onboardingStorage, wizardStorage } from './utils/storage';
import './App.css';

function App() {
  const { state, dispatch } = useFeed();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewChoiceModal, setShowNewChoiceModal] = useState(false);
  // First-visit gate (#64). A returning user (onboarding marked complete, or the
  // dead-simple wizard already finished) skips straight to the editor.
  const [showOnboarding, setShowOnboarding] = useState(
    () => !onboardingStorage.isComplete() && !wizardStorage.isComplete()
  );
  // The dead-simple artist wizard (#67) — opened from the onboarding gate's
  // first-time branch and from the "Artist Setup" choice in NewFeedChoiceModal.
  const [showArtistWizard, setShowArtistWizard] = useState(false);

  useEffect(() => {
    document.title = 'MSP 2.0';
  }, []);

  const handleUseTemplate = () => {
    setShowNewChoiceModal(false);
    setShowImportModal(true);
  };

  const handleNewArtist = () => {
    setShowNewChoiceModal(false);
    setShowArtistWizard(true);
  };

  const handleStartBlank = () => {
    setShowNewChoiceModal(false);
    dispatch({ type: 'NEW_FEED' });
  };

  return (
    <div className="app">
      {showOnboarding && (
        <OnboardingPage
          onComplete={() => {
            onboardingStorage.markComplete();
            setShowOnboarding(false);
          }}
          onChooseFirstTime={() => {
            // First-timers flow through the dead-simple wizard, then land in the
            // ArtistEditor for ongoing edits.
            onboardingStorage.markComplete();
            setShowOnboarding(false);
            dispatch({ type: 'SET_FEED_TYPE', payload: 'artist' });
            setShowArtistWizard(true);
          }}
        />
      )}
      {showArtistWizard && (
        <ArtistOnboardingWizard
          onClose={() => setShowArtistWizard(false)}
          onComplete={() => {
            wizardStorage.markComplete();
            setShowArtistWizard(false);
            dispatch({ type: 'SET_FEED_TYPE', payload: 'artist' });
          }}
        />
      )}
      <Header
        onSave={() => setShowSaveModal(true)}
        onImport={() => setShowImportModal(true)}
        onNew={() => setShowNewChoiceModal(true)}
      />
      <main className="app-main">
        {state.feedType === 'publisher' ? (
          <PublisherEditor />
        ) : state.feedType === 'artist' ? (
          <ArtistEditor />
        ) : (
          <Editor />
        )}
      </main>
      {showSaveModal && <SaveModal onClose={() => setShowSaveModal(false)} />}
      {showImportModal && <ImportModal onClose={() => setShowImportModal(false)} />}
      {showNewChoiceModal && (
        <NewFeedChoiceModal
          onClose={() => setShowNewChoiceModal(false)}
          onStartBlank={handleStartBlank}
          onUseTemplate={handleUseTemplate}
          onNewArtist={handleNewArtist}
        />
      )}
    </div>
  );
}

export default App;
