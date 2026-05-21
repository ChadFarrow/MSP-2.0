import type { ReactNode } from 'react';
import { useFeed } from '../../../store/feedStore';
import { PublisherInfoSection } from './PublisherInfoSection';
import { PublisherArtworkSection } from './PublisherArtworkSection';
import { CatalogFeedsSection } from './CatalogFeedsSection';
import { PublisherValueSection } from './PublisherValueSection';
import { PublisherFundingSection } from './PublisherFundingSection';
import { PublisherFeedReminderSection } from './PublisherFeedReminderSection';
import { DownloadCatalogSection } from './DownloadCatalogSection';
import { PublishSection } from './PublishSection';
import { getCatalogFeedsStatus } from '../../../utils/publisherPublish';

interface PublisherEditorProps {
  chromeless?: boolean;
}

export function PublisherEditor({ chromeless = false }: PublisherEditorProps = {}) {
  const { state, dispatch } = useFeed();
  const { publisherFeed } = state;

  const wrap = (content: ReactNode) => chromeless ? content : (
    <div className="main-content">
      <div className="editor-panel">
        {content}
      </div>
    </div>
  );

  if (!publisherFeed) {
    return wrap(
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No publisher feed loaded. Create a new publisher feed or import an existing one.
      </div>
    );
  }

  // Only show PublishSection if there are catalog feeds and all are MSP-hosted
  const catalogStatus = getCatalogFeedsStatus(publisherFeed.remoteItems);
  const allFeedsHosted = catalogStatus.items.length > 0 && catalogStatus.items.every(item => item.isHosted);

  return wrap(
    <>
      <PublisherInfoSection publisherFeed={publisherFeed} dispatch={dispatch} />
      <PublisherArtworkSection publisherFeed={publisherFeed} dispatch={dispatch} />
      <CatalogFeedsSection publisherFeed={publisherFeed} dispatch={dispatch} />
      <PublisherValueSection publisherFeed={publisherFeed} dispatch={dispatch} />
      <PublisherFundingSection publisherFeed={publisherFeed} dispatch={dispatch} />
      <PublisherFeedReminderSection publisherFeed={publisherFeed} />
      <DownloadCatalogSection publisherFeed={publisherFeed} />
      {allFeedsHosted && <PublishSection publisherFeed={publisherFeed} />}
    </>
  );
}
