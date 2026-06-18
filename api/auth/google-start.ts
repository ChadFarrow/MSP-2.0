import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).send('Google sign-in is not configured');
  }

  const state = crypto.randomUUID();
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = req.headers['host'] as string;
  const redirectUri = `${proto}://${host}/api/auth/google-callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.setHeader('Set-Cookie', `msp-oauth-state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
