// Shared core for "can a crawler actually fetch this feed URL?".
//
// Two callers, deliberately one implementation: /api/verify-feed-url (the
// advisory warning shown next to a URL field) and guardFeedSubmission in
// feedReachability.ts (the refusal on the submit paths). If they probed
// differently they could disagree — warn about a feed the guard then allows, or
// stay silent about one it refuses — and the user would have no way to tell
// which was right.
//
// SECURITY: this fetches arbitrary user-supplied URLs with no domain allowlist,
// on the strict condition that it returns a *verdict and never the bytes*. The
// only defences are assertPublicHttpUrl on the first hop and on every redirect
// hop. Do not replace the manual redirect walk with `redirect: 'follow'`, and do
// not let response content reach a caller.
import { assertPublicHttpUrl } from './urlSafety.js';

/**
 * Exactly the JSON /api/verify-feed-url returns. Do NOT add fields — the handler
 * serialises this object verbatim, so anything added here ships in the public
 * response. Machine-readable classification belongs on FeedProbeResult instead.
 */
export interface FeedProbeOutcome {
  reachable: boolean;
  status?: number;
  looksLikeFeed?: boolean;
  finalUrl?: string;
  /** Human-readable, for display. Absent on a plain non-OK status. */
  reason?: string;
}

/** Machine-readable verdict. Internal to api/ — never serialised. */
export type ProbeVerdict =
  | 'ok'            // at least one probe returned 2xx or 206
  | 'blocked'       // 401/403/429 from the host — the ONLY verdict the guard refuses on
  | 'not-found'     // 404/410
  | 'server-error'  // any other non-2xx, including "too many redirects"
  | 'unsafe'        // assertPublicHttpUrl rejected the URL or a redirect target
  | 'dns'           // hostname does not resolve
  | 'timeout'
  | 'network';      // connect failure

export interface FeedProbeResult {
  outcome: FeedProbeOutcome;
  verdict: ProbeVerdict;
  /**
   * Set only when the FIRST hop was rejected as an unsafe address.
   * /api/verify-feed-url turns this into an HTTP 403 refusal; every other
   * result is a 200 verdict about the user's URL.
   */
  refuseWithStatus?: 403;
}

export const VERIFY_TIMEOUT_MS = 10_000;
/**
 * Shorter than the advisory endpoint's: this one runs inline on submit, ahead of
 * pubnotify's four sequential Podcast Index calls, inside one serverless
 * invocation. A WAF challenge answers immediately — only the fail-open cases are
 * slow — so a tighter budget costs almost no detection power.
 */
export const GUARD_TIMEOUT_MS = 4_000;

const MAX_REDIRECTS = 5;
/** Enough to see the opening tag of any real feed without buffering a podcast. */
const MAX_SNIFF_BYTES = 64 * 1024;
const RANGE_BYTES = 2048;
const FEED_MARKERS = ['<rss', '<feed', '<channel'];
const USER_AGENT = 'MSP-FeedVerifier/1.0';
const ACCEPT = 'application/rss+xml, application/xml, text/xml, */*';

/** Which kind of problem an HTTP status represents. */
export function classifyStatus(status: number): 'blocked' | 'not-found' | 'server-error' {
  if (status === 401 || status === 403 || status === 429) return 'blocked';
  if (status === 404 || status === 410) return 'not-found';
  return 'server-error';
}

/** A ranged request answers 206, which is a success even though `ok` is false. */
function isSuccess(response: { ok: boolean; status: number }): boolean {
  return response.ok || response.status === 206;
}

interface Walk {
  outcome: FeedProbeOutcome;
  verdict: ProbeVerdict;
}

/** Read at most maxBytes of the body, then abort. Never returned to a caller. */
async function sniffBody(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, maxBytes);

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  try {
    while (text.length < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text.slice(0, maxBytes);
}

/**
 * Follow redirects by hand so every hop gets the SSRF check. `redirect: 'follow'`
 * would let a public URL bounce to 169.254.169.254 behind our back.
 *
 * `startUrl` must already have passed assertPublicHttpUrl — probeFeedUrl does
 * that once for both walks, so a blocked first hop can be reported as a refusal
 * rather than a verdict.
 */
async function walk(
  startUrl: string,
  signal: AbortSignal,
  headers: Record<string, string>,
  sniffBytes: number
): Promise<Walk> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hop > 0) {
      const safety = await assertPublicHttpUrl(current);
      if (!safety.ok) {
        return {
          outcome: { reachable: false, reason: `Redirected to a blocked address (${safety.error})` },
          // Not 'blocked': that means the origin's WAF refused our crawler. Saying
          // "your host returned 403" when the feed redirects to a private address
          // would send the user to fix the wrong thing.
          verdict: 'unsafe'
        };
      }
    }

    const response = await fetch(current, { redirect: 'manual', signal, headers });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return {
          outcome: { reachable: false, status: response.status, reason: 'Redirect with no destination' },
          verdict: 'server-error'
        };
      }
      current = new URL(location, current).toString();
      continue;
    }

    if (!isSuccess(response)) {
      return {
        outcome: { reachable: false, status: response.status, finalUrl: current },
        verdict: classifyStatus(response.status)
      };
    }

    const body = await sniffBody(response, sniffBytes);
    const looksLikeFeed = FEED_MARKERS.some((marker) => body.includes(marker));
    return {
      outcome: { reachable: true, status: response.status, looksLikeFeed, finalUrl: current },
      verdict: 'ok'
    };
  }

  return { outcome: { reachable: false, reason: 'Too many redirects' }, verdict: 'server-error' };
}

