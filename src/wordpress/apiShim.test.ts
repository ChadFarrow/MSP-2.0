import { describe, it, expect } from 'vitest';
import { rewriteApiUrl } from './apiShim';
import type { WordPressConfig } from '../utils/runtimeTarget';

const cfg: WordPressConfig = {
  restUrl: 'https://artist.example/wp-json/',
  nonce: 'n0nce',
  siteUrl: 'https://artist.example',
  feedBaseUrl: 'https://artist.example/msp-feeds/',
  mspApi: 'https://musicsideproject.com',
};

describe('rewriteApiUrl', () => {
  it('sends MSP API calls to the MSP origin, query intact', () => {
    expect(rewriteApiUrl('/api/pisearch?q=a%20b', cfg)).toEqual({
      url: 'https://musicsideproject.com/api/pisearch?q=a%20b',
      wordpress: false,
    });
    expect(rewriteApiUrl('/api/hosted/abc.xml', cfg)?.url).toBe('https://musicsideproject.com/api/hosted/abc.xml');
    expect(rewriteApiUrl('/api/hosted/', cfg)?.url).toBe('https://musicsideproject.com/api/hosted/');
  });

  it('sends the feed proxy to WordPress with its query', () => {
    expect(rewriteApiUrl('/api/proxy-feed?url=https%3A%2F%2Fx.example%2Ffeed.xml', cfg)).toEqual({
      url: 'https://artist.example/wp-json/msp/v1/proxy-feed?url=https%3A%2F%2Fx.example%2Ffeed.xml',
      wordpress: true,
    });
  });

  it('does not treat a longer name that starts with proxy-feed as the proxy', () => {
    expect(rewriteApiUrl('/api/proxy-feedback', cfg)?.wordpress).toBe(false);
  });

  it('leaves everything else alone', () => {
    expect(rewriteApiUrl('https://musicsideproject.com/api/pisearch', cfg)).toBeNull();
    expect(rewriteApiUrl('/wp-json/msp/v1/feeds', cfg)).toBeNull();
    expect(rewriteApiUrl('/apiary', cfg)).toBeNull();
    expect(rewriteApiUrl('./info.md', cfg)).toBeNull();
  });
});
