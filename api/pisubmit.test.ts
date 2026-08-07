import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Same arrangement as pubnotify.test.ts — the guard's own behaviour lives in
// _utils/feedReachability.test.ts; here we only care that this endpoint honours it.
const { mockGuard } = vi.hoisted(() => ({ mockGuard: vi.fn() }));
vi.mock('./_utils/feedReachability.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_utils/feedReachability.js')>()),
  guardFeedSubmission: mockGuard
}));

function createMockReqRes(body: Record<string, unknown>, method = 'POST') {
  const req = { method, body } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as any;
  return { req, res };
}

describe('/api/pisubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGuard.mockResolvedValue(null);
    process.env.PODCASTINDEX_API_KEY = 'test-api-key';
    process.env.PODCASTINDEX_API_SECRET = 'test-api-secret';
  });

  it('rejects non-POST methods', async () => {
    const { default: handler } = await import('./pisubmit');
    const { req, res } = createMockReqRes({ url: 'https://example.com/feed.xml' }, 'GET');

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 when url is missing', async () => {
    const { default: handler } = await import('./pisubmit');
    const { req, res } = createMockReqRes({});

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a URL with characters that break Podcast Index', async () => {
    const { default: handler } = await import('./pisubmit');
    const { req, res } = createMockReqRes({ url: "https://example.com/my feed's.xml" });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses to submit a feed the guard reports as unreachable', async () => {
    mockGuard.mockResolvedValue({
      error: "This feed can't be reached — your host returned 403 to our crawler.",
      reachability: {
        ok: false,
        status: 403,
        contentType: 'text/html',
        looksLikeFeed: false,
        reason: 'blocked'
      }
    });

    const { default: handler } = await import('./pisubmit');
    const { req, res } = createMockReqRes({ url: 'https://blocked.example/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ reachability: expect.objectContaining({ reason: 'blocked' }) })
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('passes the force override through to the guard', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'true', feed: { id: 42 } }) });

    const { default: handler } = await import('./pisubmit');
    const { req, res } = createMockReqRes({ url: 'https://blocked.example/feed.xml', force: true });

    await handler(req, res);

    expect(mockGuard).toHaveBeenCalledWith('https://blocked.example/feed.xml', { force: true });
  });

  it('submits when the feed is reachable', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'true', feed: { id: 42 } }) });

    const { default: handler } = await import('./pisubmit');
    const { req, res } = createMockReqRes({ url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('add/byfeedurl');
  });
});
