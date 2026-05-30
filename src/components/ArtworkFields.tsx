import { useState } from 'react';
import { FIELD_INFO } from '../data/fieldInfo';
import { InfoIcon } from './InfoIcon';
import { useNostr } from '../store/nostrStore';
import { uploadMediaToBlossom } from '../utils/blossom';

interface ArtworkFieldsProps {
  imageUrl: string | undefined;
  imageTitle: string | undefined;
  imageDescription: string | undefined;
  onUpdate: (field: 'imageUrl' | 'imageTitle' | 'imageDescription', value: string) => void;
  urlLabel?: string;
  urlPlaceholder?: string;
  titlePlaceholder?: string;
  previewAlt?: string;
}

export function ArtworkFields({
  imageUrl,
  imageTitle,
  imageDescription,
  onUpdate,
  urlLabel = 'Image URL',
  urlPlaceholder = 'https://example.com/image.jpg',
  titlePlaceholder = 'Image description',
  previewAlt = 'Image preview'
}: ArtworkFieldsProps) {
  const { state: nostrState } = useNostr();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const result = await uploadMediaToBlossom(file);
      if (result.success && result.url) {
        onUpdate('imageUrl', result.url);
        setUploadSuccess(true);
      } else {
        setUploadError(result.message);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="form-grid">
      <div className="form-group">
        <label className="form-label">{urlLabel} <span className="required">*</span><InfoIcon text={FIELD_INFO.imageUrl} /></label>
        <input
          type="url"
          className="form-input"
          placeholder={urlPlaceholder}
          value={imageUrl || ''}
          onChange={e => onUpdate('imageUrl', e.target.value)}
        />
        {nostrState.isLoggedIn && (
          <div style={{ marginTop: '6px' }}>
            <label className="form-label" style={{ fontSize: '0.85em', marginBottom: '4px' }}>Upload to Blossom</label>
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              style={{ display: 'block', width: '100%', fontSize: '0.9em' }}
              onChange={handleFileChange}
            />
            {uploading && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginTop: '4px' }}>
                Uploading to Blossom servers...
              </div>
            )}
            {uploadError && (
              <div style={{ color: 'var(--error)', fontSize: '0.85em', marginTop: '4px' }}>
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div style={{ color: 'var(--success, #2d7a2d)', fontSize: '0.85em', marginTop: '4px' }}>
                Uploaded — URL filled in
              </div>
            )}
          </div>
        )}
      </div>
      <div className="form-group">
        <label className="form-label">Image Title<InfoIcon text={FIELD_INFO.imageTitle} /></label>
        <input
          type="text"
          className="form-input"
          placeholder={titlePlaceholder}
          value={imageTitle || ''}
          onChange={e => onUpdate('imageTitle', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Image Description<InfoIcon text={FIELD_INFO.imageDescription} /></label>
        <input
          type="text"
          className="form-input"
          placeholder="Optional description"
          value={imageDescription || ''}
          onChange={e => onUpdate('imageDescription', e.target.value)}
        />
      </div>
      {imageUrl && (
        <div className="form-group full-width">
          <img
            src={imageUrl}
            alt={previewAlt}
            style={{ maxWidth: '200px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
            onError={e => (e.target as HTMLImageElement).style.display = 'none'}
          />
        </div>
      )}
    </div>
  );
}
