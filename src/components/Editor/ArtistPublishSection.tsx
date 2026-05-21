import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useFeed } from '../../store/feedStore';
import { useNostr } from '../../store/nostrStore';
import { hostBothOnMSP, downloadArtistFeedPackage, type HostBothResult } from '../../utils/artistPublish';

const containerStyle: CSSProperties = {
  marginTop: '32px',
  padding: '24px',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08))',
  border: '1px solid rgba(99, 102, 241, 0.3)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '16px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-primary)',
  marginBottom: '8px',
};

const subhead: CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-secondary)',
  marginBottom: '20px',
};

const primaryBtnStyle: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  fontSize: '15px',
  fontWeight: 600,
};

const orRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  margin: '20px 0',
  color: 'var(--text-tertiary)',
  fontSize: '12px',
};

const orLine: CSSProperties = {
  flex: 1,
  height: '1px',
  background: 'rgba(99, 102, 241, 0.25)',
};

const helperText: CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-tertiary)',
  marginTop: '8px',
  marginBottom: 0,
};

const statusBoxStyle: CSSProperties = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '8px',
  fontSize: '13px',
  lineHeight: '1.6',
};

const linkStyle: CSSProperties = {
  color: 'var(--text-primary)',
  wordBreak: 'break-all',
};

export function ArtistPublishSection() {
  const { state } = useFeed();
  const { state: nostrState } = useNostr();
  const [hosting, setHosting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<HostBothResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state.publisherFeed || !state.album) {
    return null;
  }

  const album = state.album;
  const publisherFeed = state.publisherFeed;
  const canHostBoth = nostrState.isLoggedIn && !!nostrState.user?.pubkey;

  const handleHostBoth = async () => {
    if (!canHostBoth || !nostrState.user) return;
    setHosting(true);
    setError(null);
    setResult(null);
    try {
      const r = await hostBothOnMSP(album, publisherFeed, nostrState.user.pubkey, setProgress);
      setResult(r);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to host feeds');
      setProgress(null);
    } finally {
      setHosting(false);
    }
  };

  const handleDownloadPackage = () => {
    downloadArtistFeedPackage(album, publisherFeed);
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span role="img" aria-hidden="true">🚀</span>
        <span>Publish your feeds</span>
      </div>
      <p style={subhead}>
        When your album and publisher info above are filled in, ship them to listeners.
      </p>

      {canHostBoth ? (
        <>
          <button
            className="btn btn-primary"
            style={primaryBtnStyle}
            onClick={handleHostBoth}
            disabled={hosting}
          >
            {hosting ? (progress || 'Hosting...') : 'Host on MSP — album + publisher (one click)'}
          </button>
          <p style={helperText}>
            Uploads both feeds to msp.podtards.com and auto-submits them to Podcast Index. Linked to your Nostr identity for future edits.
          </p>
        </>
      ) : (
        <>
          <button
            className="btn btn-primary"
            style={{ ...primaryBtnStyle, opacity: 0.6, cursor: 'not-allowed' }}
            disabled
          >
            Host on MSP — album + publisher (one click)
          </button>
          <p style={helperText}>
            Log in with Nostr (top-right) to enable one-click hosting + Podcast Index submission for both feeds.
          </p>
        </>
      )}

      <div style={orRow}>
        <div style={orLine} />
        <span>OR</span>
        <div style={orLine} />
      </div>

      <button
        className="btn btn-secondary"
        style={primaryBtnStyle}
        onClick={handleDownloadPackage}
        disabled={hosting}
      >
        Download Feed Package (host yourself)
      </button>
      <p style={helperText}>
        Downloads both XML files plus a next-steps guide. Host them anywhere — GitHub Pages, S3, your own CDN.
      </p>

      {progress && !result && (
        <div style={{ ...statusBoxStyle, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          {progress}
        </div>
      )}

      {result && (
        <div style={{ ...statusBoxStyle, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>
            ✓ Both feeds hosted{result.album.podcastIndexId || result.publisher.podcastIndexId ? ' and submitted to Podcast Index' : ''}.
          </div>
          <div>
            <strong>Album:</strong> <a href={result.album.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{result.album.url}</a>
          </div>
          <div>
            <strong>Publisher:</strong> <a href={result.publisher.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{result.publisher.url}</a>
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...statusBoxStyle, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--text-primary)' }}>
          ✕ {error}
        </div>
      )}
    </div>
  );
}
