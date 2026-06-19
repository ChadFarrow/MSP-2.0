import { describe, it, expect } from 'vitest';
import { userBlobPath, userBlobPrefix, buildStoredKeyRecord } from './authUtils';

const GOOGLE_ID = '110248495921238986420';

describe('userBlobPath / userBlobPrefix', () => {
  it('userBlobPath is the full .json object name used for put()', () => {
    const path = userBlobPath(GOOGLE_ID);
    expect(path.startsWith('auth/users/')).toBe(true);
    expect(path.endsWith('.json')).toBe(true);
  });

  it('userBlobPrefix has no extension so it matches addRandomSuffix output on list()', () => {
    const prefix = userBlobPrefix(GOOGLE_ID);
    expect(prefix.startsWith('auth/users/')).toBe(true);
    expect(prefix.endsWith('.json')).toBe(false);
  });

  it('the prefix is a prefix of the deterministic path', () => {
    expect(userBlobPath(GOOGLE_ID).startsWith(userBlobPrefix(GOOGLE_ID))).toBe(true);
  });

  it('the prefix matches a random-suffixed blob name (the list() lookup invariant)', () => {
    // Vercel Blob addRandomSuffix inserts `-<random>` before the extension.
    const prefix = userBlobPrefix(GOOGLE_ID);
    const suffixed = `${prefix}-aB3xZ9.json`;
    expect(suffixed.startsWith(prefix)).toBe(true);
  });

  it('is deterministic for the same id and distinct across ids', () => {
    expect(userBlobPrefix(GOOGLE_ID)).toBe(userBlobPrefix(GOOGLE_ID));
    expect(userBlobPrefix(GOOGLE_ID)).not.toBe(userBlobPrefix('999999999999999999999'));
  });
});

describe('buildStoredKeyRecord', () => {
  it('stores only non-PII key material', () => {
    const record = buildStoredKeyRecord('pubkeyhex', 'encryptednsec', '2026-06-19T00:00:00.000Z');
    expect(record).toEqual({
      pubkey: 'pubkeyhex',
      encryptedNsec: 'encryptednsec',
      createdAt: '2026-06-19T00:00:00.000Z',
    });
  });

  it('never includes PII fields (email / displayName / picture)', () => {
    const record = buildStoredKeyRecord('pubkeyhex', 'encryptednsec', '2026-06-19T00:00:00.000Z') as Record<string, unknown>;
    expect(Object.keys(record)).not.toContain('email');
    expect(Object.keys(record)).not.toContain('displayName');
    expect(Object.keys(record)).not.toContain('picture');
  });
});
