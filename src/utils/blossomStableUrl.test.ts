import { afterEach, describe, it, expect, vi } from 'vitest';
import { blossomStableUrl } from './blossom';

describe('blossomStableUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('names this site on the website, which serves /api/feed', () => {
    vi.stubGlobal('window', { location: { origin: 'https://new.musicsideproject.com' } });
    expect(blossomStableUrl('npub1abc', 'guid-1')).toBe('https://new.musicsideproject.com/api/feed/npub1abc/guid-1.xml');
  });

  it('names the MSP API in the WordPress plugin, because a WordPress site has no /api/feed', () => {
    vi.stubEnv('MODE', 'wordpress');
    vi.stubGlobal('window', {
      location: { origin: 'https://artist.example' },
      MSP_WP: {
        restUrl: 'https://artist.example/wp-json/',
        nonce: 'n',
        feedBaseUrl: 'https://artist.example/msp-feeds/',
        mspApi: 'https://musicsideproject.com',
      },
    });
    expect(blossomStableUrl('npub1abc', 'guid-1')).toBe('https://musicsideproject.com/api/feed/npub1abc/guid-1.xml');
  });
});
