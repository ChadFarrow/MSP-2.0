import { describe, it, expect, vi } from 'vitest';

const { signMock, publishMock } = vi.hoisted(() => ({
  signMock: vi.fn(async (e: { kind: number; content: string }) => ({ ...e, id: 'fake-event-id', sig: 'fake-sig' })),
  publishMock: vi.fn(async () => ({ successCount: 1, results: [] })),
}));

vi.mock('./nostrSigner', () => ({
  hasSigner: () => true,
  getPublicKeyWithTimeout: vi.fn(async () => 'pubkeyhex'),
  signEventWithTimeout: signMock,
}));

vi.mock('./nostrRelay', () => ({
  DEFAULT_RELAYS: ['wss://relay.test'],
  MUSIC_RELAYS: ['wss://relay.test'],
  connectRelay: vi.fn(),
  collectEvents: vi.fn(),
  publishEventToRelays: publishMock,
}));

import { mergeProfileFields, publishProfileMetadata } from './nostrSync';

describe('mergeProfileFields', () => {
  it('fills name, display_name, and picture for a null (fresh) profile', () => {
    const r = mergeProfileFields(null, { name: 'Doerfels', picture: 'https://img/a.png' });
    expect(r).toEqual({ name: 'Doerfels', display_name: 'Doerfels', picture: 'https://img/a.png' });
  });

  it('returns null when the existing profile already has name + picture (nothing to fill)', () => {
    const r = mergeProfileFields(
      { name: 'Existing', display_name: 'Existing', picture: 'https://old.png', lud16: 'a@b.com' },
      { name: 'New', picture: 'https://new.png' }
    );
    expect(r).toBeNull();
  });

  it('fills only empty fields and preserves unrelated ones', () => {
    const r = mergeProfileFields(
      { picture: 'https://old.png', lud16: 'a@b.com' },
      { name: 'New', picture: 'https://new.png' }
    );
    expect(r).toEqual({
      name: 'New',
      display_name: 'New',
      picture: 'https://old.png',
      lud16: 'a@b.com',
    });
  });

  it('returns null when the supplied fields are empty/whitespace', () => {
    expect(mergeProfileFields(null, { name: '   ', picture: '' })).toBeNull();
  });

  it('overwrite: replaces an existing name/display_name/picture (page 3 authoritative)', () => {
    const r = mergeProfileFields(
      { name: 'Old Name', display_name: 'Old Name', picture: 'https://old.png', lud16: 'a@b.com' },
      { name: 'New Name', picture: 'https://new.png' },
      { overwrite: true }
    );
    expect(r).toEqual({
      name: 'New Name',
      display_name: 'New Name',
      picture: 'https://new.png',
      lud16: 'a@b.com',
    });
  });

  it('overwrite: returns null when provided values equal the existing ones (no redundant publish)', () => {
    const r = mergeProfileFields(
      { name: 'Same', display_name: 'Same', picture: 'https://same.png' },
      { name: 'Same', picture: 'https://same.png' },
      { overwrite: true }
    );
    expect(r).toBeNull();
  });
});

describe('publishProfileMetadata', () => {
  it('signs a kind-0 event carrying the profile JSON and publishes it', async () => {
    const res = await publishProfileMetadata({ name: 'Doerfels', display_name: 'Doerfels', picture: 'https://img/a.png' });
    expect(res.success).toBe(true);
    expect(res.eventId).toBe('fake-event-id');

    const signedEvent = signMock.mock.calls[0][0];
    expect(signedEvent.kind).toBe(0);
    expect(JSON.parse(signedEvent.content)).toMatchObject({
      name: 'Doerfels',
      display_name: 'Doerfels',
      picture: 'https://img/a.png',
    });
    expect(publishMock).toHaveBeenCalledTimes(1);
  });
});
