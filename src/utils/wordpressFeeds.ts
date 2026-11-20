import { wpConfig, type WordPressConfig } from './runtimeTarget';

/**
 * Feeds hosted by the artist's own WordPress site, through the plugin's REST
 * routes (wordpress/msp-studio/includes/class-rest.php). WordPress
 * authenticates these with the logged-in user's cookie plus the `wp_rest`
 * nonce, and checks the plugin's capability on every route.
 */

export interface WordPressFeedSummary {
  guid: string;
  title: string;
  medium: string;
  url: string;
  /** ISO 8601, from WordPress. */
  modified: string;
}

export interface WordPressSaveResult {
  url: string;
  created: boolean;
}

function requireConfig(): WordPressConfig {
  const cfg = wpConfig();
  if (!cfg) throw new Error('This page was opened outside WordPress. Open MSP Studio from the WordPress admin menu.');
  return cfg;
}

/** The public address WordPress serves a feed at. Same rule as the plugin's rewrite. */
export function wordPressFeedUrl(guid: string, cfg: WordPressConfig | null = wpConfig()): string {
  if (!cfg) return '';
  return `${cfg.feedBaseUrl}${encodeURIComponent(guid)}.xml`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = requireConfig();
  const headers = new Headers(init.headers);
  headers.set('X-WP-Nonce', cfg.nonce);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${cfg.restUrl}msp/v1/${path}`, { ...init, headers, credentials: 'same-origin' });
  const data = await res.json().catch(() => null) as (T & { message?: string; code?: string }) | null;
  if (!res.ok) {
    // The code, not the message: WordPress words this one "Cookie check failed".
    if (data?.code === 'rest_cookie_invalid_nonce') {
      throw new Error('Your WordPress login has expired. Reload the page and try again.');
    }
    // WP_Error responses carry a human-readable `message`.
    throw new Error(data && typeof data.message === 'string' ? data.message : `HTTP ${res.status}`);
  }
  return data as T;
}

export function saveToWordPress(guid: string, xml: string, title: string): Promise<WordPressSaveResult> {
  return request<WordPressSaveResult>(`feeds/${encodeURIComponent(guid)}`, {
    method: 'PUT',
    body: JSON.stringify({ xml, title }),
  });
}

export function listWordPressFeeds(): Promise<WordPressFeedSummary[]> {
  return request<WordPressFeedSummary[]>('feeds');
}

export async function loadWordPressFeed(guid: string): Promise<string> {
  const data = await request<{ xml: string }>(`feeds/${encodeURIComponent(guid)}`);
  return data.xml;
}
