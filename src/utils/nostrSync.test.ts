import { describe, it, expect } from 'vitest';
import { mergeProfileFields } from './nostrSync';

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
});
