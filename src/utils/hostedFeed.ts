// Hosted feed API utilities
import { hostedFeedStorage, type HostedFeedInfo } from './storage';
import { createAdminAuthHeader } from './adminAuth';
import { hasSigner } from './nostrSigner';
import { withEmailAuth, isEmailLoggedIn } from './emailSession';

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
  podcastIndexId?: number;
  isDraft?: boolean;
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
 * Fetch a hosted-feed API endpoint, throwing a friendly error on a non-2xx
 * (reusing the server's `error` field when present). Shared by every call below.
 */
async function hostedRequest<T = unknown>(
  input: string,
  init: RequestInit,
  failMessage: string
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: failMessage }));
    throw new Error(error.error || failMessage);
  }
  return response.json();
}

/**
 * Create a new hosted feed
 */
export async function createHostedFeed(
  xml: string,
  title: string,
  podcastGuid: string,
  editToken?: string,
  isDraft?: boolean
): Promise<CreateFeedResponse> {
  return hostedRequest<CreateFeedResponse>('/api/hosted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml, title, podcastGuid, editToken, isDraft })
  }, 'Failed to create feed');
}

interface UpdateFeedResponse {
  success: boolean;
  podcastIndexId?: number;
  isDraft?: boolean;
}

/**
 * Update an existing hosted feed
 */
export async function updateHostedFeed(
  feedId: string,
  editToken: string,
  xml: string,
  title: string,
  isDraft?: boolean
): Promise<UpdateFeedResponse> {
  return hostedRequest<UpdateFeedResponse>(`/api/hosted/${feedId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Edit-Token': editToken
    },
    body: JSON.stringify({ xml, title, isDraft })
  }, 'Failed to update feed');
}

/**
 * Delete a hosted feed
 */
export async function deleteHostedFeed(
  feedId: string,
  editToken: string
): Promise<void> {
  await hostedRequest(`/api/hosted/${feedId}`, {
    method: 'DELETE',
    headers: { 'X-Edit-Token': editToken }
  }, 'Failed to delete feed');
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
 * Backup file structure for hosted feeds
 */
export interface HostedFeedBackup {
  _info: string;
  album: string;
  feedUrl: string;
  feedId: string;
  podcastGuid: string;
  editToken: string;
  createdAt: string;
}

/**
 * Download a backup JSON file containing hosted feed credentials
 */
export function downloadHostedFeedBackup(
  feedId: string,
  editToken: string,
  albumTitle: string,
  podcastGuid?: string
): void {
  const backup: HostedFeedBackup = {
    _info: 'MSP Hosted Feed Backup - Keep this file safe!',
    album: albumTitle,
    feedUrl: buildHostedUrl(feedId),
    feedId: feedId,
    podcastGuid: podcastGuid || feedId,
    editToken: editToken,
    createdAt: new Date().toISOString()
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

// ============================================
// Nostr-authenticated API functions
// ============================================

/**
 * Create a hosted feed with Nostr authentication (for logged-in users)
 * The feed will be linked to the user's Nostr identity
 */
export async function createHostedFeedWithNostr(
  xml: string,
  title: string,
  podcastGuid: string,
  editToken?: string,
  isDraft?: boolean
): Promise<CreateFeedResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Add Nostr auth if available
  if (hasSigner()) {
    const url = `${window.location.origin}/api/hosted`;
    headers['Authorization'] = await createAdminAuthHeader(url, 'POST');
  }

  return hostedRequest<CreateFeedResponse>('/api/hosted', {
    method: 'POST',
    headers,
    body: JSON.stringify({ xml, title, podcastGuid, editToken, isDraft })
  }, 'Failed to create feed');
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
    throw new Error('Not logged in with Nostr');
  }

  const url = `${window.location.origin}/api/hosted/${feedId}`;
  const authHeader = await createAdminAuthHeader(url, 'PUT');

  return hostedRequest<UpdateFeedResponse>(`/api/hosted/${feedId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify({ xml, title, isDraft })
  }, 'Failed to update feed');
}

// ============================================
// Email-session-authenticated API functions
// ============================================

/**
 * Create a hosted feed authenticated by the current email session (if any).
 * Falls back to an anonymous create when not logged in with email.
 */
export async function createHostedFeedWithEmail(
  xml: string,
  title: string,
  podcastGuid: string,
  editToken?: string,
  isDraft?: boolean
): Promise<CreateFeedResponse> {
  return hostedRequest<CreateFeedResponse>('/api/hosted', {
    method: 'POST',
    headers: withEmailAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ xml, title, podcastGuid, editToken, isDraft })
  }, 'Failed to create feed');
}

/**
 * Update a hosted feed using the current email session.
 */
export async function updateHostedFeedWithEmail(
  feedId: string,
  xml: string,
  title: string,
  isDraft?: boolean
): Promise<UpdateFeedResponse> {
  if (!isEmailLoggedIn()) {
    throw new Error('Not logged in with email');
  }

  return hostedRequest<UpdateFeedResponse>(`/api/hosted/${feedId}`, {
    method: 'PUT',
    headers: withEmailAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ xml, title, isDraft })
  }, 'Failed to update feed');
}

/**
 * Delete a hosted feed using the current email session.
 */
export async function deleteHostedFeedWithEmail(feedId: string): Promise<void> {
  if (!isEmailLoggedIn()) {
    throw new Error('Not logged in with email');
  }

  await hostedRequest(`/api/hosted/${feedId}`, {
    method: 'DELETE',
    headers: withEmailAuth()
  }, 'Failed to delete feed');
}

interface LinkEmailResponse {
  success: boolean;
  message: string;
  emailLinked: boolean;
}

/**
 * Claim an existing feed with the current email session.
 * Requires the edit token (proves ownership); the session supplies the identity to attach.
 * Mirrors linkNostrToFeed.
 */
export async function linkEmailToFeed(
  feedId: string,
  editToken: string
): Promise<LinkEmailResponse> {
  if (!isEmailLoggedIn()) {
    throw new Error('Not logged in with email');
  }

  return hostedRequest<LinkEmailResponse>(`/api/hosted/${feedId}`, {
    method: 'PATCH',
    headers: withEmailAuth({ 'X-Edit-Token': editToken })
  }, 'Failed to link email identity');
}

interface LinkNostrResponse {
  success: boolean;
  message: string;
  pubkey: string;
}

/**
 * Link a Nostr identity to an existing feed
 * Requires both the edit token (proves ownership) and Nostr auth (identity to link)
 */
export async function linkNostrToFeed(
  feedId: string,
  editToken: string
): Promise<LinkNostrResponse> {
  if (!hasSigner()) {
    throw new Error('Not logged in with Nostr');
  }

  const url = `${window.location.origin}/api/hosted/${feedId}`;
  const authHeader = await createAdminAuthHeader(url, 'PATCH');

  return hostedRequest<LinkNostrResponse>(`/api/hosted/${feedId}`, {
    method: 'PATCH',
    headers: {
      'X-Edit-Token': editToken,
      'Authorization': authHeader
    }
  }, 'Failed to link Nostr identity');
}
