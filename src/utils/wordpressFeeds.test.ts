import { describe, it, expect } from 'vitest';
import { wordPressFeedUrl } from './wordpressFeeds';

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
