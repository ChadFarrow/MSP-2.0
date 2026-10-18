import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RemoteItem } from '../types/feed';

vi.mock('./nostrSigner', () => ({ hasSigner: vi.fn(() => false) }));
vi.mock('./hostedFeed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./hostedFeed')>()),
  getHostedFeedInfo: vi.fn(() => null),
  updateHostedFeed: vi.fn(async () => ({})),
  updateHostedFeedWithNostr: vi.fn(async () => ({})),
}));
vi.mock('./publisherControl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publisherControl')>()),
  fetchCatalogFeedXml: vi.fn(),
}));

import { processCatalogFeed, shouldShowPublishSection } from './publisherPublish';
import { fetchCatalogFeedXml } from './publisherControl';
import { getHostedFeedInfo, updateHostedFeed, updateHostedFeedWithNostr } from './hostedFeed';

const PUBLISHER = 'e3e2e758-6c83-41e3-87f2-d3c64d3011f8';
const PUBLISHER_URL = `https://musicsideproject.com/api/hosted/${PUBLISHER}.xml`;
const ALBUM = '27735a10-3775-503d-b038-70b4b7d536ab';
const MSP_URL = `https://new.musicsideproject.com/api/hosted/${ALBUM}.xml`;
const WAVLAKE_URL = 'https://wavlake.com/feed/music/a82acc2f-3440-491c-94c2-d27bebf6cfe6';
const SELF_URL = 'https://headstarts.uk/msp/longy/Lady/Lady-You-Shot-Me.xml';

const albumXml = (publisherXml = '') => `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>The EP (Amnesia)</title>
    <description>d</description>
    <podcast:guid>${ALBUM}</podcast:guid>
    <podcast:medium>music</podcast:medium>
    ${publisherXml}
  </channel>
</rss>`;

const item = (feedUrl: string, feedGuid = ALBUM): RemoteItem => ({ feedGuid, feedUrl, title: 'Album', medium: 'music' });

beforeEach(() => {
  vi.clearAllMocks();
  // processCatalogFeed fires a background /api/pubnotify after an update.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' })));
});

describe('shouldShowPublishSection', () => {
  it('shows when any catalog album is on MSP', () => {
    expect(shouldShowPublishSection([item(MSP_URL), item(WAVLAKE_URL), item(SELF_URL)])).toBe(true);
  });
  it('hides when no catalog album is on MSP', () => {
    expect(shouldShowPublishSection([item(WAVLAKE_URL), item(SELF_URL)])).toBe(false);
    expect(shouldShowPublishSection([])).toBe(false);
  });
});

describe('processCatalogFeed', () => {
  it('skips a self-hosted album without fetching it', async () => {
    const result = await processCatalogFeed(item(SELF_URL), PUBLISHER, PUBLISHER_URL);
    expect(result.status).toBe('skipped');
    expect(result.message).toBe('Not on MSP: upload the new version from Download Catalog to your host');
    expect(fetchCatalogFeedXml).not.toHaveBeenCalled();
  });

  it('skips a Wavlake album without fetching it', async () => {
    const result = await processCatalogFeed(item(WAVLAKE_URL), PUBLISHER, PUBLISHER_URL);
    expect(result.status).toBe('skipped');
    expect(result.message).toBe("Hosted on Wavlake: can't be updated");
    expect(fetchCatalogFeedXml).not.toHaveBeenCalled();
  });

  it('fetches an MSP album through fetchCatalogFeedXml', async () => {
    vi.mocked(fetchCatalogFeedXml).mockResolvedValue(albumXml());
    await processCatalogFeed(item(MSP_URL), PUBLISHER, PUBLISHER_URL);
    expect(fetchCatalogFeedXml).toHaveBeenCalledWith(MSP_URL);
  });

  it('leaves an MSP album that names another publisher alone', async () => {
    const other = '<podcast:publisher><podcast:remoteItem medium="publisher" feedGuid="c0d95236-3400-43e6-9721-d3904f182767"/></podcast:publisher>';
    vi.mocked(fetchCatalogFeedXml).mockResolvedValue(albumXml(other));
    vi.mocked(getHostedFeedInfo).mockReturnValue({ feedId: ALBUM, editToken: 't', createdAt: 0, lastUpdated: 0 });
    const result = await processCatalogFeed(item(MSP_URL), PUBLISHER, PUBLISHER_URL);
    expect(result.status).toBe('skipped');
    expect(result.message).toBe('Names a different publisher feed: left unchanged');
    expect(updateHostedFeed).not.toHaveBeenCalled();
    expect(updateHostedFeedWithNostr).not.toHaveBeenCalled();
  });

  it('still updates an MSP album it has a record for', async () => {
    vi.mocked(fetchCatalogFeedXml).mockResolvedValue(albumXml());
    vi.mocked(getHostedFeedInfo).mockReturnValue({ feedId: ALBUM, editToken: 't', createdAt: 0, lastUpdated: 0 });
    const result = await processCatalogFeed(item(MSP_URL), PUBLISHER, PUBLISHER_URL);
    expect(result.status).toBe('updated');
    expect(updateHostedFeed).toHaveBeenCalledTimes(1);
    const [feedId, token, xml] = vi.mocked(updateHostedFeed).mock.calls[0];
    expect(feedId).toBe(ALBUM);
    expect(token).toBe('t');
    expect(xml).toContain(`feedGuid="${PUBLISHER}"`);
  });
});
