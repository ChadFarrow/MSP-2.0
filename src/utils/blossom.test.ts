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

// Minimal JPEG: SOI + APP1/EXIF (with fake GPS) + SOS/entropy + EOI.
function jpegWithExif(): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s);
  const exif = enc('Exif\0\0GPSsecretlocation');
  const len = exif.length + 2;
  return new Uint8Array([
    0xff, 0xd8,                              // SOI
    0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...exif, // APP1/EXIF
    0xff, 0xda, 0x00, 0x04, 0x01, 0x02,      // SOS + entropy
    0xff, 0xd9,                              // EOI
  ]);
}

function bytesContain(hay: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
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

  it('strips EXIF/GPS metadata from image uploads before sending bytes', async () => {
    let capturedBody: ArrayBuffer | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        capturedBody = init?.body as ArrayBuffer;
        return okResponse('https://good.example/clean');
      })
    );

    const file = new File([jpegWithExif()], 'art.jpg', { type: 'image/jpeg' });
    const result = await uploadMediaToBlossom(file);

    expect(result.success).toBe(true);
    expect(capturedBody).toBeTruthy();
    const sent = new Uint8Array(capturedBody!);
    expect(bytesContain(sent, 'Exif')).toBe(false);
    expect(bytesContain(sent, 'GPSsecretlocation')).toBe(false);
    // still a JPEG
    expect(sent[0]).toBe(0xff);
    expect(sent[1]).toBe(0xd8);
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
