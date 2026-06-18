import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionToken, verifyJwt } from '../_utils/authUtils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = await verifyJwt(token);
    return res.status(200).json({
      pubkey: payload.pubkey,
      npub: payload.npub,
      email: payload.email,
      displayName: payload.displayName,
      picture: payload.picture,
    });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}
