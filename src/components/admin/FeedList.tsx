import { useState, useEffect } from 'react';
import { fetchAdminFeeds, deleteFeed } from '../../utils/adminAuth';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface FeedInfo {
  feedId: string;
  title?: string;
  createdAt?: string;
  lastUpdated?: string;
}

interface FeedListProps {
  onError: (error: string) => void;
}

export function FeedList({ onError }: FeedListProps) {
  const [feeds, setFeeds] = useState<FeedInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FeedInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadFeeds = async () => {
    setLoading(true);
    try {
      const result = await fetchAdminFeeds();
      setFeeds(result.feeds);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to load feeds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeeds();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await deleteFeed(deleteTarget.feedId);
      setFeeds(feeds.filter(f => f.feedId !== deleteTarget.feedId));
      setDeleteTarget(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to delete feed');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (timestamp: string | undefined) => {
    if (!timestamp) return '-';
    const date = new Date(parseInt(timestamp));
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (loading) {
    return <div className="admin-loading">Loading feeds...</div>;
  }

  return (
    <div className="admin-feed-list">
      <div className="admin-feed-header">
        <h3>Hosted Feeds ({feeds.length})</h3>
        <button className="btn btn-secondary btn-small" onClick={loadFeeds}>
          Refresh
        </button>
      </div>

      {feeds.length === 0 ? (
        <p className="text-muted">No feeds found.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Feed ID</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map(feed => (
              <tr key={feed.feedId}>
                <td>{feed.title || 'Untitled'}</td>
                <td className="feed-id">{feed.feedId}</td>
                <td>{formatDate(feed.createdAt)}</td>
                <td>{formatDate(feed.lastUpdated)}</td>
                <td>
                  <button
                    className="btn btn-small"
                    style={{ backgroundColor: '#dc3545', color: 'white', border: 'none' }}
                    onClick={() => setDeleteTarget(feed)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          feedId={deleteTarget.feedId}
          title={deleteTarget.title}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {deleting && (
        <div className="admin-loading-overlay">
          Deleting...
        </div>
      )}
    </div>
  );
}
