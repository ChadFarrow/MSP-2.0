import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkFeedReachability,
  guardFeedSubmission,
  isMspHostedUrl,
  classifyStatus,
  wantsForce
} from './feedReachability';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockResponse(status: number, body = '', contentType = 'application/xml') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body
  };
}

const FEED_XML = '<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('classifyStatus', () => {
  it('treats auth/forbidden/throttle as blocked', () => {
    expect(classifyStatus(401)).toBe('blocked');
    expect(classifyStatus(403)).toBe('blocked');
    expect(classifyStatus(429)).toBe('blocked');
  });

  it('treats 404/410 as not-found and the rest as server-error', () => {
    expect(classifyStatus(404)).toBe('not-found');
    expect(classifyStatus(410)).toBe('not-found');
    expect(classifyStatus(500)).toBe('server-error');
    expect(classifyStatus(418)).toBe('server-error');
  });
});

describe('isMspHostedUrl', () => {
  it('matches the canonical and legacy hosts, including subdomains', () => {
    expect(isMspHostedUrl('https://musicsideproject.com/api/hosted/a.xml')).toBe(true);
    expect(isMspHostedUrl('https://new.musicsideproject.com/api/hosted/a.xml')).toBe(true);
    expect(isMspHostedUrl('https://msp.podtards.com/api/hosted/a.xml')).toBe(true);
  });

  it('does not match other hosts or unparseable input', () => {
    expect(isMspHostedUrl('https://rollzmcguyver.com/feed.xml')).toBe(false);
    // Guards against a suffix-match bug letting an attacker-controlled host through.
    expect(isMspHostedUrl('https://notmusicsideproject.com/feed.xml')).toBe(false);
    expect(isMspHostedUrl('nonsense')).toBe(false);
  });
});

describe('wantsForce', () => {
  it('accepts the shapes a query string or JSON body can produce', () => {
    expect(wantsForce(true)).toBe(true);
    expect(wantsForce('1')).toBe(true);
    expect(wantsForce('true')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(wantsForce(undefined)).toBe(false);
    expect(wantsForce('0')).toBe(false);
    expect(wantsForce('yes')).toBe(false);
    expect(wantsForce(1)).toBe(false);
  });
});

describe('checkFeedReachability', () => {
  it('reports a reachable feed', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML));
    const r = await checkFeedReachability('https://example.com/feed.xml', 5000);
    expect(r).toMatchObject({ ok: true, reason: null, looksLikeFeed: true });
  });

  it('lets a block on either probe win', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(403, '', 'text/html'))
      .mockResolvedValueOnce(mockResponse(206, FEED_XML));
    expect(await checkFeedReachability('https://example.com/feed.xml', 5000)).toMatchObject({
      ok: false,
      status: 403,
      reason: 'blocked'
    });
  });

  it('issues exactly two probes', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML));
    await checkFeedReachability('https://example.com/feed.xml', 5000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('guardFeedSubmission', () => {
  it('refuses a blocked feed and explains why', async () => {
    mockFetch.mockResolvedValue(mockResponse(403, '', 'text/html'));

    const refusal = await guardFeedSubmission('https://blocked.example/feed.xml');

    expect(refusal).not.toBeNull();
    expect(refusal!.error).toContain('403');
    expect(refusal!.error).toMatch(/Podcast Index/);
    expect(refusal!.reachability.reason).toBe('blocked');
  });

  it('allows a reachable feed', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML));
    expect(await guardFeedSubmission('https://example.com/feed.xml')).toBeNull();
  });

  // Fail-open is the whole safety story: our probe being wrong, or our own network
  // being unhappy, must never stop someone submitting a feed that is actually fine.
  it('fails open on 404, 5xx, DNS failure and timeout', async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    expect(await guardFeedSubmission('https://example.com/feed.xml')).toBeNull();

    mockFetch.mockResolvedValue(mockResponse(500));
    expect(await guardFeedSubmission('https://example.com/feed.xml')).toBeNull();

    mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.com'));
    expect(await guardFeedSubmission('https://example.com/feed.xml')).toBeNull();

    mockFetch.mockRejectedValue(new Error('socket hang up'));
    expect(await guardFeedSubmission('https://example.com/feed.xml')).toBeNull();
  });

  it('fails open when the feed serves HTML instead of RSS', async () => {
    // Worth flagging in the UI, but not worth refusing a submission over — the
    // guard only ever refuses on a confirmed block.
    mockFetch.mockResolvedValue(mockResponse(200, '<!doctype html><html></html>', 'text/html'));
    expect(await guardFeedSubmission('https://example.com/feed.xml')).toBeNull();
  });

  it('skips the probe for MSP-hosted feeds', async () => {
    expect(await guardFeedSubmission('https://musicsideproject.com/api/hosted/a.xml')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips the probe when the user has explicitly overridden', async () => {
    expect(await guardFeedSubmission('https://blocked.example/feed.xml', { force: true })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
