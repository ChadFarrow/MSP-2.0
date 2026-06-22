// Lossless image metadata stripping.
//
// Media uploaded from the editor goes to PUBLIC, content-addressed Blossom
// servers (see uploadMediaToBlossom in ./blossom.ts). Camera/phone photos embed
// EXIF — including GPS coordinates — plus XMP/IPTC, which we don't want leaking
// onto a public mirror. This removes those metadata segments while leaving the
// compressed pixel data byte-for-byte untouched: no re-encode, no quality loss,
// same format.
//
// Scope: JPEG and PNG (the formats browsers actually hand us that can carry GPS).
// Everything else (WebP, GIF, HEIC, SVG, audio, lyrics…) is returned unchanged.
// Fail-open: any parse error returns the original file so an upload never breaks.

function concatU8(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function isJpeg(d: Uint8Array): boolean {
  return d.length > 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function isPng(d: Uint8Array): boolean {
  if (d.length < 8) return false;
  for (let i = 0; i < 8; i++) if (d[i] !== PNG_SIG[i]) return false;
  return true;
}

// JPEG markers carrying metadata we strip: APP1 (EXIF/XMP), APP13 (IPTC/Photoshop),
// COM (comment). APP0 (JFIF), APP2 (ICC color profile) and APP14 (Adobe) are kept
// so color rendering is unaffected.
const JPEG_STRIP_MARKERS = new Set([0xe1, 0xed, 0xfe]);

function stripJpeg(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const keep: Uint8Array[] = [data.subarray(0, 2)]; // SOI
  let pos = 2;
  while (pos + 1 < data.length) {
    if (data[pos] !== 0xff) throw new Error('jpeg: expected marker');
    // Skip any fill 0xFF bytes preceding the marker code.
    let mpos = pos;
    while (data[mpos + 1] === 0xff && mpos + 2 < data.length) mpos++;
    const marker = data[mpos + 1];

    // Start of scan (or end of image): the rest of the file is entropy-coded
    // data that must be copied verbatim — never scanned for markers.
    if (marker === 0xda || marker === 0xd9) {
      keep.push(data.subarray(mpos));
      return concatU8(keep);
    }
    // Standalone markers with no length payload: RSTn (D0–D7), TEM (01).
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      keep.push(data.subarray(mpos, mpos + 2));
      pos = mpos + 2;
      continue;
    }
    // Length-prefixed segment (length includes its own 2 bytes).
    const length = (data[mpos + 2] << 8) | data[mpos + 3];
    if (length < 2) throw new Error('jpeg: bad segment length');
    const end = mpos + 2 + length;
    if (end > data.length) throw new Error('jpeg: segment overruns buffer');
    if (!JPEG_STRIP_MARKERS.has(marker)) keep.push(data.subarray(mpos, end));
    pos = end;
  }
  return concatU8(keep);
}

// PNG ancillary chunks carrying text/metadata: tEXt/zTXt/iTXt (incl. XMP), eXIf,
// tIME. Critical chunks (IHDR/IDAT/IEND/PLTE) and color/rendering chunks
// (gAMA/cHRM/sRGB/iCCP/…) are kept.
const PNG_STRIP_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const keep: Uint8Array[] = [data.subarray(0, 8)]; // signature
  let pos = 8;
  while (pos + 12 <= data.length) {
    // 4-byte big-endian length (use multiply to stay in unsigned range).
    const length = data[pos] * 0x1000000 + (data[pos + 1] << 16) + (data[pos + 2] << 8) + data[pos + 3];
    const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
    const end = pos + 12 + length; // 4 len + 4 type + data + 4 crc
    if (end > data.length) throw new Error('png: chunk overruns buffer');
    if (!PNG_STRIP_CHUNKS.has(type)) keep.push(data.subarray(pos, end));
    pos = end;
    if (type === 'IEND') break;
  }
  return concatU8(keep);
}

/**
 * Strip metadata from an image file losslessly. Returns the original `file`
 * unchanged for non-JPEG/PNG inputs, when nothing needed removing, or on any
 * parse error (fail-open — never blocks an upload).
 */
export async function stripImageMetadata(file: File): Promise<File> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let cleaned: Uint8Array<ArrayBuffer> | null = null;
    if (isJpeg(buf)) cleaned = stripJpeg(buf);
    else if (isPng(buf)) cleaned = stripPng(buf);

    if (!cleaned || cleaned.length === buf.length) return file; // unsupported or nothing removed
    return new File([cleaned], file.name, { type: file.type, lastModified: file.lastModified });
  } catch (err) {
    console.warn('stripImageMetadata: leaving file unchanged after parse error', err);
    return file;
  }
}
