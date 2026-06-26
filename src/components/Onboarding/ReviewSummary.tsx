// src/components/Onboarding/ReviewSummary.tsx
//
// Read-only summary of the in-progress feed shown on the wizard's Review step.
// Extracted from OnboardingWizard. Note the Artist/Publisher block maps
// Artist Name → publisher.author and Catalog Title → publisher.title.

import type { Album, PublisherFeed } from '../../types/feed';

function ReviewRow({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="review-row">
      <span className="review-row-label">{label}</span>
      <span className="review-row-value">{value}</span>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="review-block">
      <h4 className="review-block-title">{title}</h4>
      <div className="review-block-body">{children}</div>
    </div>
  );
}

const truncate = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function ReviewSummary({ album, publisher }: { album: Album; publisher: PublisherFeed | null }) {
  const recipients = album.value?.recipients?.filter((r) => r.address) ?? [];
  const persons = album.persons?.filter((p) => p.name?.trim()) ?? [];
  const funding = album.funding?.filter((f) => f.url?.trim()) ?? [];
  const owner = [album.ownerName, album.ownerEmail].filter(Boolean).join(' · ');

  return (
    <div>
      <div className="review-header-card">
        {album.imageUrl && (
          <img src={album.imageUrl} alt="Album art" className="review-header-art" />
        )}
        <div className="review-header-meta">
          <strong className="review-header-title">{album.title || 'Untitled album'}</strong>
          <span className="review-header-sub">by {album.author || publisher?.title || 'Unknown artist'}</span>
          <span className="review-header-stats">
            {album.tracks.length} track{album.tracks.length === 1 ? '' : 's'}
            {album.language ? ` · ${album.language.toUpperCase()}` : ''}
            {album.categories?.[0] ? ` · ${album.categories[0]}` : ''}
            {album.explicit ? ' · Explicit' : ''}
          </span>
        </div>
      </div>

      {publisher && (
        <ReviewBlock title="Artist / Publisher">
          <ReviewRow label="Artist Name" value={publisher.author} />
          <ReviewRow label="Catalog Title" value={publisher.title} />
          <ReviewRow label="Website" value={publisher.link} />
          <ReviewRow label="Description" value={publisher.description} />
        </ReviewBlock>
      )}

      <ReviewBlock title="Album">
        <ReviewRow label="Title" value={album.title} />
        <ReviewRow label="Artist" value={album.author} />
        <ReviewRow label="Description" value={album.description} />
        <ReviewRow label="Website" value={album.link} />
        <ReviewRow label="Keywords" value={album.keywords} />
        <ReviewRow label="Owner" value={owner} />
      </ReviewBlock>

      <ReviewBlock title={`Tracks (${album.tracks.length})`}>
        {album.tracks.length === 0 ? (
          <div className="review-empty">No tracks added.</div>
        ) : (
          <ol className="review-track-list">
            {album.tracks.map((t, i) => (
              <li key={t.id || i} className="review-track-item">
                <span>{t.title || 'Untitled track'}</span>
                {t.duration && t.duration !== '00:00:00' && (
                  <span className="review-muted"> · {t.duration}</span>
                )}
                {t.explicit && <span className="review-muted"> · Explicit</span>}
                {t.enclosureUrl && (
                  <audio
                    controls
                    preload="none"
                    src={t.enclosureUrl}
                    style={{ display: 'block', marginTop: 6, width: '100%', maxWidth: 360, height: 36 }}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </ReviewBlock>

      {recipients.length > 0 && (
        <ReviewBlock title="Value / V4V splits">
          {recipients.map((r, i) => (
            <div key={i} className="review-split-row">
              <span className="review-split-name">{r.name || 'Recipient'} <span className="review-muted">· {truncate(r.address)}</span></span>
              <span className="review-split-pct">{r.split}%</span>
            </div>
          ))}
        </ReviewBlock>
      )}

      {persons.length > 0 && (
        <ReviewBlock title="Credits">
          {persons.map((p, i) => (
            <div key={i} className="review-track-item">
              <span>{p.name}</span>
              {p.roles?.length > 0 && (
                <span className="review-muted"> · {p.roles.map((r) => r.role).join(', ')}</span>
              )}
            </div>
          ))}
        </ReviewBlock>
      )}

      {funding.length > 0 && (
        <ReviewBlock title="Funding">
          {funding.map((f, i) => (
            <ReviewRow key={i} label={f.text || 'Support'} value={f.url} />
          ))}
        </ReviewBlock>
      )}
    </div>
  );
}
