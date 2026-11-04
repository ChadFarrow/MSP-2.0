import { useState } from 'react';
import { ModalWrapper } from '../modals/ModalWrapper';
import { requestMagicLink, verifyMagicLink, extractMagicLinkToken } from '../../utils/emailSession';
import { isWordPress } from '../../utils/runtimeTarget';

interface EmailLoginModalProps {
  onClose: () => void;
  // When present, the link claims this feed (proves ownership with the edit token)
  // instead of a plain sign-in.
  claim?: { feedId: string; editToken: string; feedTitle?: string };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailLoginModal({ onClose, claim }: EmailLoginModalProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // WordPress plugin only: the emailed link opens musicsideproject.com, so the
  // user pastes it here instead and the plugin redeems it in this browser.
  const pasteLink = isWordPress();
  const [pastedLink, setPastedLink] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const isClaim = Boolean(claim);
  const emailValid = EMAIL_RE.test(email.trim());

  const handleSubmit = async () => {
    if (!emailValid) {
      setError('Please enter a valid email address');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await requestMagicLink(email.trim(), isClaim
        ? { purpose: 'claim', feedId: claim!.feedId, editToken: claim!.editToken }
        : { purpose: 'login' });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRedeem = async () => {
    const token = extractMagicLinkToken(pastedLink);
    if (!token) {
      setError('That doesn’t look like the link from the email. Copy the whole link and paste it here.');
      return;
    }
    setRedeeming(true);
    setError(null);
    try {
      await verifyMagicLink(token);
      setSignedIn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired link');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <ModalWrapper
      isOpen={true}
      onClose={onClose}
      title={isClaim ? 'Claim feed with email' : 'Sign in with email'}
      footer={
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          {sent && pasteLink && !signedIn && (
            <button
              className="btn btn-primary"
              onClick={handleRedeem}
              disabled={redeeming || !pastedLink.trim()}
            >
              {redeeming ? 'Signing in…' : isClaim ? 'Claim feed' : 'Sign in'}
            </button>
          )}
          {!sent && (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting || !emailValid}
            >
              {submitting ? 'Sending…' : 'Send magic link'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>
            {sent && (!pasteLink || signedIn) ? 'Done' : 'Cancel'}
          </button>
        </div>
      }
    >
      {sent && pasteLink ? (
        signedIn ? (
          <p style={{ color: 'var(--success)', fontSize: '0.9rem' }}>
            {isClaim ? 'Feed claimed. You can now manage it from any device.' : 'Signed in. Your MSP-hosted feeds are available from Import → MSP Hosted.'}
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>
              Check your inbox at <strong>{email.trim()}</strong>. <strong>Don’t click the link</strong> — it would sign you in on musicsideproject.com, not here. Copy the link from the email and paste it below. It expires shortly and can be used once.
            </p>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Link from the email
            </label>
            <input
              type="url"
              value={pastedLink}
              onChange={(e) => { setPastedLink(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && pastedLink.trim()) handleRedeem(); }}
              placeholder="https://musicsideproject.com/auth/verify?token=…"
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem'
              }}
            />
          </>
        )
      ) : sent ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Check your inbox at <strong>{email.trim()}</strong>. Click the link to{' '}
          {isClaim ? 'finish claiming your feed' : 'sign in'}. The link expires shortly and can be used once.
        </p>
      ) : (
        <>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '12px' }}>
            {isClaim
              ? <>Attach your email to {claim?.feedTitle ? <strong>{claim.feedTitle}</strong> : 'this feed'} so you can manage it from any device — no token to keep. We'll email you a link to confirm.</>
              : 'Manage your MSP-hosted feeds from any device. We’ll email you a one-time sign-in link — no password to remember.'}
          </p>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && emailValid) handleSubmit(); }}
              placeholder="you@example.com"
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem'
              }}
            />
          </div>
        </>
      )}
      {error && (
        <div style={{ color: 'var(--error, #ef4444)', marginTop: '12px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
    </ModalWrapper>
  );
}
