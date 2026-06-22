import { describe, it, expect } from 'vitest';
import { stripImageMetadata } from './imageMetadata';

// --- byte helpers ----------------------------------------------------------
function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
const b = (...n: number[]) => new Uint8Array(n);
const s = (str: string) => new TextEncoder().encode(str);
const u16be = (n: number) => b((n >> 8) & 0xff, n & 0xff);
const u32be = (n: number) => b((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);

/** True if `needle` (as raw bytes) appears anywhere in `hay`. */
function contains(hay: Uint8Array, needle: string): boolean {
  const n = s(needle);
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

async function strippedBytes(file: File): Promise<Uint8Array> {
  const out = await stripImageMetadata(file);
  return new Uint8Array(await out.arrayBuffer());
}

// --- JPEG ------------------------------------------------------------------
function buildJpeg(): Uint8Array<ArrayBuffer> {
  const soi = b(0xff, 0xd8);
  // APP0 / JFIF — must be KEPT
  const jfif = s('JFIF\0keepme');
  const app0 = concat([b(0xff, 0xe0), u16be(2 + jfif.length), jfif]);
  // APP1 / EXIF (with fake GPS) — must be STRIPPED
  const exif = s('Exif\0\0GPSsecretlocation');
  const app1 = concat([b(0xff, 0xe1), u16be(2 + exif.length), exif]);
  // SOS + entropy data + EOI — everything from SOS to end copied verbatim
  const sos = concat([b(0xff, 0xda), u16be(12), b(1, 2, 3, 4), b(0xff, 0xd9)]);
  return concat([soi, app0, app1, sos]);
}

describe('stripImageMetadata — JPEG', () => {
  it('removes the EXIF/APP1 segment (including GPS) but keeps image data and JFIF', async () => {
    const file = new File([buildJpeg()], 'art.jpg', { type: 'image/jpeg' });
    const out = await strippedBytes(file);

    expect(contains(out, 'Exif')).toBe(false);
    expect(contains(out, 'GPSsecretlocation')).toBe(false);
    expect(contains(out, 'JFIF')).toBe(true);     // APP0 kept
    expect(contains(out, 'keepme')).toBe(true);
    // Structure intact: starts SOI, ends EOI, still a JPEG
    expect(out[0]).toBe(0xff); expect(out[1]).toBe(0xd8);
    expect(out[out.length - 2]).toBe(0xff); expect(out[out.length - 1]).toBe(0xd9);
    expect(out.length).toBeLessThan(buildJpeg().length);
  });

  it('preserves the JPEG MIME type and filename', async () => {
    const file = new File([buildJpeg()], 'art.jpg', { type: 'image/jpeg' });
    const out = await stripImageMetadata(file);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('art.jpg');
  });
});

// --- PNG -------------------------------------------------------------------
const PNG_SIG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
function chunk(type: string, data: Uint8Array): Uint8Array {
  // length, type, data, crc (dummy crc — stripper copies kept chunks verbatim)
  return concat([u32be(data.length), s(type), data, b(0, 0, 0, 0)]);
}
function buildPng(): Uint8Array<ArrayBuffer> {
  return concat([
    PNG_SIG,
    chunk('IHDR', new Uint8Array(13)),         // keep
    chunk('tEXt', s('Comment\0secret-gps')),   // strip
    chunk('IDAT', b(9, 9, 9, 9)),              // keep
    chunk('IEND', new Uint8Array(0)),          // keep
  ]);
}

describe('stripImageMetadata — PNG', () => {
  it('removes text/metadata chunks but keeps IHDR/IDAT/IEND', async () => {
    const file = new File([buildPng()], 'cover.png', { type: 'image/png' });
    const out = await strippedBytes(file);

    expect(contains(out, 'tEXt')).toBe(false);
    expect(contains(out, 'secret-gps')).toBe(false);
    expect(contains(out, 'IHDR')).toBe(true);
    expect(contains(out, 'IDAT')).toBe(true);
    expect(contains(out, 'IEND')).toBe(true);
    // PNG signature preserved
    expect(Array.from(out.slice(0, 8))).toEqual(Array.from(PNG_SIG));
  });
});

// --- passthrough -----------------------------------------------------------
describe('stripImageMetadata — non-image / unknown', () => {
  it('returns audio files unchanged', async () => {
    const original = b(0x49, 0x44, 0x33, 1, 2, 3, 4); // "ID3" + bytes
    const file = new File([original], 'song.mp3', { type: 'audio/mpeg' });
    const out = await strippedBytes(file);
    expect(Array.from(out)).toEqual(Array.from(original));
  });

  it('returns the same File object reference for non-images (no copy)', async () => {
    const file = new File([b(1, 2, 3)], 'notes.txt', { type: 'text/plain' });
    const out = await stripImageMetadata(file);
    expect(out).toBe(file);
  });
});
