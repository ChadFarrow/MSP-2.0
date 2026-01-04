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
 * Generate a random edit token (32 bytes, base64url encoded)
 */
export function generateEditToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Convert to base64url
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Create a new hosted feed
 */
export async function createHostedFeed(
  xml: string,
  title: string,
  podcastGuid: string,
  editToken?: string
): Promise<CreateFeedResponse> {
  const response = await fetch('/api/hosted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml, title, podcastGuid, editToken })
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

/**
 * Backup file structure for hosted feeds
 */
export interface HostedFeedBackup {
  msp_hosted_feed_backup: {
    version: number;
    created_at: string;
    feed_id: string;
    edit_token: string;
    feed_url: string;
    podcast_guid: string;
    album_title: string;
    warning: string;
  };
}

/**
 * Download a backup JSON file containing hosted feed credentials
 */
export function downloadHostedFeedBackup(
  feedId: string,
  editToken: string,
  albumTitle: string,
  podcastGuid: string
): void {
  const backup: HostedFeedBackup = {
    msp_hosted_feed_backup: {
      version: 1,
      created_at: new Date().toISOString(),
      feed_id: feedId,
      edit_token: editToken,
      feed_url: buildHostedUrl(feedId),
      podcast_guid: podcastGuid,
      album_title: albumTitle,
      warning: 'Keep this file safe! Anyone with this token can edit or delete your feed.'
    }
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Generate filename: sanitize album title
  const titleSlug = albumTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'untitled';
  const feedIdPrefix = feedId.slice(0, 8);
  const filename = `msp-feed-backup-${titleSlug}-${feedIdPrefix}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
