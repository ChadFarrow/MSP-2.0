import { useFeed } from '../../../store/feedStore';
import { PublisherInfoSection } from './PublisherInfoSection';
import { PublisherArtworkSection } from './PublisherArtworkSection';
import { PublisherValueSection } from './PublisherValueSection';
import { PublisherFundingSection } from './PublisherFundingSection';
import { PublisherFeedReminderSection } from './PublisherFeedReminderSection';
import { CatalogFeedsSection } from './CatalogFeedsSection';
import { DownloadCatalogSection } from './DownloadCatalogSection';
import { PublishSection } from './PublishSection';
import { getCatalogFeedsStatus } from '../../../utils/publisherPublish';

export function PublisherEditor() {
  const { state, dispatch } = useFeed();
  const { publisherFeed } = state;

  if (!publisherFeed) {
    return (
      <div className="main-content">
        <div className="editor-panel">
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No publisher feed loaded. Create a new publisher feed or import an existing one.
          </div>
        </div>
      </div>
    );
  }

  // Only show PublishSection if there are catalog feeds and all are MSP-hosted
  const catalogStatus = getCatalogFeedsStatus(publisherFeed.remoteItems);
  const allFeedsHosted = catalogStatus.items.length > 0 && catalogStatus.items.every(item => item.isHosted);

  return (
    <div className="main-content">
      <div className="editor-panel">
        <PublisherInfoSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <PublisherArtworkSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <PublisherValueSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <PublisherFundingSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <DownloadCatalogSection publisherFeed={publisherFeed} />
        <PublisherFeedReminderSection />
        <CatalogFeedsSection publisherFeed={publisherFeed} dispatch={dispatch} />
        {allFeedsHosted && <PublishSection publisherFeed={publisherFeed} />}
      </div>
    </div>
  );
}
