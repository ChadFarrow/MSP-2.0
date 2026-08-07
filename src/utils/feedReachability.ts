import { isMspUrl } from './xmlParser';

/**
 * Client side of the `/api/check-feed-url` reachability pre-flight.
 *
 * The point is to catch the case where a user's own host (Cloudflare bot
 * protection, a WAF, a misconfigured server) answers crawlers with a 403, so the
 * feed registers with Podcast Index but never actually indexes. Without this the
 * failure is completely silent — the podping succeeds, and nothing ever appears.
 *
 * This is a WARNING, never a gate. The check can be wrong (a transient outage, or
 * a host that blocks our egress but not PI's), so no caller should disable a
 * submit button on the strength of it.
 */

export type ReachabilityReason =
  | 'blocked'
  | 'not-found'
  | 'server-error'
  | 'timeout'
  | 'dns'
  | 'not-xml'
  | null;

export interface ReachabilityResult {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  looksLikeFeed: boolean;
  reason: ReachabilityReason;
}

/** Returned when we decline to check (MSP-hosted URL, or the check itself failed). */
export const REACHABILITY_SKIPPED: ReachabilityResult = {
  ok: true,
  status: null,
  contentType: null,
  looksLikeFeed: false,
  reason: null
};

/**
 * MSP-hosted feeds are served by us and are reachable by definition — checking
 * one just makes MSP call itself.
 */
export function shouldCheckReachability(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isMspUrl(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

export async function checkFeedReachable(
  url: string,
  signal?: AbortSignal
): Promise<ReachabilityResult> {
  if (!shouldCheckReachability(url)) return REACHABILITY_SKIPPED;

  try {
    const response = await fetch(`/api/check-feed-url?url=${encodeURIComponent(url.trim())}`, {
      signal
    });
    // Rate-limited or otherwise unavailable — say nothing rather than cry wolf.
    if (!response.ok) return REACHABILITY_SKIPPED;
    return (await response.json()) as ReachabilityResult;
  } catch {
    return REACHABILITY_SKIPPED;
  }
}

/**
 * Shape of the 400 returned by `/api/pubnotify`, `/api/pisubmit` and `/api/podping`
 * when the submit guard refuses. Mirrors `GuardRefusal` in
 * `api/_utils/feedReachability.ts` (the frontend can't import from `api/`, same
 * arrangement as `urlValidation.ts`) — keep in sync.
 */
export interface GuardRefusal {
  error: string;
  reachability: ReachabilityResult;
}

/** True when a failed submit was the reachability guard, not some other error. */
export function isGuardRefusal(body: unknown): body is GuardRefusal {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as Partial<GuardRefusal>;
  return (
    typeof candidate.error === 'string' &&
    !!candidate.reachability &&
    candidate.reachability.reason === 'blocked'
  );
}

/**
 * The single source of the user-facing wording, so all three submit paths phrase
 * the same problem identically. Returns null when there's nothing to say.
 */
export function describeReachability(result: ReachabilityResult): string | null {
  if (result.ok || !result.reason) return null;

  switch (result.reason) {
    case 'blocked':
      return `Your host returned ${result.status ?? 'an error'} to our crawler. Podcast Index and podcast apps will be blocked the same way, so the feed won't index — check your Cloudflare bot protection (Security → Bots) or your firewall/WAF rules.`;
    case 'not-found':
      return `Your host returned ${result.status ?? '404'} — nothing is published at this URL. Double-check the address before submitting.`;
    case 'not-xml':
      return "This URL returns a web page, not RSS. Podcast Index won't find a feed here — check that you're submitting the feed URL and not the site URL.";
    case 'timeout':
      return "Your host didn't respond within 10 seconds. Podcast Index may time out too — worth confirming the feed loads reliably.";
    case 'dns':
      return "We couldn't resolve that domain. Check the spelling, or wait if DNS was set up very recently.";
    case 'server-error':
      return result.status
        ? `Your host returned ${result.status}. Podcast Index won't be able to read the feed until that's fixed.`
        : "We couldn't reach that URL. Podcast Index may not be able to either.";
    default:
      return null;
  }
}
