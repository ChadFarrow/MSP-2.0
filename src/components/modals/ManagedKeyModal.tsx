import { useState } from 'react';
import { hexToBytes } from '@noble/hashes/utils';
import { nsecEncode } from 'nostr-tools/nip19';
import { useNostr } from '../../store/nostrStore';
import { ModalWrapper } from './ModalWrapper';

interface ManagedKeyModalProps {
  onClose: () => void;
}

export function ManagedKeyModal({ onClose }: ManagedKeyModalProps) {
  const { state } = useNostr();
  const [nsecRevealed, setNsecRevealed] = useState(false);
  const [nsec, setNsec] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [npubCopied, setNpubCopied] = useState(false);
  const [nsecCopied, setNsecCopied] = useState(false);

  const npub = state.user?.npub ?? '';

  const handleReveal = async () => {
    if (nsec) {
      setNsecRevealed(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/keypair');
      if (!res.ok) {
        setError('Could not retrieve key. Please sign in again.');
        return;
      }
      const { sk: skHex } = await res.json() as { sk: string };
      setNsec(nsecEncode(hexToBytes(skHex)));
      setNsecRevealed(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleHide = () => setNsecRevealed(false);

  const copy = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <ModalWrapper
      isOpen={true}
      onClose={onClose}
      title="Your Nostr Keys"
      className="managed-key-modal"
      footer={
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      }
    >
      <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Your Nostr identity was created automatically when you signed in with Google.
        You can import these keys into any Nostr app.
      </p>

      <div className="key-field">
        <label className="key-label">Public Key (npub) — safe to share</label>
        <div className="key-value-row">
          <code className="key-value">{npub}</code>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => copy(npub, setNpubCopied)}
          >
            {npubCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="key-field" style={{ marginTop: '20px' }}>
        <label className="key-label">Private Key (nsec) — keep secret</label>
        {!nsecRevealed ? (
          <button
            className="btn btn-secondary"
            onClick={handleReveal}
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? 'Loading...' : 'Reveal Private Key'}
          </button>
        ) : (
          <>
            <div className="key-value-row" style={{ marginTop: '8px' }}>
              <code className="key-value">{nsec}</code>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => copy(nsec!, setNsecCopied)}
                >
                  {nsecCopied ? 'Copied!' : 'Copy'}
                </button>
                <button className="btn btn-secondary btn-small" onClick={handleHide}>
                  Hide
                </button>
              </div>
            </div>
            <div className="key-warning" style={{ marginTop: '12px' }}>
              ⚠️ <strong>Keep this private.</strong> Anyone with this key controls your Nostr identity.
              Never share it or paste it into untrusted websites.
            </div>
          </>
        )}
      </div>

      {error && <div className="connect-error" style={{ marginTop: '12px' }}>{error}</div>}

      <div className="key-tip" style={{ marginTop: '24px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <strong>Tip:</strong> Import your <code>nsec</code> into{' '}
        <a href="https://primal.net" target="_blank" rel="noopener noreferrer">Primal</a>,{' '}
        <a href="https://getalby.com" target="_blank" rel="noopener noreferrer">Alby</a>, or{' '}
        <a href="https://fountain.fm" target="_blank" rel="noopener noreferrer">Fountain</a>{' '}
        to use your identity across Nostr apps. Once imported, you can switch to "Remote Signer" login
        instead of Google.
      </div>
    </ModalWrapper>
  );
}
