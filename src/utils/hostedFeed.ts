// Hosted feed API utilities
import { hostedFeedStorage, type HostedFeedInfo } from './storage';
import { createAdminAuthHeader } from './adminAuth';
import { hasSigner } from './nostrSigner';

// Re-export type for backward compatibility
export type { HostedFeedInfo };

/**
 * Get stored hosted feed info from localStorage
 */
export function getHostedFeedInfo(podcastGuid: string): HostedFeedInfo | null {
  return hostedFeedStorage.load(podcastGuid);
}

/**
 * Save hosted feed info to localStorage
 */
export function saveHostedFeedInfo(podcastGuid: string, info: HostedFeedInfo): void {
  hostedFeedStorage.save(podcastGuid, info);
}

/**
 * Clear hosted feed info from localStorage
 */
export function clearHostedFeedInfo(podcastGuid: string): void {
  hostedFeedStorage.clear(podcastGuid);
}

interface CreateFeedResponse {
  feedId: string;
  url: string;
  blobUrl: string;
  podcastIndexId?: number;
  isDraft?: boolean;
}



interface UpdateFeedResponse {
  success: boolean;
  podcastIndexId?: number;
  isDraft?: boolean;
}

/**
 * Build the HostedFeedInfo to persist when opening an already-hosted feed for editing
 * from the Artist Profile. SaveModal decides PUT-vs-POST purely from getHostedFeedInfo
 * (keyed by podcastGuid), so without this the next Save would attempt a POST and hit the
 * 409 "feed already exists" guard. feedId === podcastGuid for hosted feeds.
 */
export function buildHostedInfoForEdit(
  feedId: string,
  ownerPubkey: string,
  now: number = Date.now()
): HostedFeedInfo {
  return {
    feedId,
    createdAt: now,
    lastUpdated: now,
    ownerPubkey,
    linkedAt: now,
  };
}

/**
 * Build the stable URL for a hosted feed.
 * Always uses the canonical domain (VITE_CANONICAL_URL, else musicsideproject.com)
 * so feed URLs never bake in a preview/legacy host like msp.podtards.com.
 */
export function buildHostedUrl(feedId: string): string {
  const base = (import.meta.env.VITE_CANONICAL_URL || 'https://musicsideproject.com').replace(/\/$/, '');
  return `${base}/api/hosted/${feedId}.xml`;
}

/**
 * Create a hosted feed with Nostr authentication (required)
 * The feed is linked to the user's Nostr identity from creation.
 */
export async function createHostedFeedWithNostr(
  xml: string,
  title: string,
  podcastGuid: string,
  isDraft?: boolean
): Promise<CreateFeedResponse> {
  if (!hasSigner()) {
    throw new Error('Nostr login required to host a feed');
  }

  const url = `${window.location.origin}/api/hosted`;
  const authHeader = await createAdminAuthHeader(url, 'POST');

  const response = await fetch('/api/hosted', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify({ xml, title, podcastGuid, isDraft })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create feed' }));
    throw new Error(error.error || 'Failed to create feed');
  }

  return response.json();
}

/**
 * Update a hosted feed with Nostr authentication
 */
export async function updateHostedFeedWithNostr(
  feedId: string,
  xml: string,
  title: string,
  isDraft?: boolean
): Promise<UpdateFeedResponse> {
  if (!hasSigner()) {
    throw new Error('Nostr login required to update a feed');
  }

  const url = `${window.location.origin}/api/hosted/${feedId}`;
  const authHeader = await createAdminAuthHeader(url, 'PUT');

  const response = await fetch(`/api/hosted/${feedId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify({ xml, title, isDraft })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update feed' }));
    throw new Error(error.error || 'Failed to update feed');
  }

  return response.json();
}

/**
 * Delete a hosted feed with Nostr authentication
 */
export async function deleteHostedFeedWithNostr(feedId: string): Promise<void> {
  if (!hasSigner()) {
    throw new Error('Nostr login required to delete a feed');
  }

  const url = `${window.location.origin}/api/hosted/${feedId}`;
  const authHeader = await createAdminAuthHeader(url, 'DELETE');

  const response = await fetch(`/api/hosted/${feedId}`, {
    method: 'DELETE',
    headers: { 'Authorization': authHeader }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete feed' }));
    throw new Error(error.error || 'Failed to delete feed');
  }
}
