// src/components/Onboarding/NewToNostrPanel.tsx
//
// "New to Nostr?" walkthrough. Two views:
//  - steps:   the centered intro + the 5-step Primal setup carousel. Its sixth
//             checklist item, "Connect to MSP", switches to the connect view.
//  - connect: a dedicated page that shows the nostrconnect:// QR (QR-only) for the
//             user to scan with Primal's Remote Login. Set up Primal first, then
//             connect it here.
// Shared by the onboarding wizard (AuthStep) and NostrConnectModal's "New to Nostr" tab.

import { useState } from 'react';
import { NostrLoginPanel } from './NostrLoginPanel';
import { PrimalSignupCarousel } from './PrimalSignupCarousel';

export function NewToNostrPanel() {
  const [view, setView] = useState<'steps' | 'connect'>('steps');

  if (view === 'connect') {
    return (
      <div className="nostr-connect-primal">
        <div className="primal-connect-page">
          <button
            type="button"
            className="btn-link primal-connect-back"
            onClick={() => setView('steps')}
          >
            ← Back to setup steps
          </button>
          <h4 className="primal-connect-title">Connect Primal to MSP</h4>

          <div className="primal-connect-cols">
            <ol className="primal-connect-steps">
              <li>
                <span className="primal-step-badge">1</span>
                <span>Open the <strong>Primal</strong> app on your phone.</span>
              </li>
              <li>
                <span className="primal-step-badge">2</span>
                <span>Go to <strong>Remote Login</strong>.</span>
              </li>
              <li>
                <span className="primal-step-badge">3</span>
                <span>Scan the code on the right with Primal.</span>
              </li>
              <li>
                <span className="primal-step-badge">4</span>
                <span>Approve the request — you're signed in.</span>
              </li>
            </ol>

            <div className="primal-connect-qr">
              <NostrLoginPanel qrOnly />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nostr-connect-primal">
      <p className="primal-intro">
        <strong>Create your account in the Primal app</strong> — on your phone, download Primal
        from the App Store or Google Play.
      </p>
      <PrimalSignupCarousel onConnect={() => setView('connect')} />
    </div>
  );
}