function isWalk(value: Walk | Error): value is Walk {
  return !(value instanceof Error);
}

/**
 * Reconcile the two probes.
 *
 * Any block wins. Bot protection *scores* each request rather than applying a
 * flat rule, so the same URL answers differently depending on request shape —
 * measured on rollzmcguyver.com, `curl --http1.1` got 200 eight times out of
 * eight while `--http2` got 403 eight out of eight, and Node fetch flipped
 * between 403 and 206 within minutes. One sample is a coin flip; two differently
 * shaped ones, biased toward reporting the block, held at 6/6.
 */
function combine(plain: Walk | Error, ranged: Walk | Error, timeoutMs: number): FeedProbeResult {
  const walks = [plain, ranged].filter(isWalk);

  const blocked = walks.find((w) => w.verdict === 'blocked');
  if (blocked) return { outcome: blocked.outcome, verdict: 'blocked' };

  const plainOk = isWalk(plain) && plain.verdict === 'ok' ? plain : null;
  const rangedOk = isWalk(ranged) && ranged.verdict === 'ok' ? ranged : null;
  // Prefer the plain probe: it carries the full 64 KB sniff, where the ranged one
  // sees ~2 KB. But trust either probe's sighting of a feed marker.
  const succeeded = plainOk ?? rangedOk;
  if (succeeded) {
    const looksLikeFeed = Boolean(plainOk?.outcome.looksLikeFeed) || Boolean(rangedOk?.outcome.looksLikeFeed);
    return { outcome: { ...succeeded.outcome, looksLikeFeed }, verdict: 'ok' };
  }

  const failed = walks[0];
  if (failed) return { outcome: failed.outcome, verdict: failed.verdict };

  // Both probes threw.
  const error = plain as Error;
  const aborted = error.name === 'AbortError';
  return {
    outcome: {
      reachable: false,
      reason: aborted
        ? `Timed out after ${Math.round(timeoutMs / 1000)} seconds`
        : 'Could not connect to that address'
    },
    verdict: aborted ? 'timeout' : 'network'
  };
}

/**
 * Probe a feed URL twice — a bare GET and a ranged GET — and report whether a
 * crawler could fetch it. Never throws; never returns response content.
 */
export async function probeFeedUrl(
  url: string,
  options: { timeoutMs?: number } = {}
): Promise<FeedProbeResult> {
  const timeoutMs = options.timeoutMs ?? VERIFY_TIMEOUT_MS;

  // Checked here rather than inside walk() so both probes share one preflight,
  // and so a blocked address is distinguishable from a host that simply doesn't
  // resolve — the first is a refusal by MSP, the second a verdict about the URL.
  const preflight = await assertPublicHttpUrl(url);
  if (!preflight.ok) {
    if (preflight.status === 403) {
      return {
        outcome: { reachable: false, reason: preflight.error },
        verdict: 'unsafe',
        refuseWithStatus: 403
      };
    }
    return {
      outcome: { reachable: false, reason: preflight.error },
      verdict: preflight.error === 'Could not resolve host' ? 'dns' : 'network'
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

  try {
    // One controller and one deadline for both probes — two timers would let the
    // slower probe outlive the caller's budget. The two request shapes differ on
    // purpose; see combine().
    const [plain, ranged] = await Promise.all([
      walk(url, controller.signal, { 'User-Agent': USER_AGENT }, MAX_SNIFF_BYTES).catch(toError),
      walk(
        url,
        controller.signal,
        { Accept: ACCEPT, Range: `bytes=0-${RANGE_BYTES - 1}`, 'User-Agent': USER_AGENT },
        RANGE_BYTES
      ).catch(toError)
    ]);
    return combine(plain, ranged, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}
