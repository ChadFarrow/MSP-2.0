import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublisherFeed, RemoteItem } from '../../../types/feed';
import { checkAlbumLinkBack, getPlatformHost, isMspHosted, type LinkBackResult } from '../../../utils/publisherControl';

export type LinkBackEntry = LinkBackResult | 'checking';

export interface LinkBackState {
  statusFor(item: RemoteItem): LinkBackEntry | undefined;
  checkItems(items: RemoteItem[]): Promise<void>;
  checkAll(): Promise<void>;
  checkingAll: boolean;
}

// Self-hosted checks go through /api/proxy-feed (60 an hour per IP), so a few at once.
const MAX_CONCURRENT = 3;

const keyFor = (guid: string, item: RemoteItem) => `${guid}|${item.feedUrl ?? ''}`;

/**
 * Whether each catalog album points back, for this session only.
 *
 * Results are keyed by publisher GUID + album URL, so a different publisher feed
 * never shows another's results and nothing needs clearing on import. Only MSP
 * albums are checked automatically — on open, after an import, and after a
 * publish (each bumps feedInstance) — because they're read same-origin and cost
 * no proxy requests. A self-hosted album is checked when it's added, or when the
 * artist asks with "Check links back".
 */
export function useLinkBackStatus(publisherFeed: PublisherFeed | null, feedInstance: number): LinkBackState {
  const [results, setResults] = useState<Record<string, LinkBackEntry>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  // Read through a ref so checkItems stays stable: depending on the GUID would
  // re-run the automatic check on every keystroke in the GUID field.
  const feedRef = useRef(publisherFeed);
  useEffect(() => {
    feedRef.current = publisherFeed;
  });

  const checkItems = useCallback(async (items: RemoteItem[]) => {
    const guid = feedRef.current?.podcastGuid ?? '';
    const seen = new Set<string>();
    const queue = items.filter(item => {
      if (!item.feedUrl || getPlatformHost(item.feedUrl)) return false;
      const key = keyFor(guid, item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (queue.length === 0) return;

    // Yield first: this also runs from an effect, which must not set state synchronously.
    await Promise.resolve();
    setResults(prev => ({ ...prev, ...Object.fromEntries(queue.map(item => [keyFor(guid, item), 'checking' as const])) }));

    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const result = await checkAlbumLinkBack(item, guid);
        const key = keyFor(guid, item);
        setResults(prev => ({ ...prev, [key]: result }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, worker));
  }, []);

  const checkAll = useCallback(async () => {
    setCheckingAll(true);
    try {
      await checkItems(feedRef.current?.remoteItems ?? []);
    } finally {
      setCheckingAll(false);
    }
  }, [checkItems]);

  useEffect(() => {
    void checkItems((feedRef.current?.remoteItems ?? []).filter(item => isMspHosted(item.feedUrl ?? '')));
  }, [feedInstance, checkItems]);

  const statusFor = (item: RemoteItem) => results[keyFor(publisherFeed?.podcastGuid ?? '', item)];

  return { statusFor, checkItems, checkAll, checkingAll };
}
