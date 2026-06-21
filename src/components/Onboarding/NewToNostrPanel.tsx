// src/components/Onboarding/NewToNostrPanel.tsx
//
// "New to Nostr?" walkthrough. Two views:
//  - steps:   the centered intro + the 5-step Primal setup carousel. Its sixth
//             checklist item, "Connect to MSP", switches to the connect view.
//  - connect: a dedicated page that shows the nostrconnect:// QR (QR-only) for the
//             user to scan with Primal's Remote Login. Set up Primal first, then
//             connect it here.
// Shared by the onboarding wizard (AuthStep) and NostrConnectModal's "New to Nostr" tab.

import { useState, type ReactNode } from 'react';
import { NostrLoginPanel } from './NostrLoginPanel';
import { PrimalSignupCarousel } from './PrimalSignupCarousel';
import remoteLoginShot from '../../assets/onboarding/primal-remote-login.webp';

export function NewToNostrPanel() {
  const [view, setView] = useState<'steps' | 'connect'>('steps');

  if (view === 'connect') {
    const connectSteps: ReactNode[] = [
      <>Open the <strong>Primal</strong> app on your phone.</>,
      <>Tap your profile picture to open the menu, then tap <strong>Remote Login</strong>.</>,
      <>Scan the code on the left with Primal.</>,
      <>Approve the request — you're signed in.</>,
    ];

    return (
      <div className="nostr-connect-primal">
        <button
          type="button"
          className="btn-link primal-connect-back"
          onClick={() => setView('steps')}
        >
          ← Back to setup steps
        </button>
        <p className="primal-intro">
          <strong>Connect Primal to MSP</strong> — open <strong>Remote Login</strong> in Primal and
          scan this code to sign in.
        </p>
        <div className="primal-connect-cols">
          <div className="primal-connect-phone">
            <img src={remoteLoginShot} alt="Primal Remote Login screen" />
          </div>
          <ol className="primal-connect-steps">
            {connectSteps.map((step, i) => (
              <li key={i}>
                <div className="primal-step-item is-static">
                  <span className="primal-step-badge">{i + 1}</span>
                  <span className="primal-step-label">{step}</span>
                </div>
              </li>
            ))}
          </ol>
          <div className="primal-connect-qr">
            <NostrLoginPanel qrOnly />
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
