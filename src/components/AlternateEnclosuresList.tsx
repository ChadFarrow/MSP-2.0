import { useEffect, useRef } from 'react';
import type { AlternateEnclosure, AlternateEnclosureSource } from '../types/feed';
import { ALTERNATE_ENCLOSURE_MIME_TYPES, createEmptyAlternateEnclosure, guessAlternateEnclosureType } from '../types/feed';
import { detectMediaSize } from '../utils/audioUtils';
import { FIELD_INFO } from '../data/fieldInfo';
import { InfoIcon } from './InfoIcon';
import { Toggle } from './Toggle';

interface AlternateEnclosuresListProps {
  enclosures: AlternateEnclosure[];
  onChange: (enclosures: AlternateEnclosure[]) => void;
}

// The spec caps title and rel at 32 characters.
const SPEC_MAX_LEN = 32;

// Audio versions only for now; video versions (music videos) come later.
// A video version from an imported feed is kept and shown under its own type.
const AUDIO_TYPES = ALTERNATE_ENCLOSURE_MIME_TYPES.filter(t => t.value.startsWith('audio/'));

/**
 * Editor for a track's <podcast:alternateEnclosure> list. Each version has its
 * own type and metadata, and one or more <podcast:source> addresses for the
 * same file. Rows are keyed and updated by `id`, never by index, so an async
 * size lookup that resolves after a removal can't write onto the wrong row.
 */
