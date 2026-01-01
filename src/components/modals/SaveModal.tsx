import { useState } from 'react';
import { generateRssFeed, downloadXml, copyToClipboard } from '../../utils/xmlGenerator';
import { saveAlbumToNostr } from '../../utils/nostrSync';
import type { Album } from '../../types/feed';

interface SaveModalProps {
  onClose: () => void;
  album: Album;
  isDirty: boolean;
  isLoggedIn: boolean;
}

export function SaveModal({ onClose, album, isDirty, isLoggedIn }: SaveModalProps) {
  const [mode, setMode] = useState<'local' | 'download' | 'clipboard' | 'nostr'>('local');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);

    try {
      switch (mode) {
        case 'local':
          localStorage.setItem('msp2-album-data', JSON.stringify(album));
          setMessage({ type: 'success', text: 'Saved to browser storage' });
          break;
        case 'download':
          const xml = generateRssFeed(album);
          const filename = `${album.title || 'feed'}.xml`.replace(/[^a-z0-9.-]/gi, '_');
          downloadXml(xml, filename);
          setMessage({ type: 'success', text: 'Download started' });
          break;
        case 'clipboard':
          const xmlContent = generateRssFeed(album);
          await copyToClipboard(xmlContent);
          setMessage({ type: 'success', text: 'Copied to clipboard' });
          break;
        case 'nostr':
          const result = await saveAlbumToNostr(album, isDirty);
          setMessage({
            type: result.success ? 'success' : 'error',
            text: result.message
          });
          break;
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Save Feed</h2>
          <button className="btn btn-icon" onClick={onClose}>&#10005;</button>
        </div>
        <div className="modal-content">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button
              className={`btn ${mode === 'local' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('local')}
            >
              Local Storage
            </button>
            <button
              className={`btn ${mode === 'download' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('download')}
            >
              Download XML
            </button>
            <button
              className={`btn ${mode === 'clipboard' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('clipboard')}
            >
              Copy to Clipboard
            </button>
            {isLoggedIn && (
              <button
                className={`btn ${mode === 'nostr' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMode('nostr')}
              >
                Save to Nostr
              </button>
            )}
          </div>

          <div className="nostr-album-preview">
            <h3>{album.title || 'Untitled Album'}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {album.author || 'No author'} &bull; {album.tracks.length} track{album.tracks.length !== 1 ? 's' : ''}
            </p>
          </div>

          {mode === 'local' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Save to your browser's local storage. Data persists until you clear browser data.
            </p>
          )}
          {mode === 'download' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Download the RSS feed as an XML file to your computer.
            </p>
          )}
          {mode === 'clipboard' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Copy the RSS XML to your clipboard for pasting elsewhere.
            </p>
          )}
          {mode === 'nostr' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '16px' }}>
              Publish your feed to Nostr relays. Load it later on any device with your Nostr key.
            </p>
          )}

          {message && (
            <div style={{
              color: message.type === 'error' ? 'var(--error)' : 'var(--success)',
              marginTop: '12px',
              fontSize: '0.875rem'
            }}>
              {message.text}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
