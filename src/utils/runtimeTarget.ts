/**
 * Which build this is, and the settings the WordPress plugin hands the app.
 *
 * The WordPress plugin is built from this same source with
 * `vite build --mode wordpress` (`npm run build:wp`). That build reports
 * `import.meta.env.MODE === 'wordpress'`; every other build — the website, the
 * dev server, the Desktop App fork — reports something else, so code behind
 * `isWordPress()` is inert there. Deliberately not a Vite `define` constant:
 * the Desktop fork has its own vite.config.ts, and a synced file naming a
 * constant that config never defines would throw at runtime.
 *
 * The plugin serves the app inside a same-origin iframe and puts
 * `window.MSP_WP` on the frame before the bundle loads (see
 * wordpress/msp-studio/includes/class-admin.php).
 */

export interface WordPressConfig {
  /** WordPress REST root with a trailing slash, e.g. https://artist.com/wp-json/ */
  restUrl: string;
  /** `wp_rest` nonce for cookie-authenticated REST calls (X-WP-Nonce). */
  nonce: string;
  /** The WordPress site's home URL. */
  siteUrl: string;
  /** Public feed URL prefix; a feed lives at `${feedBaseUrl}${guid}.xml`. */
  feedBaseUrl: string;
  /** The MSP API origin, e.g. https://musicsideproject.com */
  mspApi: string;
  /** The site's largest allowed upload in bytes (wp_max_upload_size()), when known. */
  maxUploadBytes?: number;
}

declare global {
  interface Window {
    MSP_WP?: Partial<WordPressConfig>;
  }
}

export function isWordPress(): boolean {
  return import.meta.env.MODE === 'wordpress';
}

const DEFAULT_MSP_API = 'https://musicsideproject.com';

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * The plugin's settings, or null outside the WordPress build or when the page
 * was opened without them (e.g. the built index.html loaded directly).
 */
export function wpConfig(): WordPressConfig | null {
  if (!isWordPress() || typeof window === 'undefined') return null;
  const raw = window.MSP_WP;
  if (!raw?.restUrl || !raw.nonce || !raw.feedBaseUrl) return null;
  return {
    restUrl: withSlash(raw.restUrl),
    nonce: raw.nonce,
    siteUrl: raw.siteUrl ?? '',
    feedBaseUrl: raw.feedBaseUrl,
    mspApi: (raw.mspApi || DEFAULT_MSP_API).replace(/\/+$/, ''),
    maxUploadBytes: typeof raw.maxUploadBytes === 'number' && raw.maxUploadBytes > 0 ? raw.maxUploadBytes : undefined,
  };
}
