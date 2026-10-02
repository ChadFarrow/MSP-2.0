import { useState } from 'react';
import type { PublisherReference } from '../../types/feed';
import { getFeedUrlError, normalizeFeedUrl } from '../../utils/urlValidation';
import { withRel } from '../../utils/publisherParties';
import { InfoIcon } from '../InfoIcon';
import { FIELD_INFO } from '../../data/fieldInfo';
import { RolePicker } from '../RolePicker';
import { samePublisher } from '../../utils/publisherParties';


type LookupState = { loading: boolean; error: string | null; title: string | null };

/**
 * The publishers after the primary one (album.additionalPublishers). Each row
 * gives a feed URL, looks up its GUID in Podcast Index, and states a role.
 */
export function AdditionalPublishers({
  primary,
  parties,
  onChange,
  onMakePrimary,
}: {
  primary?: PublisherReference;
  parties: PublisherReference[];
  onChange: (parties: PublisherReference[]) => void;
  onMakePrimary: (index: number) => void;
}) {
  const [lookups, setLookups] = useState<Record<number, LookupState>>({});

  const update = (index: number, party: PublisherReference) => {
    onChange(parties.map((existing, i) => (i === index ? party : existing)));
  };

  const remove = (index: number) => {
    onChange(parties.filter((_, i) => i !== index));
    setLookups({});
  };

  const lookup = async (index: number) => {
    const feedUrl = normalizeFeedUrl(parties[index].feedUrl || '');
    if (!feedUrl || getFeedUrlError(feedUrl)) return;
    setLookups(prev => ({ ...prev, [index]: { loading: true, error: null, title: null } }));
    try {
      const response = await fetch(`/api/pisearch?q=${encodeURIComponent(feedUrl)}`);
      const data = await response.json();
      const feed = response.ok ? data.feeds?.[0] : undefined;
      if (feed?.podcastGuid) {
        update(index, { ...parties[index], feedGuid: feed.podcastGuid, feedUrl });
        setLookups(prev => ({ ...prev, [index]: { loading: false, error: null, title: feed.title || null } }));
      } else {
        const error = response.ok ? 'Feed not found in Podcast Index' : data.error || 'Feed not found';
        setLookups(prev => ({ ...prev, [index]: { loading: false, error, title: null } }));
      }
    } catch {
      setLookups(prev => ({ ...prev, [index]: { loading: false, error: 'Failed to lookup feed', title: null } }));
    }
  };

  return (
    <div className="form-group" style={{ marginTop: '20px' }}>
      <label className="form-label">Other publishers<InfoIcon text={FIELD_INFO.otherPublishers} /></label>
      {parties.map((party, index) => {
        const state = lookups[index];
        const urlError = getFeedUrlError(party.feedUrl || '');
        // PR #793: one entry per party. The same feed twice looks like two.
        const others = [...(primary ? [primary] : []), ...parties.filter((_, i) => i !== index)];
        const duplicate = (party.feedGuid || party.feedUrl) && others.some(other => samePublisher(other, party));
        return (
          <div
            key={index}
            style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', marginBottom: '12px' }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com/label-feed.xml"
                value={party.feedUrl || ''}
                onChange={e => update(index, { ...party, feedGuid: '', feedUrl: normalizeFeedUrl(e.target.value) })}
                style={urlError ? { borderColor: 'var(--error, #ef4444)' } : undefined}
              />
              <button
                className="btn btn-secondary"
                onClick={() => lookup(index)}
                disabled={!party.feedUrl || !!urlError || state?.loading}
                style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
              >
                {state?.loading ? 'Looking up...' : 'Look up'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => onMakePrimary(index)}
                title="Write this publisher first. An app that reads only one publisher shows the first."
                style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
              >
                Make primary
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => remove(index)}
                aria-label="Remove this publisher"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Remove
              </button>
            </div>
            {duplicate && (
              <p style={{ color: 'var(--error, #ef4444)', fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>
                This publisher is already named. Give it one entry, with all its roles.
              </p>
            )}
            {urlError && (
              <p style={{ color: 'var(--error, #ef4444)', fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>{urlError}</p>
            )}
            {state?.error && (
              <p style={{ color: 'var(--warning-color, #f59e0b)', fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>⚠ {state.error}</p>
            )}
            {party.feedGuid ? (
              <p style={{ color: 'var(--success)', fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>
                ✓ {state?.title ? `Found: ${state.title}` : `GUID ${party.feedGuid}`}
              </p>
            ) : (
              party.feedUrl && !state?.loading && !state?.error && (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>
                  Look up the feed to fill in its GUID. Apps need the GUID to confirm the link.
                </p>
              )
            )}
            <div style={{ marginTop: '8px' }}>
              <RolePicker rel={party.rel} info={FIELD_INFO.publisherRole} onChange={rel => update(index, withRel(party, rel))} />
            </div>
          </div>
        );
      })}
      <button
        className="btn btn-secondary"
        onClick={() => onChange([...parties, { feedGuid: '' }])}
        style={{ fontSize: '12px', padding: '6px 12px' }}
      >
        + Add another publisher
      </button>
    </div>
  );
}

