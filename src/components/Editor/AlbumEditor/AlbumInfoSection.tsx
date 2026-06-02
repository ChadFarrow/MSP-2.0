import { useState, useEffect } from 'react';
import type { Album } from '../../../types/feed';
import type { FeedAction } from '../../../store/feedStore';
import { LANGUAGES, isVideoMedium } from '../../../types/feed';
import { FIELD_INFO } from '../../../data/fieldInfo';
import { InfoIcon } from '../../InfoIcon';
import { Section } from '../../Section';
import { Toggle } from '../../Toggle';

function Op3StatsLink({ podcastGuid }: { podcastGuid: string }) {
  const [hasStats, setHasStats] = useState<boolean | null>(null);
  // Reset to the loading state during render when the guid changes, instead of
  // calling setState synchronously inside the effect (avoids cascading renders).
  const [statsGuid, setStatsGuid] = useState(podcastGuid);
  if (statsGuid !== podcastGuid) {
    setStatsGuid(podcastGuid);
    setHasStats(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/op3check?guid=${encodeURIComponent(podcastGuid)}`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setHasStats(data.hasStats === true); })
      .catch(() => { if (!cancelled) setHasStats(false); });
    return () => { cancelled = true; };
  }, [podcastGuid]);

  const link = (
    <a
      href={`https://op3.dev/show/${podcastGuid}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}
    >here</a>
  );

  return (
    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
      {hasStats === null
        ? 'Checking OP3 stats...'
        : hasStats
          ? <>View your OP3 stats {link}.</>
          : <>Once OP3 has observed a few days of downloads, stats will be available {link}.</>
      }
    </p>
  );
}

interface AlbumInfoSectionProps {
  album: Album;
  dispatch: React.Dispatch<FeedAction>;
  /** In Artist mode the OP3 toggle + Podcast GUID are hidden (auto-managed). */
  isArtistMode?: boolean;
  isLoggedIn?: boolean;
  userNpub?: string;
}

export function AlbumInfoSection({ album, dispatch, isArtistMode = false, isLoggedIn = false, userNpub }: AlbumInfoSectionProps) {
  const isVideo = isVideoMedium(album.medium);
  return (
    <Section title={isVideo ? 'Video Info' : 'Album Info'} icon={isVideo ? '🎬' : '💿'}>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Artist/Band <span className="required">*</span><InfoIcon text={FIELD_INFO.author} /></label>
          <input
            type="text"
            className="form-input"
            placeholder="Enter artist or band name"
            value={album.author || ''}
            onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { author: e.target.value } })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{isVideo ? 'Video Title' : 'Album Title'} <span className="required">*</span><InfoIcon text={FIELD_INFO.title} /></label>
          <input
            type="text"
            className="form-input"
            placeholder={isVideo ? 'Enter video title' : 'Enter album title'}
            value={album.title || ''}
            onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { title: e.target.value } })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Website<InfoIcon text={FIELD_INFO.link} /></label>
          <input
            type="url"
            className="form-input"
            placeholder="https://yourband.com"
            value={album.link || ''}
            onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { link: e.target.value } })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Language <span className="required">*</span><InfoIcon text={FIELD_INFO.language} /></label>
          <select
            className="form-select"
            value={album.language || 'en'}
            onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { language: e.target.value } })}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingTop: '28px', gap: '10px' }}>
          <Toggle
            checked={album.explicit}
            onChange={val => dispatch({ type: 'UPDATE_ALBUM', payload: { explicit: val } })}
            label="Explicit Content"
            labelSuffix={<InfoIcon text={FIELD_INFO.explicit} />}
          />
          {/* OP3 analytics hidden in Artist mode — keep first-time setup minimal */}
          {!isArtistMode && (
            <Toggle
              checked={album.op3}
              onChange={val => dispatch({ type: 'UPDATE_ALBUM', payload: { op3: val } })}
              label={<>
                <a
                  href="https://op3.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}
                  title="Learn more at op3.dev"
                >OP3</a> Analytics
              </>}
              labelSuffix={<InfoIcon text={FIELD_INFO.op3} />}
            />
          )}
          {!isArtistMode && album.op3 && album.podcastGuid && (
            <Op3StatsLink podcastGuid={album.podcastGuid} />
          )}
        </div>
        <div className="form-group full-width">
          <label className="form-label">Description <span className="required">*</span><InfoIcon text={FIELD_INFO.description} /></label>
          <textarea
            className="form-textarea"
            placeholder="Describe your album, band members, recording info, etc."
            value={album.description || ''}
            onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { description: e.target.value } })}
          />
        </div>
        {/* Podcast GUID hidden in Artist mode — auto-generated + cross-linked
            behind the scenes; surfacing it during first-time setup is confusing */}
        {!isArtistMode && (
          <div className="form-group">
            <label className="form-label">Podcast GUID <span className="required">*</span><InfoIcon text={FIELD_INFO.podcastGuid} /></label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Auto-generated UUID"
                value={album.podcastGuid || ''}
                onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { podcastGuid: e.target.value } })}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-small"
                title="Generate new GUID"
                onClick={() => {
                  if (confirm('Generate a new GUID? This will create a new feed identity. Only do this if you are using this feed as a template for a new album.')) {
                    dispatch({ type: 'UPDATE_ALBUM', payload: { podcastGuid: crypto.randomUUID() } });
                  }
                }}
              >
                New
              </button>
            </div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Keywords<InfoIcon text={FIELD_INFO.keywords} /></label>
          <input
            type="text"
            className="form-input"
            placeholder="rock, indie, guitar, electronic"
            value={album.keywords || ''}
            onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { keywords: e.target.value } })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Owner Name<InfoIcon text={FIELD_INFO.ownerName} /></label>
          <input
            type="text"
            className="form-input"
            placeholder="Your name or band name"
            value={album.ownerName || ''}
            onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { ownerName: e.target.value } })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Owner Email<InfoIcon text={FIELD_INFO.ownerEmail} /></label>
          <input
            type="email"
            className="form-input"
            placeholder="contact@yourband.com"
            value={album.ownerEmail || ''}
            onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { ownerEmail: e.target.value } })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Artist npub<InfoIcon text={FIELD_INFO.artistNpub} /></label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="npub1..."
              value={album.artistNpub || ''}
              onChange={e => dispatch({ type: 'UPDATE_ALBUM', payload: { artistNpub: e.target.value } })}
              style={{ flex: 1 }}
            />
            {isLoggedIn && userNpub && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => dispatch({ type: 'UPDATE_ALBUM', payload: { artistNpub: userNpub } })}
                title="Use your logged-in Nostr npub"
                style={{ padding: '0 12px', fontSize: '0.8rem' }}
              >
                use mine
              </button>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
