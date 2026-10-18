import { useFeed } from '../../../store/feedStore';
import { PublisherInfoSection } from './PublisherInfoSection';
import { PublisherArtworkSection } from './PublisherArtworkSection';
import { CatalogFeedsSection } from './CatalogFeedsSection';
import { PublisherValueSection } from './PublisherValueSection';
import { PublisherFundingSection } from './PublisherFundingSection';
import { PublisherFeedReminderSection } from './PublisherFeedReminderSection';
import { DownloadCatalogSection } from './DownloadCatalogSection';
import { PublishSection } from './PublishSection';
import { shouldShowPublishSection } from '../../../utils/publisherPublish';
import { FeedCheckPanel } from '../../FeedCheckPanel';

export function PublisherEditor() {
  const { state, dispatch } = useFeed();
  const { publisherFeed, publisherFeedInstance } = state;

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

  // Show PublishSection whenever the catalog has an MSP-hosted album: it writes the
  // link back into those, and skips the rest. It used to need every album on MSP,
  // so one Wavlake or self-hosted album hid it and no MSP album got its link.
  const showPublishSection = shouldShowPublishSection(publisherFeed.remoteItems);

  return (
    <div className="main-content">
      <div className="editor-panel">
        <FeedCheckPanel />
        <PublisherInfoSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <PublisherArtworkSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <CatalogFeedsSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <PublisherValueSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <PublisherFundingSection publisherFeed={publisherFeed} dispatch={dispatch} />
        <PublisherFeedReminderSection publisherFeed={publisherFeed} feedInstance={publisherFeedInstance} />
        <DownloadCatalogSection publisherFeed={publisherFeed} feedInstance={publisherFeedInstance} />
        {showPublishSection && <PublishSection publisherFeed={publisherFeed} />}
      </div>
    </div>
  );
}
