// src/components/Onboarding/NostrLoginPanel.tsx
//
// Standalone Nostr login UI (extension / bunker / NIP-46 QR), lifted from the
// old ArtistOnboardingWizard step 1 so both the onboarding wizard and any future
// caller share one implementation. Renders nothing if already logged in — the
// parent watches nostrState.isLoggedIn to advance.

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useNostr } from '../../store/nostrStore';
import { truncateNpub } from '../../utils/nostr';

interface NostrLoginPanelProps {
  // QR-only variant: auto-generate the nostrconnect:// QR on mount and show just
  // the code + waiting state (no extension button, no bunker paste). Used by the
  // onboarding connect page where the only path is scanning with Primal.
  qrOnly?: boolean;
}

export function NostrLoginPanel({ qrOnly = false }: NostrLoginPanelProps = {}) {
  const { state: nostrState, login, loginWithNip46, logout } = useNostr();

  const [bunkerUri, setBunkerUri] = useState('');
  const [loginError, setLoginError] = useState('');
  // Scanning MSP's QR (nostrconnect://) is the primary path; the bunker:// paste is
  // demoted to a secondary "Advanced" affordance revealed by this toggle.
  const [showBunkerPaste, setShowBunkerPaste] = useState(false);
  // NIP-46 QR login (scan with Amber etc.) so mobile users can connect inline.
  const [connectUri, setConnectUri] = useState<string | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const autoStarted = useRef(false);

  const handleExtensionLogin = async () => {
    setLoginError('');
    try {
      await login();
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  const handleBunkerLogin = async () => {
    const uri = bunkerUri.trim();
    if (!uri) return;
    setLoginError('');
    try {
      await loginWithNip46(uri);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  const handleGenerateQr = async () => {
    setLoginError('');
    setGeneratingQr(true);
    setConnectUri(null);
    try {
      // No bunker URI + a callback makes the signer generate a nostrconnect://
      // URI we render as a QR for the user to scan.
      await loginWithNip46(undefined, (uri) => setConnectUri(uri));
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Could not start QR login');
    } finally {
      setGeneratingQr(false);
    }
  };

  const handleCopyConnectUri = async () => {
    if (!connectUri) return;
    try {
      await navigator.clipboard.writeText(connectUri);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = connectUri;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  // Render the QR onto the canvas whenever the connect URI changes.
  useEffect(() => {
    if (connectUri && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, connectUri, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch((err) => console.error('Failed to generate QR code:', err));
    }
  }, [connectUri]);

  // QR-only variant auto-generates the connect code as soon as the page opens.
  useEffect(() => {
    if (qrOnly && !autoStarted.current && !nostrState.isLoggedIn) {
      autoStarted.current = true;
      handleGenerateQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOnly, nostrState.isLoggedIn]);

  // Once signed in, confirm who they are with their profile name + picture.
  if (nostrState.isLoggedIn && nostrState.user) {
    const { user } = nostrState;
    return (
      <div className="onboarding-identity">
        {user.picture ? (
          <img src={user.picture} alt="" className="onboarding-identity-avatar" />
        ) : (
          <span className="onboarding-identity-avatar onboarding-identity-avatar-fallback">✓</span>
        )}
        <div className="onboarding-identity-meta">
          <span className="onboarding-identity-name" title={user.npub}>
            {user.displayName || truncateNpub(user.npub)}
          </span>
          <span className="onboarding-identity-sub">Signed in with Nostr</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={logout}
          title="Sign out and switch accounts"
        >
          Sign out
        </button>
      </div>
    );
  }

  // QR-only variant: just the connect code + waiting state (used by the connect page).
  if (qrOnly) {
    return (
      <div className="connect-qr-container">
        {connectUri ? (
          <>
            <div className="qr-code-wrapper">
              <canvas ref={qrCanvasRef} />
            </div>
            <p className="connect-waiting">Waiting for Primal to connect…</p>
          </>
        ) : (
          <p className="connect-waiting">Generating your connect code…</p>
        )}
        {(loginError || nostrState.error) && (
          <div style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em', textAlign: 'center' }}>
            <div>{loginError || nostrState.error}</div>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={handleGenerateQr}
              style={{ marginTop: 8 }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        Sign in once and your feeds are linked to your Nostr identity — no edit tokens.
      </p>
      {nostrState.hasExtension && (
        <button
          className="btn btn-primary"
          onClick={handleExtensionLogin}
          disabled={nostrState.isLoading}
          style={{ width: '100%' }}
        >
          {nostrState.isLoading ? 'Connecting…' : 'Connect with Browser Extension'}
        </button>
      )}
      <div>
        <label className="form-label">Remote signer (Primal, Amber, nsecBunker)</label>
        {!connectUri ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateQr}
              disabled={generatingQr || nostrState.isLoading}
              style={{ width: '100%' }}
            >
              {generatingQr ? 'Generating…' : 'Scan a QR code to connect'}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => setShowBunkerPaste(v => !v)}
              style={{
                marginTop: 8,
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--text-secondary)',
                fontSize: '0.85em',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {showBunkerPaste ? 'Hide' : 'Paste a bunker:// code instead'}
            </button>
            {showBunkerPaste && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder="bunker://..."
                  value={bunkerUri}
                  onChange={e => setBunkerUri(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBunkerLogin(); }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleBunkerLogin}
                  disabled={!bunkerUri.trim() || nostrState.isLoading}
                >
                  Connect
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="connect-qr-container">
            <div className="qr-code-wrapper">
              <canvas ref={qrCanvasRef} />
            </div>
            <p className="connect-waiting">Waiting for your signer to connect…</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-small" onClick={handleCopyConnectUri}>
                Copy URI
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setConnectUri(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {!nostrState.hasExtension && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85em', margin: 0 }}>
          Or install a Nostr browser extension (Alby, nos2x) to connect with one click.
        </p>
      )}
      {(loginError || nostrState.error) && (
        <div style={{ color: 'var(--error, #dc2626)', fontSize: '0.85em' }}>
          {loginError || nostrState.error}
        </div>
      )}
    </div>
  );
}
