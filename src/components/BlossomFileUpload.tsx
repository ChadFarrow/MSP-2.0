import { useState } from 'react';
import { useNostr } from '../store/nostrStore';
import { uploadMediaToBlossom } from '../utils/blossom';

interface BlossomFileUploadProps {
  accept: string;
  onUrl: (url: string) => void;
  label?: string;
}

export function BlossomFileUpload({ accept, onUrl, label = 'Upload to Blossom' }: BlossomFileUploadProps) {
  const { state: nostrState } = useNostr();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!nostrState.isLoggedIn) return null;

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await uploadMediaToBlossom(file);
      if (result.success && result.url) {
        onUrl(result.url);
        setSuccess(true);
      } else {
        setError(result.message);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
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
          Uploading to Blossom servers...
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--error)', fontSize: '0.85em', marginTop: '4px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ color: 'var(--success, #2d7a2d)', fontSize: '0.85em', marginTop: '4px' }}>
          Uploaded — URL filled in
        </div>
      )}
    </div>
  );
}
