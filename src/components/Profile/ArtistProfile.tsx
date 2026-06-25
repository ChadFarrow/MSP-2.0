import { useEffect } from 'react';
import type { UseMyHostedFeedsResult } from '../../utils/useMyHostedFeeds';
import { ProfileHeader } from './ProfileHeader';
import { FeedCard } from './FeedCard';

interface ArtistProfileProps {
  // The shared hosted-feeds state, lifted to App so the auto-route decision and this
  // page use a single fetch.
  feedsState: UseMyHostedFeedsResult;
  fallbackName?: string;
  onEditFeed: (feedId: string) => void;
  onAddAlbum: () => void;
  onOpenEditor: () => void;
}

export function ArtistProfile({ feedsState, fallbackName, onEditFeed, onAddAlbum, onOpenEditor }: ArtistProfileProps) {
  const { feeds, loading, error, hasFetched, refetch } = feedsState;

  // If the page is opened directly (e.g. via the hamburger) before any lookup ran,
  // fetch once.
  useEffect(() => {
    if (!hasFetched && !loading) {
      void refetch();
    }
  }, [hasFetched, loading, refetch]);

  return (
    // flex:1 + internal scroll so the page fills the space between header and the
    // bottom toolbar (the toolbar stays pinned to the bottom of the viewport).
    <div style={{ flex: 1, overflowY: 'auto', width: '100%' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px' }}>
        <ProfileHeader fallbackName={fallbackName} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0 }}>My Feeds</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={onAddAlbum}>
            + New Album
          </button>
          <button
            className="btn btn-secondary"
            onClick={onOpenEditor}
            title="Close profile"
            aria-label="Close profile"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {loading && (
        <p style={{ color: 'var(--text-secondary)' }}>Loading your feeds…</p>
      )}

      {!loading && error && (
        <div style={{ marginBottom: '12px' }}>
          <p style={{ color: 'var(--danger-color, #ef4444)', marginBottom: '8px' }}>{error}</p>
          <button className="btn btn-secondary btn-small" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && feeds.length === 0 && (
        <div
          style={{
            border: '1px dashed var(--border-color)',
            borderRadius: '10px',
            padding: '28px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          <p style={{ marginTop: 0 }}>You haven't hosted any feeds yet.</p>
          <button className="btn btn-primary" onClick={onAddAlbum}>
            + Create your first album
          </button>
        </div>
      )}

      {!loading && !error && feeds.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {feeds.map(feed => (
            <FeedCard key={feed.feedId} feed={feed} onEdit={onEditFeed} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
