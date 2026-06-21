// src/components/Onboarding/NewToNostrPanel.tsx
//
// "New to Nostr?" walkthrough — guides a first-timer through creating a real
// Nostr identity with Primal, then connecting via a remote signer. Single source
// of truth shared by NostrConnectModal (tab layout: educational only, points at
// the Remote Signer tab) and the onboarding wizard (inlineConnect: educational +
// the remote-signer connect UI right below).
//
// Layout: a two-column Primal walkthrough (PrimalSignupCarousel) with a big phone
// screenshot on the left and a numbered step checklist on the right. The connect
// step is passed in as the carousel's connectSlot and only appears once the user
// has paged through all five Primal setup steps — set up Primal first, then connect.

import { NostrLoginPanel } from './NostrLoginPanel';
import { PrimalSignupCarousel } from './PrimalSignupCarousel';

interface NewToNostrPanelProps {
  // When true, render the remote-signer connect UI (NostrLoginPanel) directly in
  // the carousel's connect slot instead of telling the user to switch tabs. Used
  // in the wizard, where there is no separate "Remote Signer" tab to point at.
  inlineConnect?: boolean;
}

export function NewToNostrPanel({ inlineConnect = false }: NewToNostrPanelProps) {
  const connectSlot = (
    <div className="primal-connect-slot">
      {inlineConnect ? (
        <>
          <p className="connect-description">
            Scan the QR below with Primal to connect — approve the request and you're in.
            Prefer not to scan? Paste a <code>bunker://</code> code from Primal's{' '}
            <strong>Settings → Keys → Nostr Connect</strong>.
          </p>
          <NostrLoginPanel />
        </>
      ) : (
        <p className="connect-description">
          Go to the <strong>Remote Signer</strong> tab and scan the QR code with Primal — or
          paste a <code>bunker://</code> code from Primal's{' '}
          <strong>Settings → Keys → Nostr Connect</strong>.
        </p>
      )}
    </div>
  );

  return (
    <div className="nostr-connect-primal">
      <div className="primal-intro">
        <h4 className="primal-intro-title">Create your account in the Primal app</h4>
        <p className="primal-intro-sub">
          A real Nostr identity that works across many apps. On your phone, download Primal
          from the App Store or Google Play — the web version won't work for connecting here.
        </p>
      </div>

      <PrimalSignupCarousel connectSlot={connectSlot} />
    </div>
  );
}
