// src/components/Onboarding/NewToNostrPanel.tsx
//
// "New to Nostr?" walkthrough — guides a first-timer through creating a real
// Nostr identity with Primal, then connecting via a remote signer. Single source
// of truth shared by NostrConnectModal (tab layout: educational only, points at
// the Remote Signer tab) and the onboarding wizard (inlineConnect: educational +
// the remote-signer connect UI right below).

import { NostrLoginPanel } from './NostrLoginPanel';
import { PrimalSignupCarousel } from './PrimalSignupCarousel';

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
        Get the app at{' '}
        <a href="https://primal.net" target="_blank" rel="noopener noreferrer">primal.net</a>
        {' '}— available on iOS and Android.
      </p>

      <h4 className="primal-section-heading">Create your account in Primal</h4>
      <PrimalSignupCarousel />

      <h4 className="primal-section-heading">Then connect it to MSP</h4>
      {inlineConnect ? (
        <>
          <p className="connect-description">
            In Primal, open the QR scanner and scan the code below — nothing to copy or paste.
            Approve the request and you're connected. Prefer not to scan? Paste a{' '}
            <code>bunker://</code> code from Primal's{' '}
            <strong>Settings → Keys → Nostr Connect</strong> instead.
          </p>
          <div style={{ marginTop: 16 }}>
            <NostrLoginPanel />
          </div>
        </>
      ) : (
        <p className="connect-description">
          Go to the <strong>Remote Signer</strong> tab, scan the QR code with Primal, and
          approve the request — or paste a <code>bunker://</code> code from Primal's{' '}
          <strong>Settings → Keys → Nostr Connect</strong>.
        </p>
      )}
    </div>
  );
}
