import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Control whether a signer is "available" per test.
let signerAvailable = true;

vi.mock('./nostrSigner', () => ({
  hasSigner: () => signerAvailable,
  getPublicKeyWithTimeout: vi.fn(async () => 'fakepubkeyhex'),
  signEventWithTimeout: vi.fn(async (event: unknown) => ({
    ...(event as object),
    id: 'fake-event-id',
    sig: 'fake-sig',
  })),
}));

import { uploadMediaToBlossom, BLOSSOM_MEDIA_SERVERS } from './blossom';

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], 'track.mp3', { type: 'audio/mpeg' });
}

function okResponse(url: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ url }),
  } as unknown as Response;
}

function errResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

describe('uploadMediaToBlossom', () => {
  beforeEach(() => {
    signerAvailable = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('all servers succeed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        okResponse(`${String(input)}/result.mp3`)
      )
    );

    const result = await uploadMediaToBlossom(makeFile());
    expect(result.success).toBe(true);
    expect(result.url).toBeTruthy();
    expect(result.serversTotal).toBe(BLOSSOM_MEDIA_SERVERS.length);
    expect(result.serversSucceeded).toBe(result.serversTotal);
  });

  it('partial: first succeeds, second fails', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        return call === 1 ? okResponse('https://good.example/abc') : errResponse(500);
      })
    );

    const result = await uploadMediaToBlossom(makeFile());
    expect(result.success).toBe(true);
    expect(result.url).toBe('https://good.example/abc');
    expect(result.serversSucceeded).toBe(1);
    expect(result.serversTotal).toBe(2);
  });

  it('all servers fail with status codes', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        return errResponse(call === 1 ? 401 : 503);
      })
    );

    const result = await uploadMediaToBlossom(makeFile());
    expect(result.success).toBe(false);
    expect(result.serversSucceeded).toBe(0);
    expect(result.serversTotal).toBe(2);
    expect(result.message).toContain('401');
    expect(result.message).toContain('503');
  });

  it('not logged in', async () => {
    signerAvailable = false;
    vi.stubGlobal('fetch', vi.fn());

    const result = await uploadMediaToBlossom(makeFile());
    expect(result.success).toBe(false);
    expect(result.message.toLowerCase()).toContain('login');
    expect(result.serversTotal).toBe(BLOSSOM_MEDIA_SERVERS.length);
    expect(result.serversSucceeded).toBe(0);
  });
});
