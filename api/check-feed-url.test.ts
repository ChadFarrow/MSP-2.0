import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockReqRes(
  method: string,
  query: Record<string, string | undefined>,
  ip = '1.2.3.4'
) {
  const req = {
    method,
    query,
    headers: { 'x-forwarded-for': ip }
  } as any;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis()
  } as any;

  return { req, res };
}

function mockResponse(
  status: number,
  body = '',
  contentType = 'application/xml'
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body
  };
}

/** The JSON verdict from the last res.json() call. */
function verdict(res: { json: { mock: { calls: unknown[][] } } }) {
  const calls = res.json.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

const FEED_XML = '<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>';

describe('/api/check-feed-url', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { __resetRateLimiterForTests } = await import('./_utils/rateLimiter');
    __resetRateLimiterForTests();
  });

  it('rejects non-GET methods with 405', async () => {
    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('POST', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 when url is missing', async () => {
    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', {});

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for an unparseable URL', async () => {
    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'not-a-url' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for non-http(s) protocols', async () => {
    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'file:///etc/passwd' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects private/loopback/link-local hosts (SSRF guard)', async () => {
    const { default: handler } = await import('./check-feed-url');

    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1/feed.xml',
      'http://10.0.0.5/feed.xml',
      'http://192.168.1.1/feed.xml',
      'http://localhost:3000/feed.xml'
    ]) {
      const { req, res } = createMockReqRes('GET', { url });
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    }

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a reachable feed as ok', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(verdict(res)).toMatchObject({ ok: true, status: 200, looksLikeFeed: true, reason: null });
  });

  it('accepts a 206 partial response (the ranged GET succeeding)', async () => {
    mockFetch.mockResolvedValue(mockResponse(206, FEED_XML));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: true, reason: null });
  });

  it('classifies 403 as blocked — the Cloudflare bot-protection case', async () => {
    mockFetch.mockResolvedValue(mockResponse(403, '', 'text/html'));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(verdict(res)).toMatchObject({ ok: false, status: 403, reason: 'blocked' });
  });

  it('reports blocked when only the plain probe is challenged', async () => {
    // The motivating real-world shape: bot scoring lets a fuller request through
    // while challenging a bare one, so some crawlers get in and others do not.
    // Any block has to win, or the warning never fires for the feed that needs it.
    mockFetch
      .mockResolvedValueOnce(mockResponse(403, '', 'text/html'))
      .mockResolvedValueOnce(mockResponse(206, FEED_XML));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: false, status: 403, reason: 'blocked' });
  });

  it('reports blocked when only the ranged probe is challenged', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(200, FEED_XML))
      .mockResolvedValueOnce(mockResponse(403, '', 'text/html'));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: false, status: 403, reason: 'blocked' });
  });

  it('still reports ok when one probe errors but the ranged one succeeds', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(mockResponse(206, FEED_XML));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: true, reason: null });
  });

  it('classifies 401 and 429 as blocked too', async () => {
    const { default: handler } = await import('./check-feed-url');

    for (const status of [401, 429]) {
      mockFetch.mockResolvedValue(mockResponse(status));
      const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });
      await handler(req, res);
      expect(verdict(res)).toMatchObject({ ok: false, reason: 'blocked' });
    }
  });

  it('classifies 404 as not-found', async () => {
    mockFetch.mockResolvedValue(mockResponse(404));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: false, status: 404, reason: 'not-found' });
  });

  it('classifies 5xx as server-error', async () => {
    mockFetch.mockResolvedValue(mockResponse(503));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: false, status: 503, reason: 'server-error' });
  });

  it('flags a 200 HTML page as not-xml (soft-404 / wrong URL)', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, '<!doctype html><html><body>Not here</body></html>', 'text/html; charset=UTF-8')
    );

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: false, reason: 'not-xml', looksLikeFeed: false });
  });

  it('does not flag XML served with an odd content-type', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML, 'text/plain'));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: true, looksLikeFeed: true });
  });

  it('reports a timeout when the fetch aborts', async () => {
    mockFetch.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    vi.useFakeTimers();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(11_000);
    await pending;
    vi.useRealTimers();

    expect(verdict(res)).toMatchObject({ ok: false, status: null, reason: 'timeout' });
  });

  it('reports dns when the hostname does not resolve', async () => {
    mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND nope.example'));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://nope.example/feed.xml' });

    await handler(req, res);

    expect(verdict(res)).toMatchObject({ ok: false, status: null, reason: 'dns' });
  });

  it('rate-limits after 30 checks from the same IP', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML));

    const { default: handler } = await import('./check-feed-url');

    for (let i = 0; i < 30; i++) {
      const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    }

    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });

  it('rate-limits per IP independently', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML));

    const { default: handler } = await import('./check-feed-url');

    for (let i = 0; i < 30; i++) {
      const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' }, '1.1.1.1');
      await handler(req, res);
    }

    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' }, '2.2.2.2');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('never returns the feed body — only a verdict', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(Object.keys(verdict(res)).sort()).toEqual(
      ['contentType', 'looksLikeFeed', 'ok', 'reason', 'status'].sort()
    );
  });

  it('sends a bot-shaped User-Agent so it sees what a crawler sees', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, FEED_XML));

    const { default: handler } = await import('./check-feed-url');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    const init = mockFetch.mock.calls[0][1];
    expect(init.headers['User-Agent']).toContain('MSP-FeedCheck');
    expect(init.headers['User-Agent']).not.toContain('Mozilla');
  });
});
