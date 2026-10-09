import { useEffect, useRef } from 'react';
import type { AlternateEnclosure } from '../types/feed';
import { createEmptyAlternateEnclosure } from '../types/feed';
import { detectMediaSize, getAudioMimeType, isKnownAudioFormat } from '../utils/audioUtils';
import { getVideoMimeType } from '../utils/videoUtils';
import { FIELD_INFO } from '../data/fieldInfo';
import { InfoIcon } from './InfoIcon';

interface AlternateEnclosuresListProps {
  enclosures: AlternateEnclosure[];
  onChange: (enclosures: AlternateEnclosure[]) => void;
}

// The spec caps title at 32 characters.
const TITLE_MAX_LEN = 32;

// Every type getAudioMimeType() can produce, so a type set from the URL
// always has its own entry in the dropdown.
const AUDIO_TYPES: { value: string; label: string }[] = [
  { value: 'audio/mpeg', label: 'MP3' },
  { value: 'audio/flac', label: 'FLAC' },
  { value: 'audio/x-m4a', label: 'M4A' },
  { value: 'audio/aac', label: 'AAC' },
  { value: 'audio/mp4', label: 'MP4 audio (M4B)' },
  { value: 'audio/ogg', label: 'OGG' },
  { value: 'audio/opus', label: 'Opus' },
  { value: 'audio/wav', label: 'WAV' },
  { value: 'audio/aiff', label: 'AIFF' },
  { value: 'audio/x-ms-wma', label: 'WMA' },
];

/**
 * Editor for a track's <podcast:alternateEnclosure> list: a title, file type,
 * file size and URL per version. The type follows the URL's extension until
 * the user picks one, and the size is measured from the host. Rows are keyed
 * and updated by `id`, never by index, so an async size lookup that resolves
 * after a removal can't write onto the wrong row.
 *
 * Attributes the editor has no field for (default, rel, bitrate, integrity,
 * extra sources...) are kept from an imported feed and written back as is.
 */
