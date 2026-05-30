import { useFeed } from '../../../store/feedStore';
import { EditorChrome } from '../EditorChrome';
import { useFeaturePrefs } from '../../../store/featurePrefsStore';
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
  const { isEnabled } = useFeaturePrefs();
  const { publisherFeed } = state;

  if (!publisherFeed) {
    return (
      <EditorChrome chromeless={chromeless}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No publisher feed loaded. Create a new publisher feed or import an existing one.
        </div>
      </EditorChrome>
    );
  }

  // Only show PublishSection if there are catalog feeds and all are MSP-hosted
  const catalogStatus = getCatalogFeedsStatus(publisherFeed.remoteItems);
  const allFeedsHosted = catalogStatus.items.length > 0 && catalogStatus.items.every(item => item.isHosted);

  // Artist mode renders this publisher inline alongside its album; first-time setup
  // shouldn't surface catalog management, redundant download/host UI, or publish flows.
  const isArtistMode = state.feedType === 'artist';

  return (
    <EditorChrome chromeless={chromeless}>
      <PublisherInfoSection publisherFeed={publisherFeed} dispatch={dispatch} isArtistMode={isArtistMode} />
      <PublisherArtworkSection publisherFeed={publisherFeed} dispatch={dispatch} />
      {!isArtistMode && <CatalogFeedsSection publisherFeed={publisherFeed} dispatch={dispatch} />}
      {isEnabled('lightning') && <PublisherValueSection publisherFeed={publisherFeed} dispatch={dispatch} />}
      <PublisherFundingSection publisherFeed={publisherFeed} dispatch={dispatch} />
      {!isArtistMode && <PublisherFeedReminderSection publisherFeed={publisherFeed} />}
      {!isArtistMode && <DownloadCatalogSection publisherFeed={publisherFeed} />}
      {!isArtistMode && allFeedsHosted && <PublishSection publisherFeed={publisherFeed} />}
    </EditorChrome>
  );
}
