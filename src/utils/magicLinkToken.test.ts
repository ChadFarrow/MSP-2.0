import { describe, it, expect } from 'vitest';
import { extractMagicLinkToken } from './emailSession';

const TOKEN = 'Xq3v9bK2mN8pR4sT6uW1yZ0aB5cD7eF9gH2iJ4kL6mN';

describe('extractMagicLinkToken', () => {
  it('reads the token from the emailed URL', () => {
    expect(extractMagicLinkToken(`https://musicsideproject.com/auth/verify?token=${TOKEN}`)).toBe(TOKEN);
  });

  it('tolerates the whitespace a copy from an email client adds', () => {
    expect(extractMagicLinkToken(`  https://musicsideproject.com/auth/verify?token=${TOKEN}\n`)).toBe(TOKEN);
  });

  it('accepts a bare token', () => {
    expect(extractMagicLinkToken(TOKEN)).toBe(TOKEN);
  });

  it('refuses text that is neither', () => {
    expect(extractMagicLinkToken('')).toBeNull();
    expect(extractMagicLinkToken('https://musicsideproject.com/auth/verify')).toBeNull();
    expect(extractMagicLinkToken('hello there')).toBeNull();
    expect(extractMagicLinkToken('https://x.example/?token=<script>')).toBeNull();
  });
});
