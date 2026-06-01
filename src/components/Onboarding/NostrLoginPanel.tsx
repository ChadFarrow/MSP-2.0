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

export function NostrLoginPanel() {
  const { state: nostrState, login, loginWithNip46 } = useNostr();

  const [bunkerUri, setBunkerUri] = useState('');
  const [loginError, setLoginError] = useState('');
  // NIP-46 QR login (scan with Amber etc.) so mobile users can connect inline.
  const [connectUri, setConnectUri] = useState<string | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

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
        <label className="form-label">Remote signer (Amber, nsecBunker)</label>
        {!connectUri ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleGenerateQr}
              disabled={generatingQr || nostrState.isLoading}
              style={{ marginTop: 8 }}
            >
              {generatingQr ? 'Generating…' : 'Or scan a QR code'}
            </button>
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
