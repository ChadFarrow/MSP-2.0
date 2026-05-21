import { useState } from 'react';
import { ModalWrapper } from './ModalWrapper';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOTAL_STEPS = 3;

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(1);

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  const footer = (
    <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
      <span className="onboarding-step-indicator">Step {step} of {TOTAL_STEPS}</span>
      <div style={{ flex: 1 }} />
      {step > 1 && (
        <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>
          ← Back
        </button>
      )}
      {step < TOTAL_STEPS ? (
        <>
          <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>
            Next →
          </button>
          {step === 1 && (
            <button className="btn btn-secondary" onClick={handleClose}>
              Skip
            </button>
          )}
        </>
      ) : (
        <button className="btn btn-primary" onClick={handleClose}>
          Get Started
        </button>
      )}
    </div>
  );

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={handleClose}
      title="Getting Started with MSP 2.0"
      className="onboarding-modal"
      footer={footer}
    >
      {step === 1 && (
        <div className="onboarding-step">
          <div className="onboarding-welcome-icon">🎵</div>
          <h3 className="onboarding-heading">Welcome to Music Side Project 2.0</h3>
          <p className="onboarding-text">
            MSP 2.0 is a studio for creating <strong>Podcasting 2.0 compatible RSS feeds</strong> for
            music albums and video releases. It gives musicians full control over their content
            distribution — no middlemen, no platform lock-in.
          </p>
          <p className="onboarding-text">
            Publish your music with built-in support for <strong>Lightning Network payments</strong>,
            open podcast app discovery, and decentralized hosting via Nostr.
          </p>
          <div className="onboarding-highlights">
            <div className="onboarding-highlight-item">
              <span>⚡</span>
              <span>Lightning value splits — pay artists, producers, and collaborators automatically</span>
            </div>
            <div className="onboarding-highlight-item">
              <span>📡</span>
              <span>Submit to Podcast Index so your music appears in Fountain, Castamatic, and more</span>
            </div>
            <div className="onboarding-highlight-item">
              <span>🔒</span>
              <span>Your feed, your server — host on MSP or any URL you control</span>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding-step">
          <h3 className="onboarding-heading">Choose Your Feed Type</h3>
          <p className="onboarding-text">
            MSP 2.0 supports three types of feeds. You can switch between them at any time using
            the dropdown in the header.
          </p>
          <div className="onboarding-mode-cards">
            <div className="onboarding-mode-card">
              <div className="onboarding-mode-icon">🎵</div>
              <div className="onboarding-mode-name">Album</div>
              <div className="onboarding-mode-desc">
                Music releases with individual tracks, per-track Lightning splits, artist credits,
                and full Podcasting 2.0 metadata.
              </div>
            </div>
            <div className="onboarding-mode-card">
              <div className="onboarding-mode-icon">🎬</div>
              <div className="onboarding-mode-name">Video</div>
              <div className="onboarding-mode-desc">
                Video releases using the same structure as Album — swap audio tracks for video
                files.
              </div>
            </div>
            <div className="onboarding-mode-card">
              <div className="onboarding-mode-icon">📚</div>
              <div className="onboarding-mode-name">Publisher</div>
              <div className="onboarding-mode-desc">
                Aggregate multiple album and video feeds into a single publisher catalog —
                great for labels and multi-artist releases.
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onboarding-step">
          <h3 className="onboarding-heading">The Basic Workflow</h3>
          <p className="onboarding-text">
            Everything happens in three steps using the toolbar at the bottom of the screen.
          </p>
          <div className="onboarding-workflow">
            <div className="onboarding-workflow-step">
              <div className="onboarding-workflow-num">1</div>
              <div>
                <div className="onboarding-workflow-label">📂 New or Import</div>
                <div className="onboarding-workflow-desc">
                  Start a blank feed, use a template, or import an existing RSS feed from a URL or file.
                </div>
              </div>
            </div>
            <div className="onboarding-workflow-step">
              <div className="onboarding-workflow-num">2</div>
              <div>
                <div className="onboarding-workflow-label">✏️ Edit</div>
                <div className="onboarding-workflow-desc">
                  Fill in your feed metadata, add tracks, set Lightning payment splits, and credit your collaborators.
                </div>
              </div>
            </div>
            <div className="onboarding-workflow-step">
              <div className="onboarding-workflow-num">3</div>
              <div>
                <div className="onboarding-workflow-label">💾 Save</div>
                <div className="onboarding-workflow-desc">
                  Choose where to save: <strong>Host on MSP</strong> for a permanent URL,
                  <strong> Download XML</strong> for self-hosting, or
                  <strong> Submit to Podcast Index</strong> to register your feed with podcast apps.
                </div>
              </div>
            </div>
          </div>
          <p className="onboarding-tip">
            Tip: you can reopen this guide at any time from the <strong>☰ menu</strong> in the top right.
          </p>
        </div>
      )}
    </ModalWrapper>
  );
}
