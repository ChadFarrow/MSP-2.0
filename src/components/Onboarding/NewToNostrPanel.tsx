// src/components/Onboarding/NewToNostrPanel.tsx
//
// "New to Nostr?" walkthrough — guides a first-timer through creating a real
// Nostr identity with Primal, then connecting via a remote signer. Single source
// of truth shared by NostrConnectModal (tab layout: educational only, points at
// the Remote Signer tab) and the onboarding wizard (inlineConnect: educational +
// the remote-signer connect UI right below).

import { NostrLoginPanel } from './NostrLoginPanel';

interface NewToNostrPanelProps {
  // When true, render the remote-signer connect UI (NostrLoginPanel) directly
  // beneath the steps instead of telling the user to switch tabs. Used in the
  // wizard, where there is no separate "Remote Signer" tab to point at.
  inlineConnect?: boolean;
}

export function NewToNostrPanel({ inlineConnect = false }: NewToNostrPanelProps) {
  return (
    <div className="nostr-connect-primal">
      <p className="connect-description">
        Primal is an easy way to get a real Nostr identity that works across many apps —
        Fountain, Wavlake, Zap.stream, and more.
      </p>
      <div className="primal-steps">
        <div className="primal-step">
          <div className="primal-step-number">1</div>
          <div className="primal-step-content">
            <strong>Download Primal</strong>
            <p>
              Get the app at{' '}
              <a href="https://primal.net" target="_blank" rel="noopener noreferrer">primal.net</a>
              {' '}— available on iOS, Android, and web.
            </p>
          </div>
        </div>
        <div className="primal-step">
          <div className="primal-step-number">2</div>
          <div className="primal-step-content">
            <strong>Create your account</strong>
            <p>Sign up with your email address or phone number in the Primal app.</p>
          </div>
        </div>
        <div className="primal-step">
          <div className="primal-step-number">3</div>
          <div className="primal-step-content">
            <strong>Get your connection code</strong>
            <p>
              In Primal: <strong>Settings → Keys → Nostr Connect</strong> — copy the{' '}
              <code>bunker://</code> URI shown there.
            </p>
          </div>
        </div>
        <div className="primal-step">
          <div className="primal-step-number">4</div>
          <div className="primal-step-content">
            <strong>Connect here</strong>
            {inlineConnect ? (
              <p>Paste your connection code below (or scan a QR code) to connect.</p>
            ) : (
              <p>
                Go to the <strong>Remote Signer</strong> tab above, paste your code, and connect.
              </p>
            )}
          </div>
        </div>
      </div>

      {inlineConnect && (
        <div style={{ marginTop: 16 }}>
          <NostrLoginPanel />
        </div>
      )}
    </div>
  );
}
