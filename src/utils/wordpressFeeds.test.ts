import { afterEach, describe, it, expect, vi } from 'vitest';
import { saveToWordPress, wordPressFeedUrl } from './wordpressFeeds';

describe('wordPressFeedUrl', () => {
  const cfg = {
    restUrl: 'https://artist.example/wp-json/',
    nonce: 'n',
    siteUrl: 'https://artist.example',
    feedBaseUrl: 'https://artist.example/msp-feeds/',
    mspApi: 'https://musicsideproject.com',
  };

  it('puts the GUID under the plugin feed prefix', () => {
    expect(wordPressFeedUrl('917393e3-1b1e-5cef-ace4-edaa54e1f810', cfg))
      .toBe('https://artist.example/msp-feeds/917393e3-1b1e-5cef-ace4-edaa54e1f810.xml');
  });

  it('works with the query-string prefix used without pretty permalinks', () => {
    expect(wordPressFeedUrl('abc', { ...cfg, feedBaseUrl: 'https://artist.example/?msp_feed=' }))
      .toBe('https://artist.example/?msp_feed=abc.xml');
  });

  it('is empty outside WordPress', () => {
    expect(wordPressFeedUrl('abc', null)).toBe('');
  });
});

describe('a WordPress request with an expired sign-in', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('says to reload, because WordPress words it "Cookie check failed"', async () => {
    vi.stubEnv('MODE', 'wordpress');
    vi.stubGlobal('window', { MSP_WP: { restUrl: 'https://artist.example/wp-json/', nonce: 'old', feedBaseUrl: 'https://artist.example/msp-feeds/' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed', data: { status: 403 } }),
      { status: 403 },
    )));
    await expect(saveToWordPress('abc', '<rss></rss>', 'Title')).rejects.toThrow(/expired.*Reload/);
  });

  it('keeps any other WordPress message', async () => {
    vi.stubEnv('MODE', 'wordpress');
    vi.stubGlobal('window', { MSP_WP: { restUrl: 'https://artist.example/wp-json/', nonce: 'ok', feedBaseUrl: 'https://artist.example/msp-feeds/' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'msp_not_rss', message: 'That is not an RSS feed.', data: { status: 400 } }),
      { status: 400 },
    )));
    await expect(saveToWordPress('abc', 'nope', 'Title')).rejects.toThrow('That is not an RSS feed.');
  });
});