export function AlternateEnclosuresList({ enclosures, onChange }: AlternateEnclosuresListProps) {
  // Always points at the latest list so the async size lookup (up to ~10 s)
  // doesn't clobber edits made while it was running.
  const enclosuresRef = useRef(enclosures);
  useEffect(() => { enclosuresRef.current = enclosures; });

  // Versions whose type the user chose by hand. A pasted URL only sets the
  // type from its extension while the user hasn't picked one.
  const typeChosen = useRef<Set<string>>(new Set());
  // Per-version URL we last measured, so re-blurring an unchanged URL doesn't refetch.
  const measuredUrls = useRef<Map<string, string>>(new Map());

  const update = (id: string, patch: Partial<AlternateEnclosure>) => {
    onChange(enclosuresRef.current.map(enc => (enc.id === id ? { ...enc, ...patch } : enc)));
  };

  const updateSource = (id: string, sourceIndex: number, patch: Partial<AlternateEnclosureSource>) => {
    const enc = enclosuresRef.current.find(e => e.id === id);
    if (!enc) return;
    update(id, { sources: enc.sources.map((s, i) => (i === sourceIndex ? { ...s, ...patch } : s)) });
  };

  const add = () => {
    onChange([...enclosuresRef.current, createEmptyAlternateEnclosure('audio/mpeg')]);
  };

  const remove = (id: string) => {
    typeChosen.current.delete(id);
    measuredUrls.current.delete(id);
    onChange(enclosuresRef.current.filter(enc => enc.id !== id));
  };

  const addSource = (id: string) => {
    const enc = enclosuresRef.current.find(e => e.id === id);
    if (!enc) return;
    update(id, { sources: [...enc.sources, { uri: '' }] });
  };

  const removeSource = (id: string, sourceIndex: number) => {
    const enc = enclosuresRef.current.find(e => e.id === id);
    if (!enc || enc.sources.length <= 1) return;
    update(id, { sources: enc.sources.filter((_, i) => i !== sourceIndex) });
  };

  // Only one version may be the default. Checking one clears the others.
  const setDefault = (id: string, value: boolean) => {
    onChange(enclosuresRef.current.map(enc => (
      enc.id === id ? { ...enc, default: value } : value ? { ...enc, default: false } : enc
    )));
  };

  // On the first address's blur: guess the type from the extension (unless the
  // user picked one) and measure the file size (unless one is already set).
  const handleFirstSourceBlur = async (id: string, rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;
    const enc = enclosuresRef.current.find(e => e.id === id);
    if (!enc) return;

    if (!typeChosen.current.has(id)) {
      const guessed = guessAlternateEnclosureType(url);
      if (guessed && AUDIO_TYPES.some(t => t.value === guessed) && guessed !== enc.type) update(id, { type: guessed });
    }

    if (enc.length || measuredUrls.current.get(id) === url) return;
    measuredUrls.current.set(id, url);
    const size = await detectMediaSize(url);
    if (size === null) return;
    // Bail if the version was removed, its address changed, or the user typed a
    // size while the request was in flight.
    const current = enclosuresRef.current.find(e => e.id === id);
    if (!current || current.sources[0]?.uri.trim() !== url || current.length) return;
    update(id, { length: String(size) });
  };

  const typeIsListed = (type: string) => AUDIO_TYPES.some(t => t.value === type);

  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label className="form-label">Alternate Versions<InfoIcon text={FIELD_INFO.alternateEnclosures} /></label>
      <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 0.75rem' }}>
        Optional. The main audio file stays the one every app plays. Apps that support{' '}
        <code>&lt;podcast:alternateEnclosure&gt;</code> let listeners pick one of these instead — e.g.{' '}
        a lossless FLAC or a smaller, lower-bitrate copy.
      </p>
      <div className="repeatable-list">
        {enclosures.map((enc, index) => {
          const firstUri = enc.sources[0]?.uri?.trim() || '';
          const hasAnyUri = enc.sources.some(s => s.uri?.trim());
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
                      maxLength={SPEC_MAX_LEN}
                      value={enc.title || ''}
                      onChange={e => update(enc.id, { title: e.target.value || undefined })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">File Type <span className="required">*</span></label>
                    <select
                      className="form-select"
                      aria-label={`Version ${index + 1} file type`}
                      value={enc.type}
                      onChange={e => {
                        typeChosen.current.add(enc.id);
                        update(enc.id, { type: e.target.value });
                      }}
                    >
                      {AUDIO_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                      {/* An imported feed may carry any MIME type. Show it rather
                          than silently snapping the value to the first option. */}
                      {enc.type && !typeIsListed(enc.type) && <option value={enc.type}>{enc.type}</option>}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">File Size (bytes)<InfoIcon text={FIELD_INFO.alternateEnclosureLength} /></label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      placeholder="e.g., 58390859"
                      value={enc.length || ''}
                      onChange={e => update(enc.id, { length: e.target.value.trim() || undefined })}
                    />
                  </div>
                  <div className="form-group full-width">
                    <label className="form-label">
                      File URL <span className="required">*</span>
                      <InfoIcon text={FIELD_INFO.alternateEnclosureSources} />
                    </label>
                    {enc.sources.map((source, sourceIndex) => (
                      <div key={sourceIndex} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                        <input
                          type="url"
                          className="form-input"
                          style={{ flex: '1 1 auto', minWidth: 0 }}
                          aria-label={sourceIndex === 0 ? `Version ${index + 1} URL` : `Version ${index + 1} mirror ${sourceIndex}`}
                          placeholder={sourceIndex === 0
                            ? 'https://example.com/track.flac'
                            : 'Another address for the same file (mirror, IPFS, torrent)'}
                          value={source.uri}
                          onChange={e => updateSource(enc.id, sourceIndex, { uri: e.target.value })}
                          onBlur={sourceIndex === 0 ? e => handleFirstSourceBlur(enc.id, e.target.value) : undefined}
                        />
                        {enc.sources.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-icon btn-danger"
                            aria-label="Remove this address"
                            onClick={() => removeSource(enc.id, sourceIndex)}
                          >
                            &#10005;
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="add-item-btn" onClick={() => addSource(enc.id)} disabled={!hasAnyUri}>
                      + Add mirror for this file
                    </button>
                  </div>
                  <div className="form-group">
                    <Toggle
                      checked={!!enc.default}
                      onChange={val => setDefault(enc.id, val)}
                      label="Same file as the main enclosure"
                      labelSuffix={<InfoIcon text={FIELD_INFO.alternateEnclosureDefault} />}
                    />
                  </div>
                </div>
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem', opacity: 0.8 }}>More options</summary>
                  <div className="form-grid" style={{ marginTop: '0.5rem' }}>
                    <div className="form-group">
                      <label className="form-label">Bitrate (bits/sec)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-input"
                        placeholder="e.g., 320000"
                        value={enc.bitrate || ''}
                        onChange={e => update(enc.id, { bitrate: e.target.value.trim() || undefined })}
                      />
                    </div>
                    {enc.type.startsWith('video/') && (
                      <div className="form-group">
                        <label className="form-label">Video Height (px)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="form-input"
                          placeholder="e.g., 1080"
                          value={enc.height || ''}
                          onChange={e => update(enc.id, { height: e.target.value.trim() || undefined })}
                        />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Language</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g., en-US"
                        value={enc.lang || ''}
                        onChange={e => update(enc.id, { lang: e.target.value.trim() || undefined })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Codecs</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder='e.g., avc1.4D401E,mp4a.40.2'
                        value={enc.codecs || ''}
                        onChange={e => update(enc.id, { codecs: e.target.value.trim() || undefined })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Group (rel)<InfoIcon text={FIELD_INFO.alternateEnclosureRel} /></label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g., music-video"
                        maxLength={SPEC_MAX_LEN}
                        value={enc.rel || ''}
                        onChange={e => update(enc.id, { rel: e.target.value.trim() || undefined })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Integrity<InfoIcon text={FIELD_INFO.alternateEnclosureIntegrity} /></label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <select
                          className="form-select"
                          style={{ flex: '0 0 auto' }}
                          aria-label="Integrity type"
                          value={enc.integrity?.type || 'sri'}
                          onChange={e => update(enc.id, {
                            integrity: { type: e.target.value as 'sri' | 'pgp-signature', value: enc.integrity?.value || '' }
                          })}
                        >
                          <option value="sri">SRI hash</option>
                          <option value="pgp-signature">PGP signature</option>
                        </select>
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: '1 1 160px', minWidth: 0 }}
                          placeholder="sha384-..."
                          value={enc.integrity?.value || ''}
                          onChange={e => update(enc.id, {
                            integrity: e.target.value.trim()
                              ? { type: enc.integrity?.type || 'sri', value: e.target.value.trim() }
                              : undefined
                          })}
                        />
                      </div>
                    </div>
                  </div>
                </details>
                {firstUri && enc.type.startsWith('video/') && (
                  <video
                    key={firstUri}
                    src={firstUri}
                    controls
                    preload="metadata"
                    style={{ width: '100%', marginTop: '8px', maxHeight: '200px' }}
                    onError={e => { (e.target as HTMLVideoElement).style.display = 'none'; }}
                  />
                )}
                {firstUri && enc.type.startsWith('audio/') && (
                  <audio
                    key={firstUri}
                    src={firstUri}
                    controls
                    preload="none"
                    style={{ width: '100%', marginTop: '8px' }}
                    onError={e => { (e.target as HTMLAudioElement).style.display = 'none'; }}
                  />
                )}
              </div>
              <div className="repeatable-item-actions">
                <button
                  type="button"
                  className="btn btn-icon btn-danger"
                  aria-label={`Remove version ${index + 1}`}
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
