import { useState, useEffect, useRef } from 'react';
import { ModalWrapper } from './ModalWrapper';
import { getHostedFeedInfo, buildHostedUrl } from '../../utils/hostedFeed';
import { getFeedUrlError } from '../../utils/urlValidation';
import { useFeedReachability } from '../../hooks/useFeedReachability';
import { isGuardRefusal } from '../../utils/feedReachability';

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
  /** True when we couldn't reach Hive at all — distinct from "not configured". */
  unreachable?: boolean;
}

export function PodpingModal({ onClose, feedGuid, medium }: PodpingModalProps) {
  const [podpingUrl, setPodpingUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  /** Set when the server refused the ping as unreachable; drives the override button. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' });
  const [verifyJob, setVerifyJob] = useState<{ url: string; id: number; since: number } | null>(null);
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
        // `since` scopes the check to this send — without it a podping for the same
        // feed from an hour ago would match on the first poll and report success.
        const response = await fetch(
          `/api/podping-verify?url=${encodeURIComponent(verifyJob.url)}&since=${verifyJob.since}`,
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
          setVerify({ status: 'landed' });
          return;
        }

        if (attempt >= VERIFY_MAX_ATTEMPTS) {
          setVerify({ status: 'not-seen' });
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
    setRefusal(null);
  };

  const handleSubmit = async (force = false) => {
    const url = podpingUrl.trim();
    if (!url) {
      setMessage({ type: 'error', text: 'Please enter a feed URL' });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setRefusal(null);
    setVerifyJob(null);
    setVerify({ status: 'idle' });

    try {
      const body: { url: string; reason: string; medium?: string; force?: boolean } = {
        url,
        reason: 'update'
      };
      if (medium) body.medium = medium;
      if (force) body.force = true;
      const response = await fetch('/api/podping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: response.statusText }));
        // The guard refused: offer the override rather than a dead end.
        if (isGuardRefusal(data)) {
          setRefusal(data.error);
          return;
        }
        throw new Error(data.error || 'Podping failed');
      }
      // Never a clean ✅ when the user overrode a refusal — that's the exact
      // "we said it worked" failure this guard exists to stop.
      setMessage({
        type: 'success',
        text: force
          ? 'Podping sent — but the feed was unreachable when we checked, so indexers may not be able to fetch it.'
          : 'Podping sent.'
      });
      verifyJobId.current += 1;
      setVerify({ status: 'checking' });
      setVerifyJob({ url, id: verifyJobId.current, since: Date.now() });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Podping failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const urlError = getFeedUrlError(podpingUrl.trim());
  // Advisory only — a podping to an unreachable feed still sends. See feedReachability.ts.
  const { warning: reachWarning } = useFeedReachability(podpingUrl.trim(), !urlError);
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
            onClick={() => handleSubmit()}
            disabled={submitting || !podpingUrl.trim() || !!urlError}
          >
            {submitting ? 'Sending…' : 'Send Podping'}
          </button>
          {refusal && (
            <button
              className="btn btn-secondary"
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              title="Send the podping even though the feed looks unreachable"
            >
              Send anyway
            </button>
          )}
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
        {!urlError && reachWarning && (
          <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--warning, #f59e0b)' }}>
            ⚠️ {reachWarning}
          </div>
        )}
      </div>
      {refusal && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid var(--warning, #f59e0b)',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fontSize: '0.85rem',
          color: 'var(--text-primary)'
        }}>
          <strong>Not sent.</strong> {refusal}
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            If you're sure the feed is fine, use <strong>Send anyway</strong> below.
          </div>
        </div>
      )}
      {message && (
        <div style={{
          color: message.type === 'error' ? 'var(--error)' : 'var(--success)',
          marginTop: '12px',
          fontSize: '0.875rem'
        }}>
          {message.type === 'success' ? `✅ ${message.text}` : message.text}
        </div>
      )}
      {verify.status === 'checking' && (
        <div style={noteStyle}>Checking Hive…</div>
      )}
      {verify.status === 'landed' && (
        <div style={{ ...noteStyle, color: 'var(--success)' }}>
          ✅ Podping received
        </div>
      )}
      {verify.status === 'not-seen' && (
        <div style={noteStyle}>
          Not received yet — it may still be queued.
        </div>
      )}
      {verify.status === 'unavailable' && verify.unreachable && (
        <div style={noteStyle}>Couldn't check Hive right now.</div>
      )}
    </ModalWrapper>
  );
}
