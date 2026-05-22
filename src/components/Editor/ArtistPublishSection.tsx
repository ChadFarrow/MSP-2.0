import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useFeed } from '../../store/feedStore';
import { useNostr } from '../../store/nostrStore';
import {
  hostBothOnMSP,
  downloadArtistFeedPackage,
  waitForAlbumInIndex,
  type CancellationToken,
  type HostBothResult,
  type PublishStep,
  type PublishStepId,
  type PublishStepStatus,
  type VerifyProgress,
} from '../../utils/artistPublish';
import { getHostedFeedInfo, buildHostedUrl } from '../../utils/hostedFeed';

const containerStyle: CSSProperties = {
  marginTop: '32px',
  padding: '24px',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08))',
  border: '1px solid rgba(99, 102, 241, 0.3)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '16px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-primary)',
  marginBottom: '8px',
};

const subhead: CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-secondary)',
  marginBottom: '20px',
};

const primaryBtnStyle: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  fontSize: '15px',
  fontWeight: 600,
};

const orRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  margin: '20px 0',
  color: 'var(--text-tertiary)',
  fontSize: '12px',
};

const orLine: CSSProperties = {
  flex: 1,
  height: '1px',
  background: 'rgba(99, 102, 241, 0.25)',
};

const helperText: CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-tertiary)',
  marginTop: '8px',
  marginBottom: 0,
};

const stepListStyle: CSSProperties = {
  marginTop: '20px',
  padding: '16px',
  borderRadius: '8px',
  background: 'rgba(0, 0, 0, 0.15)',
  border: '1px solid rgba(99, 102, 241, 0.2)',
};

const stepRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '8px 0',
  fontSize: '13px',
  lineHeight: '1.5',
};

const stepIconStyle = (status: PublishStepStatus): CSSProperties => ({
  width: '20px',
  height: '20px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  fontSize: '12px',
  fontWeight: 600,
  background:
    status === 'done' ? 'rgba(34, 197, 94, 0.2)' :
    status === 'in-progress' ? 'rgba(99, 102, 241, 0.2)' :
    status === 'failed' ? 'rgba(239, 68, 68, 0.2)' :
    'rgba(139, 92, 246, 0.1)',
  color:
    status === 'done' ? 'var(--success-color, #22c55e)' :
    status === 'in-progress' ? '#6366f1' :
    status === 'failed' ? 'var(--danger-color, #ef4444)' :
    'var(--text-tertiary)',
  border: `1px solid ${
    status === 'done' ? 'rgba(34, 197, 94, 0.4)' :
    status === 'in-progress' ? 'rgba(99, 102, 241, 0.4)' :
    status === 'failed' ? 'rgba(239, 68, 68, 0.4)' :
    'rgba(139, 92, 246, 0.3)'
  }`,
});

const stepIconChar = (status: PublishStepStatus): string => {
  if (status === 'done') return '✓';
  if (status === 'failed') return '✕';
  if (status === 'in-progress') return '◐';
  return '○';
};

const stepLabelStyle = (status: PublishStepStatus): CSSProperties => ({
  flex: 1,
  color: status === 'pending' ? 'var(--text-tertiary)' : 'var(--text-primary)',
  fontWeight: status === 'in-progress' ? 600 : 400,
});

const detailLineStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  marginTop: '4px',
  wordBreak: 'break-all',
};

const linkStyle: CSSProperties = {
  color: '#3b82f6',
  textDecoration: 'underline',
};

const STEP_LABELS: Record<PublishStepId, string> = {
  'album-host': 'Host album feed on MSP + submit to Podcast Index',
  'publisher-host': 'Host publisher feed on MSP (cross-linked to album)',
  'verify-index': 'Verify album appears in Podcast Index',
};

const STEP_ORDER: PublishStepId[] = ['album-host', 'publisher-host', 'verify-index'];

