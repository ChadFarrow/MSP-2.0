// Centralized localStorage utilities for MSP 2.0
import type { Album } from '../types/feed';
import type { NostrUser } from '../types/nostr';

// Storage keys
export const STORAGE_KEYS = {
  ALBUM_DATA: 'msp2-album-data',
  NOSTR_USER: 'msp2-nostr-user',
  HOSTED_PREFIX: 'msp2-hosted-',
  PENDING_HOSTED: 'msp2-pending-hosted'
} as const;

/**
 * Safely get an item from localStorage with JSON parsing
 */
function getItem<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as T;
    }
  } catch (e) {
    console.error(`Failed to load from localStorage (${key}):`, e);
  }
  return null;
}

/**
 * Safely set an item in localStorage with JSON stringification
 */
function setItem<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Failed to save to localStorage (${key}):`, e);
    return false;
  }
}

/**
 * Safely remove an item from localStorage
 */
function removeItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error(`Failed to remove from localStorage (${key}):`, e);
    return false;
  }
}

// Album storage operations
export const albumStorage = {
  load: (): Album | null => getItem<Album>(STORAGE_KEYS.ALBUM_DATA),
  save: (album: Album): boolean => setItem(STORAGE_KEYS.ALBUM_DATA, album),
  clear: (): boolean => removeItem(STORAGE_KEYS.ALBUM_DATA)
};

// Nostr user storage operations
export const nostrUserStorage = {
  load: (): NostrUser | null => getItem<NostrUser>(STORAGE_KEYS.NOSTR_USER),
  save: (user: NostrUser): boolean => setItem(STORAGE_KEYS.NOSTR_USER, user),
  clear: (): boolean => removeItem(STORAGE_KEYS.NOSTR_USER)
};

// Hosted feed info type (re-exported from hostedFeed)
export interface HostedFeedInfo {
  feedId: string;
  editToken: string;
  createdAt: number;
  lastUpdated: number;
}

// Hosted feed storage operations
export const hostedFeedStorage = {
  load: (podcastGuid: string): HostedFeedInfo | null =>
    getItem<HostedFeedInfo>(`${STORAGE_KEYS.HOSTED_PREFIX}${podcastGuid}`),

  save: (podcastGuid: string, info: HostedFeedInfo): boolean =>
    setItem(`${STORAGE_KEYS.HOSTED_PREFIX}${podcastGuid}`, info),

  clear: (podcastGuid: string): boolean =>
    removeItem(`${STORAGE_KEYS.HOSTED_PREFIX}${podcastGuid}`)
};

// Pending hosted credentials (temporary storage during import)
export const pendingHostedStorage = {
  load: (): HostedFeedInfo | null => getItem<HostedFeedInfo>(STORAGE_KEYS.PENDING_HOSTED),
  save: (info: HostedFeedInfo): boolean => setItem(STORAGE_KEYS.PENDING_HOSTED, info),
  clear: (): boolean => removeItem(STORAGE_KEYS.PENDING_HOSTED)
};
