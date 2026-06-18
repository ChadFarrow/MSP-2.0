import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useNostr } from '../../store/nostrStore';
import { hasNip07Extension } from '../../utils/nostrSigner';
import { ModalWrapper } from './ModalWrapper';

interface NostrConnectModalProps {
  onClose: () => void;
}

type Tab = 'google' | 'primal' | 'extension' | 'remote';

export function NostrConnectModal({ onClose }: NostrConnectModalProps) {
  const { state, login, loginWithNip46, loginWithGoogle } = useNostr();
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
        <button className={`modal-tab ${tab === 'primal' ? 'active' : ''}`} onClick={() => changeTab('primal')}>
          New to Nostr?
        </button>
        <button className={`modal-tab ${tab === 'extension' ? 'active' : ''}`} onClick={() => changeTab('extension')}>
          Extension
        </button>
        <button className={`modal-tab ${tab === 'remote' ? 'active' : ''}`} onClick={() => changeTab('remote')}>
          Remote Signer
        </button>
      </div>

      {tab === 'google' && (
        <div className="nostr-connect-google">
          <p className="connect-description">
            Sign in with Google and we'll create a Nostr identity for you automatically.
            No Nostr knowledge required.
          </p>
          <button
            className="btn btn-primary btn-large btn-google"
            onClick={() => loginWithGoogle()}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '12px', textAlign: 'center' }}>
            You can always export your Nostr keys later from the menu.
          </p>
        </div>
      )}

      {tab === 'primal' && (
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
                <p>
                  Go to the <strong>Remote Signer</strong> tab above, paste your code, and connect.
                </p>
              </div>
            </div>
          </div>
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
