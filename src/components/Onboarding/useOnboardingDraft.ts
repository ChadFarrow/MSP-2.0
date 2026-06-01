// src/components/Onboarding/useOnboardingDraft.ts
//
// New-artist onboarding wizard "brain".
//
// TWO TIES (Nostr <-> publisher feed):
//   HARD  — the npub: ownership / signing / lockedOwner. Never drifts.
//   LOOSE — kind:0 content (name/art/lud16): non-destructive seeds, once per feed.
//   lud16 is the loosest: SUGGEST + confirm, never applied silently.
//
// SUPPORT SPLITS (MSP 2.0 + Podcastindex, 1 each) are injected at the wizard's
// publish step — not the reducer — so they only land on feeds created/hosted
// through this flow. Baked into the album XML at first host, so they survive
// publishPublisherFeed()'s fetch -> regenerate round-trips.
//
// Hosting goes through the shared hostedFeed util (same one SaveModal/artist mode
// use), so edit-token handling, HostedFeedInfo shape, and Nostr linking stay in
// one place. The feed URL is derived from feedId via buildHostedUrl — HostedFeedInfo
// does NOT carry a feedUrl field.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeed } from '../../store/feedStore';
import { useNostr } from '../../store/nostrStore';
import { createSupportRecipients, isCommunitySupport } from '../../types/feed';
import type { PublisherFeed, Album, ValueBlock } from '../../types/feed';
import { generateRssFeed } from '../../utils/xmlGenerator';
import {
  getHostedFeedInfo,
  saveHostedFeedInfo,
  buildHostedUrl,
  createHostedFeedWithNostr,
  updateHostedFeedWithNostr,
} from '../../utils/hostedFeed';
import {
  publishPublisherFeed,
  type PublishProgress,
  type PublishResult,
} from '../../utils/publisherPublish';

export type StepId =
  | 'auth' | 'publisher' | 'album' | 'tracks' | 'value' | 'extras' | 'review';

export const STEP_ORDER: StepId[] = [
  'auth', 'publisher', 'album', 'tracks', 'value', 'extras', 'review',
];

const STEP_PERSIST_KEY = 'msp:onboarding:step';

export type ExistingPublisherLookup = (npub: string) => Promise<PublisherFeed[]>;

// ---- support-split injection (pure, idempotent) -------------------------
function withSupportSplits(value: ValueBlock | undefined): ValueBlock | undefined {
  if (!value) return value;
  const hasUser = value.recipients.some((r) => r.address && !isCommunitySupport(r));
  if (!hasUser) return value; // never create a support-only block
  const missing = createSupportRecipients().filter(
    (s) => !value.recipients.some((r) => r.name === s.name && r.address === s.address)
  );
  return missing.length ? { ...value, recipients: [...value.recipients, ...missing] } : value;
}

function albumWithSupport(album: Album): Album {
  return {
    ...album,
    value: withSupportSplits(album.value) ?? album.value,
    tracks: album.tracks.map((t) =>
      t.overrideValue && t.value ? { ...t, value: withSupportSplits(t.value) } : t
    ),
  };
}

function publisherWithSupport(pf: PublisherFeed): PublisherFeed {
  return { ...pf, value: withSupportSplits(pf.value) ?? pf.value };
}

