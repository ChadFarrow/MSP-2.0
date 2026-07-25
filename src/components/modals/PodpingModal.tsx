import { useState, useEffect, useRef } from 'react';
import { ModalWrapper } from './ModalWrapper';
import { getHostedFeedInfo, buildHostedUrl } from '../../utils/hostedFeed';
import { getFeedUrlError } from '../../utils/urlValidation';

interface PodpingModalProps {
  onClose: () => void;
  feedGuid: string;
  medium?: string;
}

// /api/podping only confirms hivepinger accepted the ping into its queue; the Hive
// broadcast happens asynchronously. Poll /api/podping-verify until it shows up on-chain.
const VERIFY_FIRST_DELAY_MS = 3000;
const VERIFY_INTERVAL_MS = 5000;
const VERIFY_MAX_ATTEMPTS = 6;

interface VerifyState {
  status: 'idle' | 'checking' | 'landed' | 'not-seen' | 'unavailable';
  account?: string;
  trxId?: string;
  block?: number;
  /** True when we couldn't reach Hive at all — distinct from "not configured". */
  unreachable?: boolean;
}

export function PodpingModal({ onClose, feedGuid, medium }: PodpingModalProps) {
  const [podpingUrl, setPodpingUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' });
  const [verifyJob, setVerifyJob] = useState<{ url: string; id: number } | null>(null);
  const verifyJobId = useRef(0);

  useEffect(() => {
    if (!feedGuid) return;
    const info = getHostedFeedInfo(feedGuid);
    if (info) {
      setPodpingUrl(buildHostedUrl(info.feedId));
    }
  }, [feedGuid]);

  // Poll Hive for the podping. Cleanup aborts the in-flight request and stops the loop,
  // so closing the modal / editing the URL / resending never leaves a stale poller.
  useEffect(() => {
    if (!verifyJob) return;

    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async (attempt: number) => {
      if (cancelled) return;

      try {
        const response = await fetch(
          `/api/podping-verify?url=${encodeURIComponent(verifyJob.url)}`,
          { signal: controller.signal }
        );
        if (cancelled) return;

        // Not configured on this deployment, or we've been throttled — stop quietly.
        if (response.status === 501) {
          setVerify({ status: 'unavailable' });
          return;
        }
        if (response.status === 429) {
          setVerify({ status: 'unavailable', unreachable: true });
          return;
        }
        if (!response.ok) throw new Error('Hive check failed');

        const data = await response.json();
        if (cancelled) return;

        if (data.landed) {
          setVerify({
            status: 'landed',
            account: data.account,
            trxId: data.trxId,
            block: data.block
          });
          return;
        }

        if (attempt >= VERIFY_MAX_ATTEMPTS) {
          setVerify({ status: 'not-seen', account: data.account });
          return;
        }
      } catch {
        if (cancelled || controller.signal.aborted) return;
        if (attempt >= VERIFY_MAX_ATTEMPTS) {
          // Couldn't reach Hive — say so rather than claiming the ping didn't land.
          setVerify({ status: 'unavailable', unreachable: true });
          return;
        }
      }

      timer = setTimeout(() => poll(attempt + 1), VERIFY_INTERVAL_MS);
    };

    timer = setTimeout(() => poll(1), VERIFY_FIRST_DELAY_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [verifyJob]);

  const handleUrlChange = (value: string) => {
    setPodpingUrl(value);
    // The old result refers to a different feed now.
    setVerifyJob(null);
    setVerify({ status: 'idle' });
    setMessage(null);
  };

  const handleSubmit = async () => {
    const url = podpingUrl.trim();
    if (!url) {
      setMessage({ type: 'error', text: 'Please enter a feed URL' });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setVerifyJob(null);
    setVerify({ status: 'idle' });

    try {
      const body: { url: string; reason: string; medium?: string } = { url, reason: 'update' };
      if (medium) body.medium = medium;
      const response = await fetch('/api/podping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(data.error || 'Podping failed');
      }
      setMessage({ type: 'success', text: 'Podping sent.' });
      verifyJobId.current += 1;
      setVerify({ status: 'checking' });
      setVerifyJob({ url, id: verifyJobId.current });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Podping failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const urlError = getFeedUrlError(podpingUrl.trim());
  const noteStyle = { marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' };

  return (
    <ModalWrapper
      isOpen={true}
      onClose={onClose}
      title="Send Podping"
      footer={
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !podpingUrl.trim() || !!urlError}
          >
            {submitting ? 'Sending…' : 'Send Podping'}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      }
    >
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '12px' }}>
        Notify podcast apps that a feed was updated, via Podping/Hive. Indexers re-crawl the feed when they see the ping.
      </p>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Feed URL
        </label>
        <input
          type="text"
          value={podpingUrl}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://example.com/feed.xml"
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '4px',
            border: `1px solid ${urlError ? 'var(--error, #ef4444)' : 'var(--border-color)'}`,
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            fontFamily: 'monospace'
          }}
        />
        {urlError && (
          <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--error, #ef4444)' }}>
            {urlError}
          </div>
        )}
      </div>
      {message && (
        <div style={{
          color: message.type === 'error' ? 'var(--error)' : 'var(--success)',
          marginTop: '12px',
          fontSize: '0.875rem'
        }}>
          {message.text}
        </div>
      )}
      {verify.status === 'checking' && (
        <div style={noteStyle}>Checking Hive…</div>
      )}
      {verify.status === 'landed' && (
        <div style={{ ...noteStyle, color: 'var(--success)' }}>
          ✅ Landed on Hive{verify.block ? ` · block ${verify.block}` : ''}
          {verify.trxId && (
            <>
              {' · '}
              <a
                href={`https://hiveblocks.com/tx/${verify.trxId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit' }}
              >
                view tx ↗
              </a>
            </>
          )}
        </div>
      )}
      {verify.status === 'not-seen' && (
        <div style={noteStyle}>
          Not seen on Hive yet — it may still be queued.
          {verify.account && (
            <>
              {' '}
              <a
                href={`https://hiveblocks.com/@${verify.account}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit' }}
              >
                Check @{verify.account} ↗
              </a>
            </>
          )}
        </div>
      )}
      {verify.status === 'unavailable' && verify.unreachable && (
        <div style={noteStyle}>Couldn't check Hive right now.</div>
      )}
    </ModalWrapper>
  );
}
