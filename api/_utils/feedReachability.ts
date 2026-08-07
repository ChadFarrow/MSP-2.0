/**
 * Can a crawler actually fetch this feed?
 *
 * Shared by `/api/check-feed-url` (the advisory pre-flight the editor shows while
 * you type) and by the submit guards in `/api/pubnotify`, `/api/pisubmit` and
 * `/api/podping`, so the UI warning and the refusal can never disagree.
 *
 * Motivation: a feed behind Cloudflare Bot Fight Mode answers Podcast Index's
 * crawler with 403, so the feed registers but never indexes — and MSP used to
 * report "submitted!" regardless. See CLAUDE.md.
 */

const PREFIX_BYTES = 2048;

/**
 * Bot-shaped on purpose. A browser User-Agent would sail past the exact bot
 * protection we're trying to detect, making the check report "fine" for a feed
 * Podcast Index cannot read.
 */
const USER_AGENT = 'MSP-FeedCheck/1.0 (+https://musicsideproject.com)';

export type CheckReason =
  | 'blocked'
  | 'not-found'
  | 'server-error'
  | 'timeout'
  | 'dns'
  | 'not-xml'
  | null;

export interface FeedReachability {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  looksLikeFeed: boolean;
  reason: CheckReason;
}

/** Hosts MSP serves itself — always reachable, never worth probing. */
const MSP_HOSTS = ['musicsideproject.com', 'msp.podtards.com'];

export function isMspHostedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return MSP_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function classifyStatus(status: number): CheckReason {
  // 401/403 are the WAF/bot-protection signature; 429 means the crawler is being
  // throttled, which fails a crawl just as effectively.
  if (status === 401 || status === 403 || status === 429) return 'blocked';
  if (status === 404 || status === 410) return 'not-found';
  return 'server-error';
}

function looksLikeFeedBody(prefix: string): boolean {
  const head = prefix.slice(0, PREFIX_BYTES).toLowerCase();
  return head.includes('<rss') || head.includes('<feed') || head.includes('<channel');
}

export async function checkFeedReachability(
  url: string,
  timeoutMs: number
): Promise<FeedReachability> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Two probes, because bot protection of the Cloudflare kind scores each
    // request rather than applying a flat rule: the same URL can serve a bare
    // GET a challenge and a fuller one a 200, minutes apart. Crawlers differ in
    // exactly that way too, so one sample is a coin flip. We take two — a plain
    // GET (what a simple crawler looks like) and a ranged one (which also gives
    // us the body prefix) — and let any block win.
    //
    // A ranged GET rather than HEAD: plenty of hosts answer HEAD with 405 while
    // serving GET fine, which would read as a false failure.
    const [plain, ranged] = await Promise.all([
      fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: controller.signal
      }).catch((error: unknown) => error as Error),
      fetch(url, {
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Range': `bytes=0-${PREFIX_BYTES - 1}`,
          'User-Agent': USER_AGENT
        },
        redirect: 'follow',
        signal: controller.signal
      }).catch((error: unknown) => error as Error)
    ]);

    const isResponse = (r: Response | Error): r is Response => !(r instanceof Error);
    const okStatus = (r: Response) => r.ok || r.status === 206;

    // Any blocking response means some crawlers will be turned away, even if the
    // other probe sailed through.
    const blocked = [plain, ranged]
      .filter(isResponse)
      .find((r) => !okStatus(r) && classifyStatus(r.status) === 'blocked');

    if (blocked) {
      return {
        ok: false,
        status: blocked.status,
        contentType: blocked.headers.get('content-type'),
        looksLikeFeed: false,
        reason: 'blocked'
      };
    }

    if (isResponse(ranged) && okStatus(ranged)) {
      const contentType = ranged.headers.get('content-type');
      // Only the prefix matters; the body is never returned to the caller.
      const prefix = await ranged.text().catch(() => '');
      const looksLikeFeed = looksLikeFeedBody(prefix);

      // A 200 that serves an HTML page is the soft-404 / "here's my homepage"
      // case — the URL responds, but a crawler still gets no feed out of it.
      const isHtml = (contentType || '').toLowerCase().includes('text/html');
      const notXml = !looksLikeFeed && isHtml;

      return {
        ok: !notXml,
        status: ranged.status,
        contentType,
        looksLikeFeed,
        reason: notXml ? 'not-xml' : null
      };
    }

    if (isResponse(ranged)) {
      return {
        ok: false,
        status: ranged.status,
        contentType: ranged.headers.get('content-type'),
        looksLikeFeed: false,
        reason: classifyStatus(ranged.status)
      };
    }

    throw ranged;
  } catch (error) {
    const aborted = controller.signal.aborted;
    const message = error instanceof Error ? error.message : '';
    // Undici surfaces DNS failures as a cause code rather than a distinct error type.
    const isDns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message);

    return {
      ok: false,
      status: null,
      contentType: null,
      looksLikeFeed: false,
      reason: aborted ? 'timeout' : isDns ? 'dns' : 'server-error'
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Submit guard                                                        */
/* ------------------------------------------------------------------ */

/** Shorter than the advisory check's — this one sits in the submit path. */
export const GUARD_TIMEOUT_MS = 6000;

export interface GuardRefusal {
  error: string;
  reachability: FeedReachability;
}

/**
 * Decide whether a PI/podping submission should be refused.
 *
 * Deliberately narrow: we refuse ONLY on `blocked`, the one verdict testing showed
 * to be reliable, and fail open on timeout / DNS / 5xx / anything ambiguous. Our
 * own network trouble must never stop a user from submitting their feed.
 *
 * Returns null when the submission should proceed.
 */
export async function guardFeedSubmission(
  url: string,
  options: { force?: boolean } = {}
): Promise<GuardRefusal | null> {
  // An explicit override from the user ("Submit anyway"), and feeds we host
  // ourselves, skip the probe entirely.
  if (options.force || isMspHostedUrl(url)) return null;

  const reachability = await checkFeedReachability(url, GUARD_TIMEOUT_MS);

  if (reachability.reason !== 'blocked') return null;

  return {
    error:
      `This feed can't be reached — your host returned ${reachability.status ?? 'an error'} to our crawler. ` +
      `Podcast Index would be blocked the same way, so submitting now would register a feed that never indexes. ` +
      `Check your bot protection (Cloudflare: Security → Bots) or firewall rules, then try again.`,
    reachability
  };
}

/** True when a client asked to bypass the guard (`?force=1` / `{ force: true }`). */
export function wantsForce(value: unknown): boolean {
  return value === true || value === '1' || value === 'true';
}
