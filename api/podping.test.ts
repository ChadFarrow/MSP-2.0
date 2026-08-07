import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// The reachability guard fetches the feed before pinging, which would eat the mocked
// fetch queue below. These tests are about the podping flow; the guard is covered in
// _utils/feedReachability.test.ts and by the refusal test at the bottom of this file.
const { mockGuard } = vi.hoisted(() => ({ mockGuard: vi.fn() }));
vi.mock('./_utils/feedReachability.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_utils/feedReachability.js')>()),
  guardFeedSubmission: mockGuard
}));

function createMockReqRes(
  method: string,
  query: Record<string, string | undefined>,
  ip = '1.2.3.4'
) {
  const req = {
    method,
    query,
    body: undefined,
    headers: { 'x-forwarded-for': ip }
  } as any;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis()
  } as any;

  return { req, res };
}

describe('/api/podping', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGuard.mockResolvedValue(null); // reachable unless a test says otherwise
    delete process.env.PODPING_ENDPOINT_URL;
    delete process.env.PODPING_BEARER_TOKEN;

    // Reset the rate limiter between tests
    const { __resetRateLimiterForTests } = await import('./_utils/rateLimiter');
    __resetRateLimiterForTests();
  });

  it('rejects non-GET/POST methods with 405', async () => {
    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('DELETE', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 when url is missing', async () => {
    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', {});

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid URL format', async () => {
    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', { url: 'not-a-url' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 501 when PODPING_ENDPOINT_URL is unset', async () => {
    process.env.PODPING_BEARER_TOKEN = 'secret';

    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(501);
  });

  it('returns 501 when PODPING_BEARER_TOKEN is unset', async () => {
    process.env.PODPING_ENDPOINT_URL = 'https://podping.example/';

    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(501);
  });

  it('returns 200 and forwards to hivepinger on success', async () => {
    process.env.PODPING_ENDPOINT_URL = 'https://podping.example/';
    process.env.PODPING_BEARER_TOKEN = 'secret';
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });

    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', {
      url: 'https://example.com/feed.xml',
      reason: 'update',
      medium: 'music'
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces upstream failure status', async () => {
    process.env.PODPING_ENDPOINT_URL = 'https://podping.example/';
    process.env.PODPING_BEARER_TOKEN = 'secret';
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      text: async () => 'down'
    });

    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 429 with Retry-After header on the 11th request from same IP', async () => {
    process.env.PODPING_ENDPOINT_URL = 'https://podping.example/';
    process.env.PODPING_BEARER_TOKEN = 'secret';
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    const { default: handler } = await import('./podping');

    for (let i = 0; i < 10; i++) {
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
    process.env.PODPING_ENDPOINT_URL = 'https://podping.example/';
    process.env.PODPING_BEARER_TOKEN = 'secret';
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    const { default: handler } = await import('./podping');

    for (let i = 0; i < 10; i++) {
      const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' }, '1.1.1.1');
      await handler(req, res);
    }

    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' }, '2.2.2.2');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('refuses to ping a feed the guard reports as unreachable', async () => {
    process.env.PODPING_ENDPOINT_URL = 'https://podping.example/';
    process.env.PODPING_BEARER_TOKEN = 'secret';
    mockGuard.mockResolvedValue({
      error: "This feed can't be reached — your host returned 403 to our crawler.",
      reachability: { ok: false, status: 403, contentType: 'text/html', looksLikeFeed: false, reason: 'blocked' }
    });

    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', { url: 'https://blocked.example/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      reachability: expect.objectContaining({ reason: 'blocked' })
    }));
    // Nothing was broadcast to Hive.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips the guard entirely when force is set', async () => {
    process.env.PODPING_ENDPOINT_URL = 'https://podping.example/';
    process.env.PODPING_BEARER_TOKEN = 'secret';
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', { url: 'https://blocked.example/feed.xml', force: '1' });

    await handler(req, res);

    expect(mockGuard).toHaveBeenCalledWith('https://blocked.example/feed.xml', { force: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not probe before the podping config gate', async () => {
    // Unconfigured deployment: 501 without spending a reachability probe.
    const { default: handler } = await import('./podping');
    const { req, res } = createMockReqRes('GET', { url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(mockGuard).not.toHaveBeenCalled();
  });
});
