import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLookup = vi.fn();
vi.mock('node:dns/promises', () => ({ lookup: (...args: unknown[]) => mockLookup(...args) }));

const PUBLIC_V4 = [{ address: '93.184.216.34', family: 4 }];

describe('isPrivateHost', () => {
  it('flags loopback and localhost names', async () => {
    const { isPrivateHost } = await import('./urlSafety');
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('api.localhost')).toBe(true);
    expect(isPrivateHost('printer.local')).toBe(true);
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('::1')).toBe(true);
  });

  it('flags RFC1918 and link-local literals', async () => {
    const { isPrivateHost } = await import('./urlSafety');
    expect(isPrivateHost('10.1.2.3')).toBe(true);
    expect(isPrivateHost('172.16.0.1')).toBe(true);
    expect(isPrivateHost('172.31.255.255')).toBe(true);
    expect(isPrivateHost('192.168.1.1')).toBe(true);
    expect(isPrivateHost('169.254.169.254')).toBe(true); // cloud metadata
    expect(isPrivateHost('0.0.0.0')).toBe(true);
  });

  it('allows ordinary public hosts and near-miss ranges', async () => {
    const { isPrivateHost } = await import('./urlSafety');
    expect(isPrivateHost('example.com')).toBe(false);
    expect(isPrivateHost('93.184.216.34')).toBe(false);
    expect(isPrivateHost('172.15.0.1')).toBe(false); // just below the /12
    expect(isPrivateHost('172.32.0.1')).toBe(false); // just above the /12
  });
});

describe('assertPublicHttpUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup.mockResolvedValue(PUBLIC_V4);
  });

  it('rejects a malformed URL', async () => {
    const { assertPublicHttpUrl } = await import('./urlSafety');
    const result = await assertPublicHttpUrl('not a url');
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects non-http(s) protocols', async () => {
    const { assertPublicHttpUrl } = await import('./urlSafety');
    expect(await assertPublicHttpUrl('file:///etc/passwd')).toMatchObject({ ok: false, status: 400 });
    expect(await assertPublicHttpUrl('gopher://example.com/')).toMatchObject({ ok: false, status: 400 });
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('rejects a private host literal without even resolving it', async () => {
    const { assertPublicHttpUrl } = await import('./urlSafety');
    const result = await assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/');
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(mockLookup).not.toHaveBeenCalled();
  });

  // The attack the literal-host check alone cannot see: a public hostname the
  // attacker controls, pointed at cloud metadata.
  it('rejects a public hostname that resolves to a private address', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const { assertPublicHttpUrl } = await import('./urlSafety');
    const result = await assertPublicHttpUrl('https://evil.example.com/feed.xml');
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects when any one of several resolved addresses is private', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 }
    ]);
    const { assertPublicHttpUrl } = await import('./urlSafety');
    expect(await assertPublicHttpUrl('https://evil.example.com/feed.xml')).toMatchObject({
      ok: false,
      status: 403
    });
  });

  it('rejects IPv6 loopback and IPv4-mapped private addresses', async () => {
    const { assertPublicHttpUrl } = await import('./urlSafety');
    mockLookup.mockResolvedValue([{ address: '::1', family: 6 }]);
    expect(await assertPublicHttpUrl('https://evil.example.com/')).toMatchObject({ status: 403 });

    mockLookup.mockResolvedValue([{ address: '::ffff:169.254.169.254', family: 6 }]);
    expect(await assertPublicHttpUrl('https://evil.example.com/')).toMatchObject({ status: 403 });
  });

  it('reports an unresolvable host as unreachable (400), not unsafe', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    const { assertPublicHttpUrl } = await import('./urlSafety');
    const result = await assertPublicHttpUrl('https://nope.example.com/feed.xml');
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('accepts a normal public feed URL and returns the parsed URL', async () => {
    const { assertPublicHttpUrl } = await import('./urlSafety');
    const result = await assertPublicHttpUrl('https://example.com/feed.xml');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.hostname).toBe('example.com');
  });
});

describe('getClientIp', () => {
  it('takes the first entry of x-forwarded-for', async () => {
    const { getClientIp } = await import('./urlSafety');
    expect(getClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } } as never)).toBe('1.2.3.4');
    expect(getClientIp({ headers: { 'x-forwarded-for': ['9.9.9.9, 1.1.1.1'] } } as never)).toBe('9.9.9.9');
  });

  it('falls back to "unknown" with no header', async () => {
    const { getClientIp } = await import('./urlSafety');
    expect(getClientIp({ headers: {} } as never)).toBe('unknown');
  });
});
