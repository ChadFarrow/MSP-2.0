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
import menuShot from '../../assets/onboarding/primal-menu.webp';
import remoteLoginShot from '../../assets/onboarding/primal-remote-login.webp';
import loginAsShot from '../../assets/onboarding/primal-connect-login.webp';
import permissionsShot from '../../assets/onboarding/primal-connect-permissions.webp';

interface ConnectStep {
  label: ReactNode;
  img: string | null; // screenshot for this step (null = not supplied yet)
  alt: string;
}

const CONNECT_STEPS: ConnectStep[] = [
  { label: <>In Primal, tap your profile picture, then tap <strong>Remote Login</strong>.</>, img: menuShot, alt: 'Primal side menu with Remote Login' },
  { label: <>Scan the code on the right with Primal.</>, img: remoteLoginShot, alt: 'Primal Remote Login scanner' },
  { label: <>Choose the account to log in as.</>, img: loginAsShot, alt: 'Primal Remote Login — choose account' },
  { label: <>Pick a trust level, then tap <strong>Connect</strong>. <strong>Full Trust</strong> approves everything automatically; lower levels ask you to approve each request.</>, img: permissionsShot, alt: 'Primal Remote Login — permissions' },
];

export function NewToNostrPanel() {
  const [view, setView] = useState<'steps' | 'connect'>('steps');
  // Which connect step's screenshot is shown on the left.
  const [connectStep, setConnectStep] = useState(0);

  if (view === 'connect') {
    const activeShot = CONNECT_STEPS[connectStep];

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
            {activeShot.img ? (
              <img src={activeShot.img} alt={activeShot.alt} />
            ) : (
              <div className="primal-connect-phone-placeholder">Screenshot coming</div>
            )}
          </div>
          <ol className="primal-connect-steps">
            {CONNECT_STEPS.map((step, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`primal-step-item${i === connectStep ? ' is-active' : ''}`}
                  onClick={() => setConnectStep(i)}
                  aria-current={i === connectStep}
                >
                  <span className="primal-step-badge">{i + 1}</span>
                  <span className="primal-step-label">{step.label}</span>
                </button>
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
