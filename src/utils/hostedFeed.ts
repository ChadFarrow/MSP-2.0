// Hosted feed API utilities for non-Nostr users
import { hostedFeedStorage, type HostedFeedInfo } from './storage';

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
  editToken: string;
  url: string;
  blobUrl: string;
}

/**
 * Create a new hosted feed
 */
export async function createHostedFeed(
  xml: string,
  title: string,
  podcastGuid: string
): Promise<CreateFeedResponse> {
  const response = await fetch('/api/hosted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml, title, podcastGuid })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create feed' }));
    throw new Error(error.error || 'Failed to create feed');
  }

  return response.json();
}

/**
 * Update an existing hosted feed
 */
export async function updateHostedFeed(
  feedId: string,
  editToken: string,
  xml: string,
  title: string
): Promise<void> {
  const response = await fetch(`/api/hosted/${feedId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Edit-Token': editToken
    },
    body: JSON.stringify({ xml, title })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update feed' }));
    throw new Error(error.error || 'Failed to update feed');
  }
}

/**
 * Delete a hosted feed
 */
export async function deleteHostedFeed(
  feedId: string,
  editToken: string
): Promise<void> {
  const response = await fetch(`/api/hosted/${feedId}`, {
    method: 'DELETE',
    headers: { 'X-Edit-Token': editToken }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete feed' }));
    throw new Error(error.error || 'Failed to delete feed');
  }
}

/**
 * Build the stable URL for a hosted feed
 */
export function buildHostedUrl(feedId: string): string {
  return `${window.location.origin}/api/hosted/${feedId}.xml`;
}
