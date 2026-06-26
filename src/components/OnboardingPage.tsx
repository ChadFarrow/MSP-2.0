import { useEffect, useRef, useState } from 'react';
import { FeatureQuestionnaire } from './FeatureQuestionnaire';
import mspLogo from '../assets/msp-logo.png';

interface OnboardingPageProps {
  onClose: () => void;
  startAtGate?: boolean;
  /** Fired when a returning user picks "Yes, I've used this before" on the gate. */
  onChooseReturning?: () => void;
  /** Fired from the "Where will your feed live?" screen — self-host goes straight
      to the editor (no account, no wizard); MSP-host launches the guided wizard. */
  onChooseSelfHost?: () => void;
  onChooseMspHost?: () => void;
}

const TOTAL_STEPS = 4;

export function OnboardingPage({ onClose, startAtGate = false, onChooseReturning, onChooseSelfHost, onChooseMspHost }: OnboardingPageProps) {
  // step 0 = "have you used this before?" gate; steps 1-3 = guided tour; step 4 = feature questionnaire
  const [step, setStep] = useState(startAtGate ? 0 : 1);
  // Within the gate (step 0): 'ask' = the "used before?" question; 'hosting' =
  // the "where will your feed live?" follow-up shown after picking "I'm new".
  const [gateView, setGateView] = useState<'ask' | 'hosting'>('ask');
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // On the gate (step 0) the user must pick an option — no Escape dismiss.
      if (e.key === 'Escape' && step !== 0) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, step]);

  // Move focus into the dialog on mount so keyboard users land inside. The close
  // button is absent on the gate (step 0), so fall back to the dialog container.
  useEffect(() => {
    (closeRef.current ?? dialogRef.current)?.focus();
  }, []);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="onboarding-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-page-title"
    >
      <header className="onboarding-page-header">
        <h1 id="onboarding-page-title" className="onboarding-page-title">Getting Started with MSP 2.0</h1>
        {/* No close on the gate (step 0) — the user must pick an option. */}
        {step !== 0 && (
          <button
            type="button"
            ref={closeRef}
            className="onboarding-page-close"
            onClick={onClose}
            aria-label="Close getting started"
          >
            ×
          </button>
        )}
      </header>

      <main className="onboarding-page-content">
        {step === 0 && gateView === 'ask' && (
          <div className="onboarding-step onboarding-gate">
            <div className="onboarding-welcome-icon">👋</div>
            <h2 className="onboarding-heading">Have you used MSP 2.0 before?</h2>
            <p className="onboarding-text">
              First time here? We'll point you the right way.
              <br />
              If you're returning, jump straight into the app.
            </p>
            <div className="onboarding-gate-actions">
              <button
                type="button"
                className="btn btn-secondary onboarding-gate-btn"
                onClick={() => setGateView('hosting')}
              >
                No, I'm new
              </button>
              <button
                type="button"
                className="btn btn-primary onboarding-gate-btn"
                onClick={() => (onChooseReturning ?? onClose)()}
              >
                Yes, I've used this before →
              </button>
            </div>
            <img
              src={mspLogo}
              alt="MSP 2.0"
              className="onboarding-gate-logo"
              style={{ width: 200, height: 200, borderRadius: 24, marginTop: 32 }}
            />
          </div>
        )}

        {step === 0 && gateView === 'hosting' && (
          <div className="onboarding-step onboarding-gate">
            <div className="onboarding-welcome-icon">🎵</div>
            <h2 className="onboarding-heading">Where will your feed live?</h2>
            <p className="onboarding-text">
              Let MSP host your feed and media for you, or make the feed and host it
              on your own website. You can change your mind anytime.
            </p>
            <div className="onboarding-gate-actions">
              <button
                type="button"
                className="btn btn-primary onboarding-gate-btn"
                onClick={() => onChooseMspHost?.()}
              >
                Let MSP host it for me →
              </button>
              <button
                type="button"
                className="btn btn-secondary onboarding-gate-btn"
                onClick={() => onChooseSelfHost?.()}
              >
                I'll host it myself
              </button>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 24 }}
              onClick={() => setGateView('ask')}
            >
              ← Back
            </button>
          </div>
        )}

        {/* DEAD UNTIL RE-WIRED: steps 1-4 (the guided tour + FeatureQuestionnaire) are
            currently unreachable — the gate's only exits set showOnboarding=false and
            unmount this page before any setStep(>=1) runs, and the page always mounts at
            step 0 (startAtGate). Kept intentionally per the Phase 1 plan; slated for a
            follow-up cleanup once Phase 2 confirms they aren't repurposed. */}
        {step === 1 && (
          <div className="onboarding-step">
            <div className="onboarding-welcome-icon">🎵</div>
            <h2 className="onboarding-heading">Welcome to Music Side Project 2.0</h2>
            <p className="onboarding-text">
              MSP 2.0 is an app for creating <strong>Podcasting 2.0 compatible RSS feeds</strong> for
              music albums and video releases. It gives musicians full control over their content
              distribution — no middlemen, no platform lock-in.
            </p>
            <p className="onboarding-text">
              Publish your music with built-in support for <strong>Lightning Network payments</strong>{' '}
              and open podcast app discovery.
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
            <h2 className="onboarding-heading">Choose Your Feed Type</h2>
            <p className="onboarding-text">
              MSP 2.0 supports four types of feeds. You can switch between them at any time using
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
              <div className="onboarding-mode-card">
                <div className="onboarding-mode-icon">🎤</div>
                <div className="onboarding-mode-name">New Artist</div>
                <div className="onboarding-mode-desc">
                  Set up a release and its publisher/label catalog together, with cross-linked
                  GUIDs — the fastest path for a first-time artist.
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step">
            <h2 className="onboarding-heading">The Basic Workflow</h2>
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

        {step === 4 && (
          <div className="onboarding-step">
            <h2 className="onboarding-heading">Customize Your Workspace</h2>
            <p className="onboarding-text">
              MSP 2.0 has some advanced features you may not need yet. Turn off anything you'd
              rather not see — you can switch these back on anytime from the
              <strong> ☰ menu → Feature Preferences</strong>.
            </p>
            <FeatureQuestionnaire />
          </div>
        )}
      </main>

      {step > 0 && (
      <footer className="onboarding-page-footer">
        <span className="onboarding-step-indicator">Step {step} of {TOTAL_STEPS}</span>
        <div style={{ flex: 1 }} />
        {/* Back sits left of the primary button, which stays anchored
            far-right on every step. */}
        {step > 1 && (
          <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>
            ← Back
          </button>
        )}
        {step < TOTAL_STEPS ? (
          <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>
            Next →
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onClose}>
            Get Started
          </button>
        )}
      </footer>
      )}
    </div>
  );
}
