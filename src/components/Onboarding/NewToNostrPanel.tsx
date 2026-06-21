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
        <button
          type="button"
          className="btn btn-secondary btn-small primal-connect-back"
          onClick={() => setView('steps')}
        >
          ← Back to setup
        </button>
        <div className="primal-connect-page">
          <h4 className="primal-connect-title">Connect Primal to MSP</h4>
          <p className="primal-connect-instructions">
            In Primal, open <strong>Remote Login</strong> and scan this code to sign in.
          </p>
          <NostrLoginPanel qrOnly />
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
