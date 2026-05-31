import type { FeedType } from '../../store/feedStore';
import { ModalWrapper } from './ModalWrapper';

interface NewFeedChoiceModalProps {
  isOpen: boolean;
  feedType: FeedType;
  onStartBlank: () => void;
  onUseTemplate: () => void;
  onArtistSetup?: () => void;
  onCancel: () => void;
  onNewArtist?: () => void;
}

const feedTypeLabel = (feedType: FeedType) =>
  feedType === 'publisher' ? 'Publisher Feed'
    : feedType === 'video' ? 'Video Feed'
    : feedType === 'artist' ? 'Artist'
    : 'Album';

export function NewFeedChoiceModal({
  isOpen,
  feedType,
  onStartBlank,
  onUseTemplate,
  onArtistSetup,
  onCancel,
  onNewArtist,
}: NewFeedChoiceModalProps) {
  const label = feedTypeLabel(feedType);
  const showArtistSetup = feedType === 'album' && !!onArtistSetup;

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onCancel}
      title={`New ${label}`}
      footer={
        <div style={{ display: 'flex', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
          {onNewArtist && feedType === 'album' && (
            <button className="btn btn-primary" onClick={onNewArtist}>
              New Artist (Guided)
            </button>
          )}
          {showArtistSetup && (
            <button className="btn btn-secondary" onClick={onArtistSetup}>
              Artist Setup
            </button>
          )}
          <button className="btn btn-warning" onClick={onStartBlank}>
            Start Blank
          </button>
          <button className="btn btn-secondary" onClick={onUseTemplate}>
            Use Template
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      }
    >
      <p style={{ color: 'var(--text-secondary)', margin: 0, marginBottom: showArtistSetup ? '12px' : 0 }}>
        Start with an empty {label.toLowerCase()}, or import an existing feed as a template
        (keeps all content but assigns a new GUID).
      </p>
      {showArtistSetup && (
        <div style={{
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '13px',
          color: 'var(--text-secondary)'
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>Artist Setup</strong> creates both an album feed and a
          publisher catalog simultaneously, with GUIDs cross-linked automatically. Recommended for first-time artists.
        </div>
      )}
    </ModalWrapper>
  );
}
