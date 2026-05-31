import { useState, useRef } from 'react';
import { useNostr } from '../store/nostrStore';
import { uploadMediaToBlossom } from '../utils/blossom';

interface BlossomFileUploadProps {
  accept: string;
  onUploaded: (result: { url: string; file: File }) => void;
  label?: string;
}

export function BlossomFileUpload({ accept, onUploaded, label = 'Upload to Blossom' }: BlossomFileUploadProps) {
  const { state: nostrState } = useNostr();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [partial, setPartial] = useState<{ succeeded: number; total: number } | null>(null);
  const lastFileRef = useRef<File | null>(null);

  // The URL field above this control is enough for logged-out users.
  if (!nostrState.isLoggedIn) return null;

  const doUpload = async (file: File) => {
    lastFileRef.current = file;
    setUploading(true);
    setError(null);
    setSuccess(false);
    setPartial(null);
    try {
      const result = await uploadMediaToBlossom(file);
      if (result.success && result.url) {
        onUploaded({ url: result.url, file });
        setSuccess(true);
        if (result.serversSucceeded < result.serversTotal) {
          setPartial({ succeeded: result.serversSucceeded, total: result.serversTotal });
        }
      } else {
        setError(result.message);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    doUpload(file);
  };

  return (
    <div style={{ marginTop: '6px' }}>
      <label className="form-label" style={{ fontSize: '0.85em', marginBottom: '4px' }}>{label}</label>
      <input
        type="file"
        accept={accept}
        disabled={uploading}
        style={{ display: 'block', width: '100%', fontSize: '0.9em' }}
        onChange={handleChange}
      />
      {uploading && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginTop: '4px' }}>
          Uploading to Blossom servers…
        </div>
      )}
      {error && (
        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--error)', fontSize: '0.85em' }}>{error}</span>
          <button
            type="button"
            className="btn-secondary"
            style={{
              fontSize: '0.8em',
              padding: '2px 10px',
              cursor: 'pointer',
              border: '1px solid var(--border-color, #ccc)',
              borderRadius: '4px',
              background: 'transparent',
              color: 'inherit',
            }}
            onClick={() => { if (lastFileRef.current) doUpload(lastFileRef.current); }}
          >
            Retry
          </button>
        </div>
      )}
      {success && (
        <div style={{ color: 'var(--success, #2d7a2d)', fontSize: '0.85em', marginTop: '4px' }}>
          Uploaded — URL filled in
          {partial && (
            <span style={{ color: 'var(--text-secondary)' }}>
              {' '}· Hosted on {partial.succeeded} of {partial.total} servers
            </span>
          )}
        </div>
      )}
    </div>
  );
}
