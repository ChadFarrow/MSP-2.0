// Shared hook: fetch the MSP-hosted feeds owned by the logged-in Nostr user.
//
// GET /api/hosted/ is owner-filtered server-side for non-admins (api/hosted/index.ts
// line 88-89), and the list response already carries `author`/`medium` extracted from
// each feed's XML — so unlike CatalogFeedsSection's older inline fetch this hook does
// NOT re-fetch every {feedId}.xml just to read the medium. The client-side ownerPubkey
// filter is kept as defense-in-depth (admins would otherwise see every feed).
import { useState, useCallback, useRef } from 'react';
import { useNostr } from '../store/nostrStore';
import { createAdminAuthHeader } from './adminAuth';
import { checkSignerConnection } from './nostrSigner';

export interface MyHostedFeed {
  feedId: string;
  title?: string;
  author?: string;
  medium?: string;
  createdAt?: string | number;
  lastUpdated?: string | number;
  ownerPubkey?: string;
  podcastIndexId?: number;
  isDraft?: boolean;
}

export interface UseMyHostedFeedsResult {
  feeds: MyHostedFeed[];
  loading: boolean;
  error: string;
  hasFetched: boolean;
  refetch: () => Promise<MyHostedFeed[]>;
}

export function useMyHostedFeeds(): UseMyHostedFeedsResult {
  const { state: nostrState } = useNostr();
  const [feeds, setFeeds] = useState<MyHostedFeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasFetched, setHasFetched] = useState(false);
  // Guard against overlapping fetches (e.g. an auto-route lookup racing a manual refetch).
  const inFlight = useRef(false);

  const refetch = useCallback(async (): Promise<MyHostedFeed[]> => {
    const pubkey = nostrState.user?.pubkey;
    if (!nostrState.isLoggedIn || !pubkey) {
      setFeeds([]);
      setHasFetched(true);
      return [];
    }
    if (inFlight.current) return feeds;
    inFlight.current = true;

    setLoading(true);
    setError('');

    try {
      const health = await checkSignerConnection();
      if (!health.connected) {
        throw new Error(health.error ?? 'Nostr signer is not connected.');
      }

      const url = `${window.location.origin}/api/hosted/`;
      const authHeader = await createAdminAuthHeader(url, 'GET');
      const response = await fetch('/api/hosted/', {
        headers: { Authorization: authHeader },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch feeds');
      }

      const data = await response.json();
      const owned: MyHostedFeed[] = (data.feeds || []).filter(
        (feed: MyHostedFeed) => feed.ownerPubkey === pubkey
      );
      setFeeds(owned);
      setHasFetched(true);
      return owned;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feeds');
      setHasFetched(true);
      return [];
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [nostrState.isLoggedIn, nostrState.user?.pubkey, feeds]);

  return { feeds, loading, error, hasFetched, refetch };
}
