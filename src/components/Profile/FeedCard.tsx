import { useState } from 'react';
import type { MyHostedFeed } from '../../utils/useMyHostedFeeds';
import { buildHostedUrl } from '../../utils/hostedFeed';

interface FeedCardProps {
  feed: MyHostedFeed;
  onEdit: (feedId: string) => void;
}

// Podcast Index page for a feed: prefer the canonical podcast page when we know the
// PI id, otherwise fall back to a search by the hosted URL (same fallback SaveModal uses).
function podcastIndexHref(feed: MyHostedFeed): string {
  if (feed.podcastIndexId) {
    return `https://podcastindex.org/podcast/${feed.podcastIndexId}`;
  }
  return `https://podcastindex.org/search?q=${encodeURIComponent(buildHostedUrl(feed.feedId))}`;
}

export function FeedCard({ feed, onEdit }: FeedCardProps) {
  const [copied, setCopied] = useState(false);
  const isVideo = feed.medium === 'video';
  const isPublisher = feed.medium === 'publisher';
  const icon = isVideo ? '🎬' : isPublisher ? '📚' : '🎵';
  // Live in-tab RSS view uses the current origin; the copyable URL uses the canonical domain.
  const liveUrl = `${window.location.origin}/api/hosted/${feed.feedId}.xml`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildHostedUrl(feed.feedId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — no-op
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        backgroundColor: 'var(--surface-color)',
      }}
    >
      <span style={{ fontSize: '24px', width: '32px', textAlign: 'center', flexShrink: 0 }}>{icon}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {feed.title || 'Untitled Feed'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
          {feed.author && (
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{feed.author}</span>
          )}
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: isVideo ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
              color: isVideo ? '#a78bfa' : '#60a5fa',
            }}
          >
            {feed.medium || 'music'}
          </span>
          {feed.isDraft && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
              }}
            >
              draft
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-secondary btn-small"
          onClick={handleCopy}
          title="Copy feed URL"
          style={{ fontSize: '12px', padding: '6px 10px' }}
        >
          {copied ? '✓ Copied' : '🔗 Copy URL'}
        </button>
        <a
          className="btn btn-secondary btn-small"
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open RSS feed"
          style={{ fontSize: '12px', padding: '6px 10px' }}
        >
          RSS
        </a>
        <a
          className="btn btn-secondary btn-small"
          href={podcastIndexHref(feed)}
          target="_blank"
          rel="noopener noreferrer"
          title="View on Podcast Index"
          style={{ fontSize: '12px', padding: '6px 10px' }}
        >
          PI
        </a>
        <button
          className="btn btn-primary btn-small"
          onClick={() => onEdit(feed.feedId)}
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}
