import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';
import { bytesToHex } from '@noble/hashes/utils';
import { getSessionToken, verifyJwt, decryptNsec, userBlobPath } from '../_utils/authUtils.js';

interface StoredKeyData {
  pubkey: string;
  encryptedNsec: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = await verifyJwt(token);
    const googleId = payload.sub as string;

    const blobPath = userBlobPath(googleId);
    const { blobs } = await list({ prefix: blobPath });
    if (blobs.length === 0) {
      return res.status(404).json({ error: 'Keypair not found' });
    }

    const blobRes = await fetch(blobs[0].url);
    const stored = await blobRes.json() as StoredKeyData;
    const sk = await decryptNsec(stored.encryptedNsec, googleId);

    return res.status(200).json({ sk: bytesToHex(sk) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    if (message.includes('expired') || message.includes('Invalid') || message.includes('signature')) {
      return res.status(401).json({ error: message });
    }
    return res.status(500).json({ error: 'Server error' });
  }
}
