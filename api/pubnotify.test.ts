import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally before importing the handler
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// The reachability guard fetches the feed before submitting, which would eat the
// mocked fetch queue these tests set up for the PI calls. These tests are about the
// PI logic; the guard has its own coverage in _utils/feedReachability.test.ts, plus
// the refusal path exercised at the bottom of this file.
const { mockGuard } = vi.hoisted(() => ({ mockGuard: vi.fn() }));
vi.mock('./_utils/feedReachability.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_utils/feedReachability.js')>()),
  guardFeedSubmission: mockGuard
}));

// Mock crypto for auth header generation
vi.mock('crypto', () => ({
  default: {
    createHash: () => ({
      update: () => ({
        digest: () => 'mock-hash'
      })
    })
  }
}));

// Helper to create mock request/response
function createMockReqRes(query: Record<string, string | undefined>) {
  const req = {
    method: 'GET',
    query
  } as any;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as any;

  return { req, res };
}

describe('pubnotify API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGuard.mockResolvedValue(null); // reachable unless a test says otherwise
    // Set env vars before each test
    process.env.PODCASTINDEX_API_KEY = 'test-api-key';
    process.env.PODCASTINDEX_API_SECRET = 'test-api-secret';
  });

  it('returns 405 for non-GET requests', async () => {
    const { default: handler } = await import('./pubnotify');
    const { req, res } = createMockReqRes({ url: 'https://example.com/feed.xml' });
    req.method = 'POST';

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('returns 400 if url parameter is missing', async () => {
    const { default: handler } = await import('./pubnotify');
    const { req, res } = createMockReqRes({});

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing url parameter' });
  });

  it('returns 400 for invalid URL format', async () => {
    const { default: handler } = await import('./pubnotify');
    const { req, res } = createMockReqRes({ url: 'not-a-valid-url' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid URL format' });
  });

  it('calls pubnotify and returns success without lookup when no auth', async () => {
    // Remove API credentials
    delete process.env.PODCASTINDEX_API_KEY;
    delete process.env.PODCASTINDEX_API_SECRET;

    const { default: handler } = await import('./pubnotify');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ success: true }))
    });

    const { req, res } = createMockReqRes({ url: 'https://example.com/feed.xml' });

    await handler(req, res);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('hub/pubnotify');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      podcastIndexId: null,
      podcastIndexUrl: null
    }));
  });

  it('tries GUID lookup first when guid parameter is provided', async () => {
    const { default: handler } = await import('./pubnotify');

    // Mock pubnotify success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ success: true }))
    });

    // Mock GUID lookup success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ feed: { id: 12345 } })
    });

    // Mock add/byfeedurl (always called to register URL)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ feed: { id: 12345 } }))
    });

    const { req, res } = createMockReqRes({
      url: 'https://example.com/feed.xml',
      guid: 'test-guid-123'
    });

    await handler(req, res);

    // Should have called pubnotify, byguid lookup, then add/byfeedurl
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toContain('hub/pubnotify');
    expect(mockFetch.mock.calls[1][0]).toContain('podcasts/byguid');
    expect(mockFetch.mock.calls[1][0]).toContain('guid=test-guid-123');
    expect(mockFetch.mock.calls[2][0]).toContain('add/byfeedurl');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      podcastIndexId: 12345,
      podcastIndexUrl: 'https://podcastindex.org/podcast/12345'
    }));
  });

  it('falls back to URL lookup when GUID lookup fails', async () => {
    const { default: handler } = await import('./pubnotify');

    // Mock pubnotify success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ success: true }))
    });

    // Mock GUID lookup failure (not found)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ feed: null })
    });

    // Mock URL lookup success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ feed: { id: 67890 } })
    });

    // Mock add/byfeedurl (always called to register URL)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ feed: { id: 67890 } }))
    });

    const { req, res } = createMockReqRes({
      url: 'https://example.com/feed.xml',
      guid: 'unknown-guid'
    });

    await handler(req, res);

    // Should have called pubnotify, byguid, byfeedurl lookup, then add/byfeedurl
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[0][0]).toContain('hub/pubnotify');
    expect(mockFetch.mock.calls[1][0]).toContain('podcasts/byguid');
    expect(mockFetch.mock.calls[2][0]).toContain('podcasts/byfeedurl');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      podcastIndexId: 67890,
      podcastIndexUrl: 'https://podcastindex.org/podcast/67890'
    }));
  });

  it('only uses URL lookup when no GUID is provided', async () => {
    const { default: handler } = await import('./pubnotify');

    // Mock pubnotify success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ success: true }))
    });

    // Mock URL lookup success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ feed: { id: 11111 } })
    });

    // Mock add/byfeedurl (always called to register URL)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ feed: { id: 11111 } }))
    });

    const { req, res } = createMockReqRes({
      url: 'https://example.com/feed.xml'
      // No guid parameter
    });

    await handler(req, res);

    // Should have called pubnotify, byfeedurl lookup, then add/byfeedurl
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toContain('hub/pubnotify');
    expect(mockFetch.mock.calls[1][0]).toContain('podcasts/byfeedurl');
    // Should NOT have called byguid
    expect(mockFetch.mock.calls[1][0]).not.toContain('byguid');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      podcastIndexId: 11111,
      podcastIndexUrl: 'https://podcastindex.org/podcast/11111'
    }));
  });

  it('returns success without podcastIndexUrl when feed is not yet indexed', async () => {
    const { default: handler } = await import('./pubnotify');

    // Mock pubnotify success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ success: true }))
    });

    // Mock lookup failure (not found)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ feed: null })
    });

    // Mock add/byfeedurl (no result either)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({}))
    });

    const { req, res } = createMockReqRes({
      url: 'https://example.com/new-feed.xml'
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      podcastIndexId: null,
      podcastIndexUrl: null
    }));
  });

  it('surfaces the PI add/byfeedurl rejection reason when the feed is not registered', async () => {
    const { default: handler } = await import('./pubnotify');

    // pubnotify success
    mockFetch.mockResolvedValueOnce({ ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ success: true })) });
    // URL lookup: not found
    mockFetch.mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ feed: null }) });
    // add/byfeedurl: PI rejects with a description and no feed id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ status: false, description: 'Unable to add feed to the index.' }))
    });

    const { req, res } = createMockReqRes({ url: 'https://example.com/new-feed.xml' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      podcastIndexId: null,
      addResult: expect.objectContaining({ description: 'Unable to add feed to the index.' })
    }));
  });

  it('returns error when pubnotify fails', async () => {
    const { default: handler } = await import('./pubnotify');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(JSON.stringify({ description: 'Server error' }))
    });

    const { req, res } = createMockReqRes({
      url: 'https://example.com/feed.xml'
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Server error'
    }));
  });

  it('returns direct podcast URL format', async () => {
    const { default: handler } = await import('./pubnotify');

    // Mock pubnotify success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ success: true }))
    });

    // Mock GUID lookup returns specific ID
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ feed: { id: 7642183 } })
    });

    // Mock add/byfeedurl (always called to register URL)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ feed: { id: 7642183 } }))
    });

    const { req, res } = createMockReqRes({
      url: 'https://example.com/feed.xml',
      guid: 'some-guid'
    });

    await handler(req, res);

    // Verify the URL format is correct (direct link, not search)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      podcastIndexUrl: 'https://podcastindex.org/podcast/7642183'
    }));

    // Ensure it's NOT a search URL
    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.podcastIndexUrl).not.toContain('search?q=');
  });

  it('refuses to submit a feed the guard reports as unreachable', async () => {
    mockGuard.mockResolvedValue({
      error: "This feed can't be reached — your host returned 403 to our crawler.",
      reachability: { ok: false, status: 403, contentType: 'text/html', looksLikeFeed: false, reason: 'blocked' }
    });

    const { default: handler } = await import('./pubnotify');
    const { req, res } = createMockReqRes({ url: 'https://blocked.example/feed.xml' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      reachability: expect.objectContaining({ reason: 'blocked', status: 403 })
    }));
    // Nothing reached Podcast Index.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('passes the force override through to the guard', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) });

    const { default: handler } = await import('./pubnotify');
    const { req, res } = createMockReqRes({ url: 'https://blocked.example/feed.xml', force: '1' });

    await handler(req, res);

    expect(mockGuard).toHaveBeenCalledWith('https://blocked.example/feed.xml', { force: true });
  });
});
