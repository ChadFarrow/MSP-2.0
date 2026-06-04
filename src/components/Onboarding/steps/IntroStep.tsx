// src/components/Onboarding/steps/IntroStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';

export function IntroStep({ w }: { w: OnboardingDraft }) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-welcome-icon">🎵</div>
      <h2 className="onboarding-heading">Welcome — let's publish your music</h2>
      <p className="onboarding-text">
        MSP 2.0 turns your release into a <strong>Podcasting 2.0 RSS feed</strong> so it
        can be found in podcast apps, accept Lightning payments, and stay fully under
        your control. Here's how it works:
      </p>
      <div className="onboarding-workflow">
        <div className="onboarding-workflow-step">
          <div className="onboarding-workflow-num">1</div>
          <div>
            <div className="onboarding-workflow-label">🔑 Sign in</div>
            <div className="onboarding-workflow-desc">
              Connect your Nostr identity so your feed is tied to you and syncs across devices.
            </div>
          </div>
        </div>
        <div className="onboarding-workflow-step">
          <div className="onboarding-workflow-num">2</div>
          <div>
            <div className="onboarding-workflow-label">✏️ Build your feed</div>
            <div className="onboarding-workflow-desc">
              Add your album details, tracks, artwork, and Lightning payment splits.
            </div>
          </div>
        </div>
        <div className="onboarding-workflow-step">
          <div className="onboarding-workflow-num">3</div>
          <div>
            <div className="onboarding-workflow-label">🚀 Publish</div>
            <div className="onboarding-workflow-desc">
              Host your feed and submit it to Podcast Index so apps can discover your music.
            </div>
          </div>
        </div>
      </div>
      <div className="onboarding-intro-cta">
        <button className="btn btn-primary onboarding-intro-cta-btn" onClick={w.next}>
          Get started →
        </button>
      </div>
    </div>
  );
}
