import { useState } from 'react';
import { fetchFeedFromUrl } from '../../utils/xmlParser';
import { loadAlbumsFromNostr, loadAlbumByDTag } from '../../utils/nostrSync';
import type { SavedAlbumInfo } from '../../types/nostr';
import type { Album } from '../../types/feed';

interface ImportModalProps {
  onClose: () => void;
  onImport: (xml: string) => void;
  onLoadAlbum: (album: Album) => void;
  isLoggedIn: boolean;
}

export function ImportModal({ onClose, onImport, onLoadAlbum, isLoggedIn }: ImportModalProps) {
  const [mode, setMode] = useState<'file' | 'paste' | 'url' | 'nostr'>('file');
  const [xmlContent, setXmlContent] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [savedAlbums, setSavedAlbums] = useState<SavedAlbumInfo[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);

  const fetchSavedAlbums = async () => {
    setLoadingAlbums(true);
    setError('');
    const result = await loadAlbumsFromNostr();
    setLoadingAlbums(false);

    if (result.success) {
      setSavedAlbums(result.albums);
      if (result.albums.length === 0) {
        setError('No saved albums found on Nostr');
      }
    } else {
      setError(result.message);
    }
  };

  const handleLoadFromNostr = async (dTag: string) => {
    setLoading(true);
    setError('');

    const result = await loadAlbumByDTag(dTag);
    setLoading(false);

    if (result.success && result.album) {
      onLoadAlbum(result.album);
      onClose();
    } else {
      setError(result.message);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setXmlContent(content);
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setError('');
    setLoading(true);

    try {
      let xml = xmlContent;

      if (mode === 'url') {
        xml = await fetchFeedFromUrl(feedUrl);
      }

      if (!xml.trim()) {
        throw new Error('No XML content provided');
      }

      onImport(xml);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import feed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Feed</h2>
          <button className="btn btn-icon" onClick={onClose}>&#10005;</button>
        </div>
        <div className="modal-content">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button
              className={`btn ${mode === 'file' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('file')}
            >
              Upload File
            </button>
            <button
              className={`btn ${mode === 'paste' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('paste')}
            >
              Paste XML
            </button>
            <button
              className={`btn ${mode === 'url' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('url')}
            >
              From URL
            </button>
            {isLoggedIn && (
              <button
                className={`btn ${mode === 'nostr' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setMode('nostr'); fetchSavedAlbums(); }}
              >
                From Nostr
              </button>
            )}
          </div>

          {mode === 'nostr' ? (
            <div className="nostr-load-section">
              {loadingAlbums ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  Loading saved albums...
                </div>
              ) : savedAlbums.length > 0 ? (
                <div className="nostr-album-list">
                  {savedAlbums.map((savedAlbum) => (
                    <div
                      key={savedAlbum.id}
                      className="nostr-album-item"
                      onClick={() => !loading && handleLoadFromNostr(savedAlbum.dTag)}
                    >
                      <div className="nostr-album-item-title">{savedAlbum.title}</div>
                      <div className="nostr-album-item-date">{formatDate(savedAlbum.createdAt)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  {error || 'No saved albums found'}
                </div>
              )}
            </div>
          ) : mode === 'file' ? (
            <div className="form-group">
              <label className="form-label">Select XML File</label>
              <input
                type="file"
                accept=".xml,application/xml,text/xml"
                onChange={handleFileChange}
                style={{ marginBottom: '12px' }}
              />
              {fileName && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Selected: {fileName}
                </div>
              )}
            </div>
          ) : mode === 'paste' ? (
            <div className="form-group">
              <label className="form-label">Paste RSS XML</label>
              <textarea
                className="form-textarea"
                style={{ minHeight: '200px', fontFamily: 'monospace', fontSize: '0.75rem' }}
                placeholder="Paste your RSS feed XML here..."
                value={xmlContent}
                onChange={e => setXmlContent(e.target.value)}
              />
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Feed URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com/feed.xml"
                value={feedUrl}
                onChange={e => setFeedUrl(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div style={{ color: 'var(--error)', marginTop: '12px', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {mode === 'nostr' ? (
            <button className="btn btn-secondary" onClick={fetchSavedAlbums} disabled={loadingAlbums}>
              {loadingAlbums ? 'Loading...' : 'Refresh'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
              {loading ? 'Importing...' : 'Import Feed'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
