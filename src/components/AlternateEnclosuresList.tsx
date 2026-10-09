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

/**
 * Editor for a track's <podcast:alternateEnclosure> list. An alternate version
 * is a second copy of the track, so each row matches the main file field: one
 * URL, with the type taken from its extension and the size measured from the
 * host. Rows are keyed and updated by `id`, never by index, so an async size
 * lookup that resolves after a removal can't write onto the wrong row.
 *
 * Attributes the editor has no field for (title, default, rel, integrity,
 * extra sources...) are kept from an imported feed and written back as is.
 */
export function AlternateEnclosuresList({ enclosures, onChange }: AlternateEnclosuresListProps) {
  // Always points at the latest list so the async size lookup (up to ~10 s)
  // doesn't clobber edits made while it was running.
  const enclosuresRef = useRef(enclosures);
  useEffect(() => { enclosuresRef.current = enclosures; });

  const update = (id: string, patch: Partial<AlternateEnclosure>) => {
    onChange(enclosuresRef.current.map(enc => (enc.id === id ? { ...enc, ...patch } : enc)));
  };

  // Same rule as the main file: the type follows the URL's extension. A video
  // version from an imported feed keeps a video type.
  const setUrl = (id: string, url: string) => {
    const enc = enclosuresRef.current.find(e => e.id === id);
    if (!enc) return;
    const [first, ...rest] = enc.sources;
    const changed = (first?.uri || '').trim() !== url.trim();
    const patch: Partial<AlternateEnclosure> = { sources: [{ ...first, uri: url }, ...rest] };
    if (url.trim()) patch.type = enc.type.startsWith('video/') ? getVideoMimeType(url) : getAudioMimeType(url);
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
                <div className="form-group">
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
