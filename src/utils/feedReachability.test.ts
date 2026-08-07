import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isGuardRefusal,
  describeReachability,
  shouldCheckReachability,
  checkFeedReachable,
  REACHABILITY_SKIPPED,
  type ReachabilityResult
} from './feedReachability';

function result(partial: Partial<ReachabilityResult>): ReachabilityResult {
  return {
    ok: false,
    status: null,
    contentType: null,
    looksLikeFeed: false,
    reason: null,
    ...partial
  };
}

describe('shouldCheckReachability', () => {
  it('skips empty and non-http URLs', () => {
    expect(shouldCheckReachability('')).toBe(false);
    expect(shouldCheckReachability('   ')).toBe(false);
    expect(shouldCheckReachability('example.com/feed.xml')).toBe(false);
    expect(shouldCheckReachability('ftp://example.com/feed.xml')).toBe(false);
  });

  it('skips MSP-hosted feeds — we serve those ourselves', () => {
    expect(shouldCheckReachability('https://musicsideproject.com/api/hosted/abc.xml')).toBe(false);
    expect(shouldCheckReachability('https://msp.podtards.com/api/hosted/abc.xml')).toBe(false);
  });

  it('checks arbitrary self-hosted feeds', () => {
    expect(shouldCheckReachability('https://rollzmcguyver.com/Rollz_McGuyver.xml')).toBe(true);
    expect(shouldCheckReachability('http://example.com/feed.xml')).toBe(true);
  });
});

describe('describeReachability', () => {
  it('says nothing when the feed is reachable', () => {
    expect(describeReachability(result({ ok: true, status: 200, reason: null }))).toBeNull();
    expect(describeReachability(REACHABILITY_SKIPPED)).toBeNull();
  });

  it('names the status and points at bot protection when blocked', () => {
    const message = describeReachability(result({ status: 403, reason: 'blocked' }));
    expect(message).toContain('403');
    expect(message).toMatch(/Cloudflare|bot/i);
    expect(message).toContain('Podcast Index');
  });

  it('explains a 404', () => {
    const message = describeReachability(result({ status: 404, reason: 'not-found' }));
    expect(message).toContain('404');
  });

  it('explains an HTML page served in place of a feed', () => {
    const message = describeReachability(result({ status: 200, reason: 'not-xml' }));
    expect(message).toMatch(/web page/i);
  });

  it('covers timeout, dns, and server-error', () => {
    expect(describeReachability(result({ reason: 'timeout' }))).toMatch(/10 seconds/);
    expect(describeReachability(result({ reason: 'dns' }))).toMatch(/resolve/i);
    expect(describeReachability(result({ status: 500, reason: 'server-error' }))).toContain('500');
  });

  it('handles a server-error with no status', () => {
    const message = describeReachability(result({ status: null, reason: 'server-error' }));
    expect(message).toMatch(/couldn't reach/i);
  });
});

describe('checkFeedReachable', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the API for a skipped URL', async () => {
    await checkFeedReachable('https://musicsideproject.com/api/hosted/abc.xml');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the verdict from the API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => result({ status: 403, reason: 'blocked' })
    });

    const verdict = await checkFeedReachable('https://example.com/feed.xml');

    expect(verdict.reason).toBe('blocked');
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/check-feed-url?url=${encodeURIComponent('https://example.com/feed.xml')}`,
      { signal: undefined }
    );
  });

  it('stays quiet when the check itself is rate-limited or fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    expect(await checkFeedReachable('https://example.com/feed.xml')).toEqual(REACHABILITY_SKIPPED);

    mockFetch.mockRejectedValueOnce(new Error('offline'));
    expect(await checkFeedReachable('https://example.com/feed.xml')).toEqual(REACHABILITY_SKIPPED);
  });
});

describe('isGuardRefusal', () => {
  it('recognises a guard refusal from the submit endpoints', () => {
    expect(isGuardRefusal({
      error: "This feed can't be reached",
      reachability: result({ status: 403, reason: 'blocked' })
    })).toBe(true);
  });

  it('does not mistake other errors for a refusal', () => {
    // A plain error body must fall through to normal error handling, or the UI
    // would offer "Submit anyway" for something an override cannot fix.
    expect(isGuardRefusal({ error: 'API credentials not configured' })).toBe(false);
    expect(isGuardRefusal({
      error: 'nope',
      reachability: result({ status: 404, reason: 'not-found' })
    })).toBe(false);
    expect(isGuardRefusal(null)).toBe(false);
    expect(isGuardRefusal(undefined)).toBe(false);
    expect(isGuardRefusal('blocked')).toBe(false);
  });
});