export function useOnboardingDraft(lookupExistingPublishers?: ExistingPublisherLookup) {
  const { state, dispatch } = useFeed();
  const nostr = useNostr();

  const [step, setStepState] = useState<StepId>(() => {
    const saved = localStorage.getItem(STEP_PERSIST_KEY) as StepId | null;
    return saved && STEP_ORDER.includes(saved) ? saved : 'auth';
  });
  const [isReturningArtist, setIsReturningArtist] = useState(false);
  const [publisherChoices, setPublisherChoices] = useState<PublisherFeed[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [lightningPromptHandled, setLightningPromptHandled] = useState(false);

  // Guard so the auth-step auto-advance effect can't fire the lookup repeatedly.
  const lookedUpRef = useRef(false);

  const setStep = useCallback((next: StepId) => {
    setStepState(next);
    localStorage.setItem(STEP_PERSIST_KEY, next);
  }, []);

  // Returning artists skip the publisher-shell step, so next/back must walk the
  // effective order (not the raw STEP_ORDER) to avoid landing on a hidden step.
  const visibleOrder = isReturningArtist
    ? STEP_ORDER.filter((s) => s !== 'publisher')
    : STEP_ORDER;
  const index = visibleOrder.indexOf(step);
  const next = useCallback(() => {
    const ord = isReturningArtist ? STEP_ORDER.filter((s) => s !== 'publisher') : STEP_ORDER;
    const i = ord.indexOf(step);
    if (i >= 0 && i < ord.length - 1) setStep(ord[i + 1]);
  }, [step, setStep, isReturningArtist]);
  const back = useCallback(() => {
    const ord = isReturningArtist ? STEP_ORDER.filter((s) => s !== 'publisher') : STEP_ORDER;
    const i = ord.indexOf(step);
    if (i > 0) setStep(ord[i - 1]);
  }, [step, setStep, isReturningArtist]);

  // --- Step 0: auth + branch ---------------------------------------------
  // Runs the existing-publisher lookup once on sign-in but does NOT auto-advance,
  // so the auth step can confirm the user's identity (name + pfp) and present
  // either a "Continue" (new artist) or the publisher chooser (returning artist).
  // The lookedUpRef guard prevents a duplicate network lookup on re-entry.
  const onSignedIn = useCallback(async () => {
    const npub = nostr.state?.user?.npub;
    if (!npub || lookedUpRef.current) return;
    lookedUpRef.current = true;
    setLookingUp(true);
    try {
      const found = lookupExistingPublishers ? await lookupExistingPublishers(npub) : [];
      setPublisherChoices(found);
    } finally {
      setLookingUp(false);
    }
  }, [nostr.state, lookupExistingPublishers]);

  const choosePublisher = useCallback((feed: PublisherFeed) => {
    dispatch({ type: 'SET_PUBLISHER_FEED', payload: feed });
    setIsReturningArtist(true);
    setPublisherChoices([]);
    setStep('album');
  }, [dispatch, setStep]);

  const startNewPublisher = useCallback(() => {
    setIsReturningArtist(false);
    setPublisherChoices([]);
    setStep('publisher');
  }, [setStep]);

  // --- HARD TIE -----------------------------------------------------------
  const ensurePublisherShell = useCallback(() => {
    if (!state.publisherFeed) dispatch({ type: 'CREATE_NEW_PUBLISHER_FEED' });
    dispatch({
      type: 'UPDATE_PUBLISHER_FEED',
      payload: { locked: true, lockedOwner: nostr.state?.user?.npub || '' },
    });
  }, [state.publisherFeed, nostr.state, dispatch]);

  // --- LOOSE TIE: profile prefill (non-destructive) -----------------------
  const pullProfileFromNostr = useCallback((force = false) => {
    const u = nostr.state?.user;
    const pf = state.publisherFeed;
    if (!u || !pf) return;
    const fill = (cur: string | undefined, val: string | undefined) =>
      force ? (val ?? cur ?? '') : (cur && cur.length ? cur : (val ?? cur ?? ''));
    dispatch({
      type: 'UPDATE_PUBLISHER_FEED',
      payload: {
        author: fill(pf.author, u.displayName),
        title: fill(pf.title, u.displayName),
        imageUrl: fill(pf.imageUrl, u.picture),
      },
    });
  }, [state.publisherFeed, nostr.state, dispatch]);

  // --- Step 2: cross-link by feedGuid -------------------------------------
  const linkAlbumToPublisher = useCallback(() => {
    const pubGuid = state.publisherFeed?.podcastGuid;
    const albumGuid = state.album.podcastGuid;
    if (!pubGuid || !albumGuid) return;
    dispatch({ type: 'UPDATE_ALBUM', payload: { publisher: { feedGuid: pubGuid } } });
    const already = (state.publisherFeed?.remoteItems || []).some((ri) => ri.feedGuid === albumGuid);
    if (!already) {
      dispatch({
        type: 'ADD_REMOTE_ITEM',
        payload: {
          feedGuid: albumGuid,
          medium: 'music',
          title: state.album.title || 'Untitled album',
          image: state.album.imageUrl || undefined,
        },
      });
    }
  }, [state.publisherFeed, state.album, dispatch]);

  const enterAlbumMode = useCallback(() => {
    if (state.feedType === 'video') dispatch({ type: 'SET_FEED_TYPE', payload: 'album' });
  }, [state.feedType, dispatch]);

  // --- Step 4: lightning address — suggest, then confirm ------------------
  const suggestedLightningAddress = nostr.state?.user?.lud16 ?? null;
  const confirmLightningAddress = useCallback((address?: string) => {
    const addr = (address ?? suggestedLightningAddress ?? '').trim();
    if (!addr) return;
    const existing = state.album.value?.recipients?.[0];
    dispatch({
      type: 'UPDATE_RECIPIENT',
      payload: {
        index: 0,
        recipient: {
          ...(existing || { name: '', address: '', split: 100, type: 'lnaddress' }),
          name: existing?.name || nostr.state?.user?.displayName || 'Artist',
          address: addr,
          type: 'lnaddress',
          split: existing?.split ?? 100,
        },
      },
    });
    setLightningPromptHandled(true);
  }, [suggestedLightningAddress, state.album, nostr.state, dispatch]);
  const dismissLightningAddress = useCallback(() => setLightningPromptHandled(true), []);

  // --- Step 6: host album (support baked in) -> publish -------------------
  const publish = useCallback(async (): Promise<PublishResult | null> => {
    const pubkey = nostr.state?.user?.pubkey;
    if (!state.publisherFeed || !pubkey) return null;
    setPublishing(true);
    try {
      // 1. Bake support splits into a pure album copy, and inject the publisher
      //    back-reference (feedUrl precomputed from the publisher's podcastGuid —
      //    the /api/hosted endpoint uses podcastGuid as the URL feedId) BEFORE
      //    serializing, so the album carries the cross-link regardless of which
      //    catalog options we pass below.
      const publisherUrl = buildHostedUrl(state.publisherFeed.podcastGuid);
      const baseAlbum = albumWithSupport(state.album);
      const album: Album = {
        ...baseAlbum,
        publisher: baseAlbum.publisher
          ? { ...baseAlbum.publisher, feedUrl: baseAlbum.publisher.feedUrl || publisherUrl }
          : { feedGuid: state.publisherFeed.podcastGuid, feedUrl: publisherUrl },
      };

      // 2. Host the album to mint its URL. feedId === podcastGuid. Persist the
      //    hosted info so the publisher leg treats it as already-hosted (no dup).
      const title = album.title || 'Untitled album';
      const existing = getHostedFeedInfo(album.podcastGuid);
      let feedUrl: string;
      if (existing) {
        await updateHostedFeedWithNostr(existing.feedId, generateRssFeed(album), title);
        saveHostedFeedInfo(album.podcastGuid, { ...existing, lastUpdated: Date.now() });
        feedUrl = buildHostedUrl(existing.feedId);
      } else {
        const res = await createHostedFeedWithNostr(generateRssFeed(album), title, album.podcastGuid);
        saveHostedFeedInfo(album.podcastGuid, {
          feedId: res.feedId,
          editToken: '',
          createdAt: Date.now(),
          lastUpdated: Date.now(),
          ownerPubkey: pubkey,
          linkedAt: Date.now(),
        });
        feedUrl = res.url;
      }

      // 3. Backfill the album's remoteItem URL so publishPublisherFeed can fetch +
      //    wire the publisher <-> album link.
      const remoteItems = state.publisherFeed.remoteItems.map((ri) =>
        ri.feedGuid === album.podcastGuid ? { ...ri, feedUrl } : ri
      );

      // 4. Publisher feed: support splits (only if it has a real recipient).
      const publisherFeed = { ...publisherWithSupport(state.publisherFeed), remoteItems };

      // 5. Hand off to the existing machine. For RETURNING artists, skip the
      //    catalog sweep: their publisher already has remoteItems pointing at
      //    albums hosted in a different browser (no local credentials), and the
      //    sweep would needlessly re-fetch/re-host them. The new album's feedUrl
      //    is already backfilled above, so the publisher XML is complete.
      const result = await publishPublisherFeed(publisherFeed, {
        hostCatalogFeeds: !isReturningArtist,
        updateCatalogFeeds: !isReturningArtist,
        linkNostr: true,
        nostrPubkey: pubkey,
        onProgress: setProgress,
      });
      if (result.updatedPublisherFeed) {
        dispatch({ type: 'SET_PUBLISHER_FEED', payload: result.updatedPublisherFeed });
      }
      return result;
    } finally {
      setPublishing(false);
    }
  }, [state.album, state.publisherFeed, nostr.state, isReturningArtist, dispatch]);

  const reset = useCallback(() => {
    localStorage.removeItem(STEP_PERSIST_KEY);
    lookedUpRef.current = false;
    setLightningPromptHandled(false);
    setStepState('auth');
  }, []);

  useEffect(() => {
    // Create + lock the publisher shell (HARD tie: ownership). We intentionally
    // do NOT auto-pull the Nostr profile here — name/photo are only filled when
    // the user explicitly clicks "Use my Nostr name & photo" (the LOOSE tie).
    if (step === 'publisher' && !isReturningArtist) {
      ensurePublisherShell();
    }
    if (step === 'album') enterAlbumMode();
  }, [
    step, isReturningArtist, state.publisherFeed?.podcastGuid,
    ensurePublisherShell, enterAlbumMode,
  ]);

  return {
    step, index, total: STEP_ORDER.length, setStep, next, back,
    isReturningArtist, publisherChoices, lookingUp, publishing, progress,
    onSignedIn, choosePublisher, startNewPublisher,
    ensurePublisherShell, pullProfileFromNostr, linkAlbumToPublisher,
    suggestedLightningAddress, lightningPromptHandled,
    confirmLightningAddress, dismissLightningAddress,
    publish, reset, state, dispatch, createSupportRecipients,
  };
}
