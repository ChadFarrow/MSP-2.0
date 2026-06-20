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
        Primal is an easy way to get a real Nostr identity that works across many apps.
      </p>
      <div className="primal-steps">
        <div className="primal-step">
          <div className="primal-step-number">1</div>
          <div className="primal-step-content">
            <strong>Download Primal</strong>
            <p>
              Get the app at{' '}
              <a href="https://primal.net" target="_blank" rel="noopener noreferrer">primal.net</a>
              {' '}— available on iOS and Android.
            </p>
          </div>
        </div>
        <div className="primal-step">
          <div className="primal-step-number">2</div>
          <div className="primal-step-content">
            <strong>Create your account</strong>
            <p>Add a display name (and a photo if you like). Primal generates your Nostr keys for you and can save them to your iCloud Keychain.</p>
          </div>
        </div>
        <div className="primal-step">
          <div className="primal-step-number">3</div>
          <div className="primal-step-content">
            <strong>Scan the QR code</strong>
            <p>In Primal, open the QR scanner and scan the code shown below — nothing to copy or paste.</p>
          </div>
        </div>
        <div className="primal-step">
          <div className="primal-step-number">4</div>
          <div className="primal-step-content">
            <strong>Approve the connection</strong>
            {inlineConnect ? (
              <p>
                Approve the request in Primal and you're connected. Prefer not to scan? Paste a{' '}
                <code>bunker://</code> code from Primal's <strong>Settings → Keys → Nostr Connect</strong> instead.
              </p>
            ) : (
              <p>
                Approve the request in Primal and you're connected — or paste a <code>bunker://</code> code on the{' '}
                <strong>Remote Signer</strong> tab.
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