export function AlternateEnclosuresList({ enclosures, onChange }: AlternateEnclosuresListProps) {
  // Always points at the latest list so the async size lookup (up to ~10 s)
  // doesn't clobber edits made while it was running.
  const enclosuresRef = useRef(enclosures);
  useEffect(() => { enclosuresRef.current = enclosures; });

  // Versions whose type the user picked by hand; the URL no longer sets it.
  const typeChosen = useRef<Set<string>>(new Set());

  const update = (id: string, patch: Partial<AlternateEnclosure>) => {
    onChange(enclosuresRef.current.map(enc => (enc.id === id ? { ...enc, ...patch } : enc)));
  };

  // As for the main file, the type follows the URL's extension — but only a
  // recognized one, and only until the user picks a type. A video version from
  // an imported feed keeps a video type.
  const setUrl = (id: string, url: string) => {
    const enc = enclosuresRef.current.find(e => e.id === id);
    if (!enc) return;
    const [first, ...rest] = enc.sources;
    const changed = (first?.uri || '').trim() !== url.trim();
    const patch: Partial<AlternateEnclosure> = { sources: [{ ...first, uri: url }, ...rest] };
    if (url.trim() && !typeChosen.current.has(id)) {
      if (enc.type.startsWith('video/')) patch.type = getVideoMimeType(url);
      else if (isKnownAudioFormat(url)) patch.type = getAudioMimeType(url);
    }
    // A size belongs to the file it was measured from.
    if (changed) patch.length = undefined;
    update(id, patch);
  };

  // Measure the file on paste or blur. Unlike the main file there is no
  // estimate: length is optional here, and an estimate from the main file's
  // duration would be wrong for a lossless or low-bitrate copy.
  const measure = async (id: string, rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url.startsWith('http')) return;
    const enc = enclosuresRef.current.find(e => e.id === id);
    if (!enc || enc.length) return;
    const size = await detectMediaSize(url);
    if (size === null) return;
    // Bail if the version was removed or its URL changed while measuring.
    const current = enclosuresRef.current.find(e => e.id === id);
    if (!current || current.sources[0]?.uri.trim() !== url) return;
    update(id, { length: String(size) });
  };

  const add = () => {
    onChange([...enclosuresRef.current, createEmptyAlternateEnclosure('audio/mpeg')]);
  };

  const remove = (id: string) => {
    typeChosen.current.delete(id);
    onChange(enclosuresRef.current.filter(enc => enc.id !== id));
  };

  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label className="form-label">Alternate Versions<InfoIcon text={FIELD_INFO.alternateEnclosures} /></label>
      <div className="repeatable-list">
        {enclosures.map((enc, index) => {
          const url = enc.sources[0]?.uri || '';
          const isVideoVersion = enc.type.startsWith('video/');
          return (
            <div key={enc.id} className="repeatable-item">
              <div className="repeatable-item-content">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Title<InfoIcon text={FIELD_INFO.alternateEnclosureTitle} /></label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Lossless"
                      maxLength={TITLE_MAX_LEN}
                      value={enc.title || ''}
                      onChange={e => update(enc.id, { title: e.target.value || undefined })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">File Type <span className="required">*</span></label>
                    <select
                      className="form-select"
                      aria-label={`Alternate version ${index + 1} file type`}
                      value={enc.type}
                      onChange={e => {
                        typeChosen.current.add(enc.id);
                        update(enc.id, { type: e.target.value });
                      }}
                    >
                      {AUDIO_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                      {/* An imported feed may carry any type (a video version, an
                          unusual MIME). Show it rather than snapping to MP3. */}
                      {!AUDIO_TYPES.some(t => t.value === enc.type) && (
                        <option value={enc.type}>{enc.type}</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">File Size (bytes)<InfoIcon text={FIELD_INFO.alternateEnclosureLength} /></label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      placeholder="e.g., 31200000"
                      value={enc.length || ''}
                      onChange={e => update(enc.id, { length: e.target.value.trim() || undefined })}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">
                    {isVideoVersion ? 'Video URL' : 'Audio URL'} <span className="required">*</span>
                  </label>
                  <input
                    type="url"
                    className="form-input"
                    aria-label={`Alternate version ${index + 1} URL`}
                    placeholder="https://example.com/track.flac"
                    value={url}
                    onChange={e => setUrl(enc.id, e.target.value)}
                    onPaste={e => {
                      const pasted = e.clipboardData.getData('text').trim();
                      if (!pasted.startsWith('http')) return;
                      e.preventDefault();
                      setUrl(enc.id, pasted);
                      measure(enc.id, pasted);
                    }}
                    onBlur={e => measure(enc.id, e.target.value)}
                  />
                  {!isVideoVersion && url.trim() && !isKnownAudioFormat(url) && (
                    <div style={{ color: 'var(--warning, #b8860b)', fontSize: '0.85em', marginTop: '4px' }}>
                      URL doesn't end with a recognized audio extension (mp3, flac, wav, m4a, aac, ogg, opus, aiff). Podcast apps may not play it.
                    </div>
                  )}
                  {enc.sources.length > 1 && (
                    <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '4px' }}>
                      The imported feed also lists {enc.sources.length - 1} more address{enc.sources.length > 2 ? 'es' : ''} for this file. MSP keeps {enc.sources.length > 2 ? 'them' : 'it'} unchanged.
                    </div>
                  )}
                  {url.trim() && (
                    isVideoVersion ? (
                      <video
                        key={url}
                        src={url}
                        controls
                        preload="metadata"
                        style={{ width: '100%', marginTop: '8px', maxHeight: '300px' }}
                        onError={e => { (e.target as HTMLVideoElement).style.display = 'none'; }}
                      />
                    ) : (
                      <audio
                        key={url}
                        src={url}
                        controls
                        preload="none"
                        style={{ width: '100%', marginTop: '8px' }}
                        onError={e => { (e.target as HTMLAudioElement).style.display = 'none'; }}
                      />
                    )
                  )}
                </div>
              </div>
              <div className="repeatable-item-actions">
                <button
                  type="button"
                  className="btn btn-icon btn-danger"
                  aria-label={`Remove alternate version ${index + 1}`}
                  onClick={() => remove(enc.id)}
                >
                  &#10005;
                </button>
              </div>
            </div>
          );
        })}
        <button type="button" className="add-item-btn" onClick={add}>
          + Add Alternate Version
        </button>
      </div>
    </div>
  );
}
