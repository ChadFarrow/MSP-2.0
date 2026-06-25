import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useNostr } from '../../store/nostrStore';
import { hasNip07Extension } from '../../utils/nostrSigner';
import { ModalWrapper } from './ModalWrapper';
import { GoogleSignInButton } from '../Onboarding/GoogleSignInButton';

interface NostrConnectModalProps {
  onClose: () => void;
  /** When true, the modal was opened from the returning-artist flow, so the
      Quick Sign In copy welcomes them back instead of describing first-time setup. */
  returning?: boolean;
}

type Tab = 'google' | 'extension' | 'remote';

export function NostrConnectModal({ onClose, returning = false }: NostrConnectModalProps) {
  const { state, login, loginWithNip46 } = useNostr();
  const [tab, setTab] = useState<Tab>('google');
  const [bunkerUri, setBunkerUri] = useState('');
  const [connectUri, setConnectUri] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const hasExtension = hasNip07Extension();

  useEffect(() => {
    if (connectUri && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, connectUri, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(err => console.error('Failed to generate QR code:', err));
    }
  }, [connectUri]);

  useEffect(() => {
    if (state.isLoggedIn && !state.isLoading) {
      onClose();
    }
  }, [state.isLoggedIn, state.isLoading, onClose]);

  useEffect(() => {
    if (state.error) {
      setError(state.error);
      setConnecting(false);
    }
  }, [state.error]);

  const changeTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setConnectUri(null);
    setConnecting(false);
  };

  const handleExtensionLogin = async () => {
    setError(null);
    setConnecting(true);
    try {
      await login();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setError('Please enter a bunker URI');
      return;
    }
    setError(null);
    setConnecting(true);
    try {
      await loginWithNip46(bunkerUri.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setConnecting(false);
    }
  };

  const handleGenerateQR = async () => {
    setError(null);
    setConnecting(true);
    setConnectUri(null);
    try {
      await loginWithNip46(undefined, (uri) => setConnectUri(uri));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setConnecting(false);
    }
  };

  const handleCopyUri = async () => {
    if (!connectUri) return;
    try {
      await navigator.clipboard.writeText(connectUri);
    } catch {
      const el = document.createElement('textarea');
      el.value = connectUri;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  const handleCancel = () => {
    setConnecting(false);
    setConnectUri(null);
    setError(null);
  };

  return (
    <ModalWrapper
      isOpen={true}
      onClose={onClose}
      title="Sign In"
      className="nostr-connect-modal"
      footer={
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      }
    >
      <div className="modal-tabs">
        <button className={`modal-tab ${tab === 'google' ? 'active' : ''}`} onClick={() => changeTab('google')}>
          Quick Sign In
        </button>
        <button className={`modal-tab ${tab === 'extension' ? 'active' : ''}`} onClick={() => changeTab('extension')}>
          Extension
        </button>
        <button className={`modal-tab ${tab === 'remote' ? 'active' : ''}`} onClick={() => changeTab('remote')}>
          Remote Signer
        </button>
      </div>

      <p className="connect-note">
        You only need to sign in to use your MSP account — hosting and managing your feeds.
        You can create, edit, and download feeds without signing in.
      </p>

      {tab === 'google' && (
        <div className="nostr-connect-google">
          <p className="connect-description">
            {returning
              ? "Welcome back! Sign in with the same Google account to get back into your identity and feeds."
              : "Sign in with Google and we'll create a Nostr identity for you automatically. No Nostr knowledge required."}
          </p>
          <GoogleSignInButton />
          <p className="connect-footnote">
            You can always export your Nostr keys later from the menu.
          </p>
        </div>
      )}

      {tab === 'extension' && (
        <div className="nostr-connect-extension">
          <p className="connect-description">
            Connect using a NIP-07 browser extension like Alby, nos2x, or Nostr Connect.
          </p>
          {!hasExtension && (
            <div className="connect-warning">
              No Nostr extension detected. Install one to use this method, or use Remote Signer for mobile.
            </div>
          )}
          <button
            className="btn btn-primary btn-large"
            onClick={handleExtensionLogin}
            disabled={!hasExtension || connecting}
          >
            {connecting ? 'Connecting...' : 'Connect with Extension'}
          </button>
        </div>
      )}

      {tab === 'remote' && (
        <div className="nostr-connect-remote">
          {!connectUri ? (
            <>
              <p className="connect-description">
                Connect using a remote signer like Primal (iOS/Android), Amber (Android), or any NIP-46 compatible app.
              </p>
              <div className="connect-option">
                <h4>Option 1: Scan QR Code</h4>
                <p>Generate a connection QR code to scan with your signer app.</p>
                <button className="btn btn-primary" onClick={handleGenerateQR} disabled={connecting}>
                  {connecting ? 'Generating...' : 'Generate QR Code'}
                </button>
              </div>
              <div className="connect-divider"><span>or</span></div>
              <div className="connect-option">
                <h4>Option 2: Paste Bunker URI</h4>
                <p>Paste a bunker:// URI from your signer app.</p>
                <input
                  type="text"
                  className="form-input"
                  placeholder="bunker://..."
                  value={bunkerUri}
                  onChange={e => setBunkerUri(e.target.value)}
                  disabled={connecting}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleBunkerLogin}
                  disabled={connecting || !bunkerUri.trim()}
                  style={{ marginTop: '8px' }}
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </>
          ) : (
            <div className="connect-qr-container">
              <p className="connect-description">
                Scan this QR code with your Nostr signer app (Amber, etc.)
              </p>
              <div className="qr-code-wrapper">
                <canvas ref={canvasRef} />
              </div>
              <p className="connect-waiting">Waiting for connection...</p>
              <div className="connect-qr-actions">
                <button className="btn btn-secondary" onClick={handleCopyUri}>Copy URI</button>
                <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
              </div>
              <details className="connect-uri-details">
                <summary>Show connection URI</summary>
                <code className="connect-uri-code">{connectUri}</code>
              </details>
            </div>
          )}
        </div>
      )}

      {error && <div className="connect-error">{error}</div>}
    </ModalWrapper>
  );
}
