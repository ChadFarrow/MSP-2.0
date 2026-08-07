import { useState, useEffect } from 'react';
import {
  checkFeedReachable,
  describeReachability,
  shouldCheckReachability
} from '../utils/feedReachability';

/** Long enough that typing a URL doesn't fire a request per keystroke. */
const DEBOUNCE_MS = 800;

interface CheckedUrl {
  url: string;
  warning: string | null;
}

/**
 * Debounced reachability check for a feed-URL input.
 *
 * Returns a warning string to render beneath the field, or null. Callers must
 * NOT gate their submit button on this — see `feedReachability.ts` for why.
 *
 * @param enabled pass false while the URL fails other validation (e.g.
 *   `getFeedUrlError`), so we don't spend a request on a URL we already reject.
 */
export function useFeedReachability(url: string, enabled = true) {
  const [checked, setChecked] = useState<CheckedUrl | null>(null);

  useEffect(() => {
    if (!enabled || !shouldCheckReachability(url)) return;

    const controller = new AbortController();
    let cancelled = false;

    const timer = setTimeout(() => {
      checkFeedReachable(url, controller.signal).then((result) => {
        if (cancelled) return;
        setChecked({ url, warning: describeReachability(result) });
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, enabled]);

  // The stored result carries the URL it was fetched for, so an edited URL
  // simply stops matching and the stale warning disappears on its own — no
  // reset-via-setState in the effect body.
  const isCurrent = checked?.url === url;
  const warning = enabled && isCurrent ? (checked?.warning ?? null) : null;
  const checking = enabled && shouldCheckReachability(url) && !isCurrent;

  return { warning, checking };
}
