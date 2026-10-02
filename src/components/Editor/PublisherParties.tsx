import { useState } from 'react';
import type { PublisherReference } from '../../types/feed';
import { PUBLISHER_ROLES } from '../../utils/publisherRole';
import { getFeedUrlError, normalizeFeedUrl } from '../../utils/urlValidation';
import { withRel } from '../../utils/publisherParties';
import { InfoIcon } from '../InfoIcon';

const PARTY_INFO = {
  role: 'What this publisher is to this release. MSP writes it as rel on the publisher reference. The publisher feed should list this release with the same rel, so the two feeds agree. "Not stated" writes nothing.',
  others: 'Other publisher feeds that also take part in this release, for example the label when the publisher above is the artist. Each one must list this release in its own feed for apps to confirm it. Several publishers are proposed in podcast-namespace PR #793.',
};

/**
 * The role control for one publisher party. An imported value that is not one
 * of PUBLISHER_ROLES (for example "artist producer") is kept and shown as is.
 */
export function PartyRoleSelect({ rel, onChange }: { rel?: string; onChange: (rel: string) => void }) {
  const value = rel ?? '';
  const known = PUBLISHER_ROLES.some(role => role.value === value);
  return (
    <div className="form-group">
      <label className="form-label">This publisher is<InfoIcon text={PARTY_INFO.role} /></label>
      <select className="form-select" value={value} onChange={e => onChange(e.target.value)}>
        {!known && <option value={value}>{value}</option>}
        {PUBLISHER_ROLES.map(role => (
          <option key={role.value} value={role.value}>{role.label}</option>
        ))}
      </select>
    </div>
  );
}

type LookupState = { loading: boolean; error: string | null; title: string | null };

/**
 * The publishers after the primary one (album.additionalPublishers). Each row
 * gives a feed URL, looks up its GUID in Podcast Index, and states a role.
 */
export function AdditionalPublishers({
  parties,
  onChange,
}: {
  parties: PublisherReference[];
  onChange: (parties: PublisherReference[]) => void;
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
      <label className="form-label">Other publishers<InfoIcon text={PARTY_INFO.others} /></label>
      {parties.map((party, index) => {
        const state = lookups[index];
        const urlError = getFeedUrlError(party.feedUrl || '');
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
                onClick={() => remove(index)}
                aria-label="Remove this publisher"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Remove
              </button>
            </div>
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
              <PartyRoleSelect rel={party.rel} onChange={rel => update(index, withRel(party, rel))} />
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