export function ArtistPublishSection() {
  const { state, dispatch } = useFeed();
  const { state: nostrState } = useNostr();
  const [hosting, setHosting] = useState(false);
  const [steps, setSteps] = useState<Map<PublishStepId, PublishStep>>(new Map());
  const [result, setResult] = useState<HostBothResult | null>(null);
  const [verify, setVerify] = useState<VerifyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollCancelRef = useRef<CancellationToken | null>(null);

  const updateStep = (step: PublishStep) => {
    setSteps((prev) => {
      const next = new Map(prev);
      next.set(step.id, step);
      return next;
    });
  };

  const albumGuid = state.album?.podcastGuid;
  const publisherGuid = state.publisherFeed?.podcastGuid;

  // On mount (or when GUIDs change): if both feeds are already hosted in this
  // browser per localStorage, hydrate the section as "post-host, verifying"
  // so a page refresh doesn't trick the user into re-submitting. Resumes PI
  // verification polling automatically.
  useEffect(() => {
    if (!albumGuid || !publisherGuid) return;
    const albumInfo = getHostedFeedInfo(albumGuid);
    const pubInfo = getHostedFeedInfo(publisherGuid);
    if (!albumInfo || !pubInfo) return;

    setResult({
      album: { feedId: albumInfo.feedId, url: buildHostedUrl(albumInfo.feedId) },
      publisher: { feedId: pubInfo.feedId, url: buildHostedUrl(pubInfo.feedId) },
      injectedAlbumPublisherFeedUrl: '',
      injectedPublisherRemoteItemFeedUrl: '',
    });
    updateStep({ id: 'album-host', status: 'done' });
    updateStep({ id: 'publisher-host', status: 'done' });
    updateStep({ id: 'verify-index', status: 'in-progress' });

    const cancelToken: CancellationToken = { cancelled: false };
    pollCancelRef.current = cancelToken;

    waitForAlbumInIndex(
      albumGuid,
      (progress) => {
        if (cancelToken.cancelled) return;
        setVerify(progress);
        if (progress.album) {
          updateStep({ id: 'verify-index', status: 'done' });
        }
      },
      cancelToken
    ).then((final) => {
      if (cancelToken.cancelled) return;
      setVerify(final);
      updateStep({
        id: 'verify-index',
        status: final.album ? 'done' : 'pending',
      });
    });
  }, [albumGuid, publisherGuid]);

  // Cancel any in-flight polling when the component unmounts so we don't
  // setState on an unmounted component or burn API calls in the background.
  useEffect(() => {
    return () => {
      if (pollCancelRef.current) pollCancelRef.current.cancelled = true;
    };
  }, []);

  if (!state.publisherFeed || !state.album) {
    return null;
  }

  const album = state.album;
  const publisherFeed = state.publisherFeed;
  const albumTitleSet = !!album.title?.trim();
  const publisherTitleSet = !!publisherFeed.title?.trim();
  const titlesReady = albumTitleSet && publisherTitleSet;
  const canHostBoth = nostrState.isLoggedIn && !!nostrState.user?.pubkey;

  const handleHostBoth = async () => {
    if (!canHostBoth || !nostrState.user) return;

    // Cancel any previous polling session before starting a new one.
    if (pollCancelRef.current) pollCancelRef.current.cancelled = true;
    const cancelToken: CancellationToken = { cancelled: false };
    pollCancelRef.current = cancelToken;

    setHosting(true);
    setError(null);
    setResult(null);
    setVerify(null);
    setSteps(new Map());

    try {
      const hostResult = await hostBothOnMSP(
        album,
        publisherFeed,
        nostrState.user.pubkey,
        updateStep
      );
      setResult(hostResult);

      // Reflect the cross-link feedUrls we injected into the XMLs back into the
      // in-store feeds, so the editor shows the same URLs that just shipped.
      if (hostResult.injectedAlbumPublisherFeedUrl) {
        dispatch({
          type: 'UPDATE_ALBUM',
          payload: {
            publisher: {
              feedGuid: publisherFeed.podcastGuid,
              feedUrl: hostResult.injectedAlbumPublisherFeedUrl,
            },
          },
        });
      }
      if (hostResult.injectedPublisherRemoteItemFeedUrl) {
        dispatch({
          type: 'UPDATE_PUBLISHER_FEED',
          payload: {
            remoteItems: publisherFeed.remoteItems.map((item) =>
              item.feedGuid === album.podcastGuid && !item.feedUrl
                ? { ...item, feedUrl: hostResult.injectedPublisherRemoteItemFeedUrl }
                : item
            ),
          },
        });
      }

      updateStep({ id: 'verify-index', status: 'in-progress' });
      const finalVerify = await waitForAlbumInIndex(
        album.podcastGuid,
        (progress) => {
          if (cancelToken.cancelled) return;
          setVerify(progress);
          if (progress.album) {
            updateStep({ id: 'verify-index', status: 'done' });
          }
        },
        cancelToken
      );
      if (!cancelToken.cancelled) {
        setVerify(finalVerify);
        updateStep({
          id: 'verify-index',
          status: finalVerify.album ? 'done' : 'pending',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to host feeds');
    } finally {
      setHosting(false);
    }
  };

  const handleDownloadPackage = () => {
    downloadArtistFeedPackage(album, publisherFeed);
  };

  const renderStepDetail = (id: PublishStepId) => {
    if (id === 'album-host' && result) {
      return (
        <div style={detailLineStyle}>
          <a href={result.album.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{result.album.url}</a>
          {result.album.podcastIndexId && <span> · PI ID {result.album.podcastIndexId}</span>}
        </div>
      );
    }
    if (id === 'publisher-host' && result) {
      const pubLookup = `https://podcastindex.org/search?q=${encodeURIComponent(publisherFeed.podcastGuid)}`;
      return (
        <div style={detailLineStyle}>
          <a href={result.publisher.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{result.publisher.url}</a>
          <div style={{ marginTop: '4px', color: 'var(--text-tertiary)' }}>
            Cross-linked from the album so Podcasting 2.0 clients can discover it. Publisher feeds can take longer than music feeds to index — <a href={pubLookup} target="_blank" rel="noopener noreferrer" style={linkStyle}>check Podcast Index manually →</a>
          </div>
        </div>
      );
    }
    if (id === 'verify-index' && verify) {
      const albumLookup = `https://podcastindex.org/search?q=${encodeURIComponent(album.podcastGuid)}`;
      const polling = verify.nextCheckIn !== null;

      if (verify.album) {
        return (
          <div style={detailLineStyle}>
            Album is searchable in Podcast Index.{' '}
            <a href={albumLookup} target="_blank" rel="noopener noreferrer" style={linkStyle}>View in PI →</a>
          </div>
        );
      }

      return (
        <div style={detailLineStyle}>
          <div>⏳ Album: not yet in Podcast Index · <a href={albumLookup} target="_blank" rel="noopener noreferrer" style={linkStyle}>check manually →</a></div>
          <div style={{ marginTop: '6px', color: 'var(--text-tertiary)' }}>
            {polling
              ? `Checking again in ${verify.nextCheckIn}s · attempt ${verify.attempt} of ${verify.totalAttempts}`
              : "Stopped checking — Podcast Index may still pick this up over the next several minutes. Refresh this page later or use the link above."}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span role="img" aria-hidden="true">🚀</span>
        <span>Publish your feeds</span>
      </div>
      <p style={subhead}>
        When your album and publisher info above are filled in, ship them to listeners.
      </p>

      {canHostBoth ? (
        <>
          <button
            className="btn btn-primary"
            style={{
              ...primaryBtnStyle,
              ...(hosting || !titlesReady ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
            onClick={handleHostBoth}
            disabled={hosting || !titlesReady}
          >
            {hosting
              ? 'Working…'
              : result
                ? 'Re-host both feeds (update with latest XML)'
                : 'Host on MSP — album + publisher (one click)'}
          </button>
          <p style={helperText}>
            {result
              ? 'Already hosted in this session. Click to re-host both XMLs (uses the same MSP URLs and Nostr identity). Useful after editing feed details.'
              : !titlesReady
                ? `Add a title to your ${!albumTitleSet && !publisherTitleSet ? 'album and publisher' : !albumTitleSet ? 'album' : 'publisher'} feed above to enable hosting. Podcast Index won't index feeds without a title.`
                : 'Uploads both feeds to msp.podtards.com, submits them to Podcast Index, and verifies they appear. Linked to your Nostr identity for future edits.'}
          </p>
        </>
      ) : (
        <>
          <button
            className="btn btn-primary"
            style={{ ...primaryBtnStyle, opacity: 0.6, cursor: 'not-allowed' }}
            disabled
          >
            Host on MSP — album + publisher (one click)
          </button>
          <p style={helperText}>
            Log in with Nostr (top-right) to enable one-click hosting + Podcast Index submission for both feeds.
          </p>
        </>
      )}

      {steps.size > 0 && (
        <div style={stepListStyle}>
          {STEP_ORDER.map((id) => {
            const step = steps.get(id) || { id, status: 'pending' as const };
            return (
              <div key={id} style={stepRowStyle}>
                <span style={stepIconStyle(step.status)}>{stepIconChar(step.status)}</span>
                <div style={{ flex: 1 }}>
                  <div style={stepLabelStyle(step.status)}>{STEP_LABELS[id]}</div>
                  {renderStepDetail(id)}
                  {step.status === 'failed' && step.message && (
                    <div style={{ ...detailLineStyle, color: 'var(--danger-color, #ef4444)' }}>{step.message}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={orRow}>
        <div style={orLine} />
        <span>OR</span>
        <div style={orLine} />
      </div>

      <button
        className="btn btn-secondary"
        style={primaryBtnStyle}
        onClick={handleDownloadPackage}
        disabled={hosting}
      >
        Download Feed Package (host yourself)
      </button>
      <p style={helperText}>
        Downloads both XML files plus a next-steps guide. Host them anywhere — GitHub Pages, S3, your own CDN.
      </p>

      {error && (
        <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--text-primary)' }}>
          ✕ {error}
        </div>
      )}
    </div>
  );
}
