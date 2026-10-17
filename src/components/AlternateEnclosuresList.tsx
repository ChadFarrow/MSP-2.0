import { useEffect, useRef } from 'react';
import type { AlternateEnclosure } from '../types/feed';
import { createEmptyAlternateEnclosure } from '../types/feed';
import { AUDIO_FILE_TYPES, isKnownAudioFormat } from '../utils/audioUtils';
import { createSizeMeasurer, typeChange, urlChange } from '../utils/alternateEnclosure';
import { FIELD_INFO } from '../data/fieldInfo';
import { InfoIcon } from './InfoIcon';

interface AlternateEnclosuresListProps {
  enclosures: AlternateEnclosure[];
  onChange: (enclosures: AlternateEnclosure[]) => void;
}

// The spec caps title at 32 characters.
const TITLE_MAX_LEN = 32;

/**
 * Editor for a track's <podcast:alternateEnclosure> list: a title, file type,
 * file size and URL per version. The type follows the URL's extension until
 * the user picks one, and the size is measured from the host. Rows are keyed
 * and updated by `id`, never by index. The rules live in
 * utils/alternateEnclosure.ts, where they are unit-tested.
 *
 * Attributes the editor has no field for (default, rel, bitrate, integrity,
 * extra sources...) are kept from an imported feed and written back as is.
 */
export function AlternateEnclosuresList({ enclosures, onChange }: AlternateEnclosuresListProps) {
  // The latest list and onChange. A size lookup lands up to ~10 s after it
  // starts, when the props it closed over are stale: the list may have changed,
  // and the track moved, so the old onChange would write to the wrong index.
  const enclosuresRef = useRef(enclosures);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    enclosuresRef.current = enclosures;
    onChangeRef.current = onChange;
  });

  // False once unmounted (track collapsed or removed, another feed loaded). A
  // lookup that lands then must not write: this instance's list is stale, and
  // a new instance may already hold newer edits.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Writes the ref through, so a second call in the same event (paste sets the
  // URL, then measures) sees the first one's change before React re-renders.
  const commit = (next: AlternateEnclosure[]) => {
    enclosuresRef.current = next;
    onChangeRef.current(next);
  };
  const update = (id: string, patch: Partial<AlternateEnclosure>) =>
    commit(enclosuresRef.current.map(enc => (enc.id === id ? { ...enc, ...patch } : enc)));

  // One measurer per instance, made on first use (from an event handler, never
  // during render), so its in-flight set spans every call. It reads only the
  // refs above, so it never goes stale. Unlike the main file there is no size
  // estimate: length is optional here, and one from the main file's duration
  // would be wrong for a lossless or low-bitrate copy.
  const measurer = useRef<ReturnType<typeof createSizeMeasurer> | null>(null);
  const measure = (id: string, url: string) => {
    measurer.current ??= createSizeMeasurer({
      latest: () => enclosuresRef.current,
      active: () => mounted.current,
      write: (versionId, length) => update(versionId, { length })
    });
    return measurer.current(id, url);
  };

  const setUrl = (id: string, url: string) => {
    const enc = enclosuresRef.current.find(e => e.id === id);
    if (enc) update(id, urlChange(enc, url));
  };

  const add = () => commit([...enclosuresRef.current, createEmptyAlternateEnclosure()]);
  const remove = (id: string) => commit(enclosuresRef.current.filter(enc => enc.id !== id));

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
                      onChange={e => update(enc.id, typeChange(enc, e.target.value))}
                    >
                      {AUDIO_FILE_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                      {/* An imported feed may carry any type (a video version, an
                          unusual MIME). Show it rather than snapping to MP3. */}
                      {!AUDIO_FILE_TYPES.some(t => t.value === enc.type) && (
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
