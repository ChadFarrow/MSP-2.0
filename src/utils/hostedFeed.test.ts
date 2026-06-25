import { describe, it, expect } from 'vitest';
import { buildHostedInfoForEdit, buildHostedUrl } from './hostedFeed';

describe('buildHostedInfoForEdit', () => {
  it('keys the info to feedId (=== podcastGuid) so Save does a PUT not a POST', () => {
    const info = buildHostedInfoForEdit('feed-guid-123', 'pubkey-abc', 1000);
    // feedId is what SaveModal looks up by podcastGuid to choose update-vs-create.
    expect(info.feedId).toBe('feed-guid-123');
    expect(info.ownerPubkey).toBe('pubkey-abc');
  });

  it('stamps createdAt/lastUpdated/linkedAt with the provided clock', () => {
    const info = buildHostedInfoForEdit('f', 'p', 4242);
    expect(info.createdAt).toBe(4242);
    expect(info.lastUpdated).toBe(4242);
    expect(info.linkedAt).toBe(4242);
  });

  it('does not carry a legacy editToken or draft flag', () => {
    const info = buildHostedInfoForEdit('f', 'p', 1);
    expect(info.editToken).toBeUndefined();
    expect(info.isDraft).toBeUndefined();
  });
});

describe('buildHostedUrl', () => {
  it('builds a canonical hosted feed URL from the feedId', () => {
    expect(buildHostedUrl('abc')).toMatch(/\/api\/hosted\/abc\.xml$/);
  });
});
