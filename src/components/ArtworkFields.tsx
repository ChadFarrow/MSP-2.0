import { useState } from 'react';
import { FIELD_INFO } from '../data/fieldInfo';
import { InfoIcon } from './InfoIcon';
import { BlossomFileUpload } from './BlossomFileUpload';

interface ArtworkFieldsProps {
  imageUrl: string | undefined;
  imageTitle: string | undefined;
  imageDescription: string | undefined;
  onUpdate: (field: 'imageUrl' | 'imageTitle' | 'imageDescription', value: string) => void;
  urlLabel?: string;
  urlPlaceholder?: string;
  titlePlaceholder?: string;
  previewAlt?: string;
  /** When true, the URL input and the Blossom upload become an either/or toggle
      instead of both showing at once. Opt-in (used by the onboarding wizard);
      the main editor keeps both coexisting. */
  toggleSource?: boolean;
}

export function ArtworkFields({
  imageUrl,
  imageTitle,
  imageDescription,
  onUpdate,
  urlLabel = 'Image URL',
  urlPlaceholder = 'https://example.com/image.jpg',
  titlePlaceholder = 'Image description',
  previewAlt = 'Image preview',
  toggleSource = false
}: ArtworkFieldsProps) {
  // Default to "Upload" for a fresh field; if a URL is already set, start on URL
  // so the user sees their existing value.
  const [source, setSource] = useState<'upload' | 'url'>(imageUrl ? 'url' : 'upload');
  // In toggle mode the label shouldn't say "URL" (it may be an upload).
  const fieldLabel = toggleSource ? urlLabel.replace(/\s*URL$/i, '') : urlLabel;

  const urlInput = (
    <input
      type="url"
      className="form-input"
      placeholder={urlPlaceholder}
      value={imageUrl || ''}
      onChange={e => onUpdate('imageUrl', e.target.value)}
    />
  );
  const uploadInput = (
    <BlossomFileUpload accept="image/*" onUploaded={({ url }) => onUpdate('imageUrl', url)} />
  );

  return (
    <div className="form-grid">
      <div className="form-group">
        <label className="form-label">{fieldLabel} <span className="required">*</span><InfoIcon text={FIELD_INFO.imageUrl} /></label>
        {toggleSource ? (
          <>
            <div className="source-radios" role="radiogroup" aria-label={`${fieldLabel} source`}>
              <label className="source-radio">
                <input
                  type="radio"
                  name={`art-source-${urlLabel}`}
                  checked={source === 'upload'}
                  onChange={() => setSource('upload')}
                />
                Upload a file
              </label>
              <label className="source-radio">
                <input
                  type="radio"
                  name={`art-source-${urlLabel}`}
                  checked={source === 'url'}
                  onChange={() => setSource('url')}
                />
                Paste a URL
              </label>
            </div>
            {source === 'url' ? urlInput : uploadInput}
          </>
        ) : (
          <>
            {urlInput}
            {uploadInput}
          </>
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
