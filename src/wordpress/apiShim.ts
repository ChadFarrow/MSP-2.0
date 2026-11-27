import type { WordPressConfig } from '../utils/runtimeTarget';

/**
 * Sends the app's same-origin `/api/...` requests somewhere that answers them
 * when the app runs inside WordPress.
 *
 * The app calls `fetch('/api/...')` in more than forty places. Inside the
 * plugin those paths would hit the WordPress site, which has no `/api`. Rather
 * than edit every call site — each of those files is already forked in the
 * Desktop App, so edits there never sync and only add conflicts — the WordPress
 * build wraps `window.fetch` once, at startup (src/main.tsx), and only there.
 *
 * - `/api/proxy-feed?url=…` goes to the plugin's own REST route: WordPress
 *   fetches feeds for its user, so MSP's proxy never has to open to every origin.
 * - every other `/api/...` goes to the MSP API, which answers cross-origin
 *   (api/_utils/cors.ts, `public: true`).
 * - anything else is untouched.
 */

export interface ApiRoute {
  url: string;
  /** True when the request goes to WordPress and must carry the REST nonce. */
  wordpress: boolean;
}

export function rewriteApiUrl(url: string, cfg: WordPressConfig): ApiRoute | null {
  if (!url.startsWith('/api/')) return null;
  if (url === '/api/proxy-feed' || url.startsWith('/api/proxy-feed?')) {
    const query = url.slice('/api/proxy-feed'.length).replace(/^\?/, '');
    const route = `${cfg.restUrl}msp/v1/proxy-feed`;
    // A plain-permalink site's REST address already has a query (?rest_route=/).
    return { url: query ? `${route}${route.includes('?') ? '&' : '?'}${query}` : route, wordpress: true };
  }
  return { url: `${cfg.mspApi}${url}`, wordpress: false };
}

let installed = false;

export function installApiShim(cfg: WordPressConfig): void {
  if (installed) return;
  installed = true;
  const realFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    // The app only ever passes strings to these calls; a Request or URL object
    // is somebody else's and goes through unchanged.
    if (typeof input !== 'string') return realFetch(input, init);
    const route = rewriteApiUrl(input, cfg);
    if (!route) return realFetch(input, init);
    if (!route.wordpress) return realFetch(route.url, init);
    const headers = new Headers(init?.headers);
    headers.set('X-WP-Nonce', cfg.nonce);
    return realFetch(route.url, { ...init, headers, credentials: 'same-origin' });
  };
}
