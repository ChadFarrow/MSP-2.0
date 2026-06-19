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
import { fetchNostrProfile, mergeProfileFields, publishProfileMetadata } from '../../utils/nostrSync';
import { getConnectionMethod } from '../../utils/nostrSigner';
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
  | 'intro' | 'auth' | 'publisher' | 'album' | 'tracks' | 'value' | 'extras' | 'review';

export const STEP_ORDER: StepId[] = [
  'intro', 'auth', 'publisher', 'album', 'tracks', 'value', 'extras', 'review',
];

const STEP_PERSIST_KEY = 'msp:onboarding:step';
// High-water mark: the furthest step index reached. Lets the rail enable jumping
// to any already-completed step (forward or back), not just steps before the
// current one.
const MAX_STEP_PERSIST_KEY = 'msp:onboarding:maxstep';

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
    return saved && STEP_ORDER.includes(saved) ? saved : 'intro';
  });
  // Furthest step index reached so far (never decreases until reset). Seeded from
  // the persisted high-water mark, floored at the restored step's own index.
  const [maxIndex, setMaxIndex] = useState<number>(() => {
    const savedMax = Number(localStorage.getItem(MAX_STEP_PERSIST_KEY));
    const stepIdx = STEP_ORDER.indexOf(step);
    return Math.max(Number.isFinite(savedMax) ? savedMax : 0, stepIdx < 0 ? 0 : stepIdx);
  });
  const [isReturningArtist, setIsReturningArtist] = useState(false);
  const [publisherChoices, setPublisherChoices] = useState<PublisherFeed[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [lightningPromptHandled, setLightningPromptHandled] = useState(false);

  // Concurrency guard: prevents two overlapping lookups, but (unlike a one-shot
  // "already looked up" flag) still lets the lookup re-run on every entry to the
  // auth step — re-sign-in after sign-out, or navigating Back to it.
  const lookingUpRef = useRef(false);
  // Tracks the account the choices belong to, so switching accounts (or signing
  // out) drops the previous account's feeds instead of showing them stale.
  const prevNpubRef = useRef<string | undefined>(undefined);

  const setStep = useCallback((next: StepId) => {
    setStepState(next);
    localStorage.setItem(STEP_PERSIST_KEY, next);
    setMaxIndex((m) => {
      const ni = STEP_ORDER.indexOf(next);
      const nm = ni > m ? ni : m;
      localStorage.setItem(MAX_STEP_PERSIST_KEY, String(nm));
      return nm;
    });
  }, []);

  // Every artist walks the full STEP_ORDER — returning artists also see the
  // Artist/Publisher step, pre-filled with their chosen publisher, so they can
  // review/edit it before the album.
  const index = STEP_ORDER.indexOf(step);
  const next = useCallback(() => {
    const i = STEP_ORDER.indexOf(step);
    if (i >= 0 && i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]);
  }, [step, setStep]);
  const back = useCallback(() => {
    const i = STEP_ORDER.indexOf(step);
    if (i > 0) setStep(STEP_ORDER[i - 1]);
  }, [step, setStep]);

  // --- Step 0: auth + branch ---------------------------------------------
  // Runs the existing-publisher lookup on sign-in but does NOT auto-advance, so
  // the auth step can confirm the user's identity (name + pfp) and present either
  // a "Continue" (new artist) or the publisher chooser (returning artist). Re-runs
  // on every entry (re-sign-in, Back to auth); lookingUpRef just blocks overlap.
  const onSignedIn = useCallback(async () => {
    const npub = nostr.state?.user?.npub;
    if (!npub || lookingUpRef.current) return;
    lookingUpRef.current = true;
    setLookingUp(true);
    try {
      const found = lookupExistingPublishers ? await lookupExistingPublishers(npub) : [];
      setPublisherChoices(found);
    } finally {
      lookingUpRef.current = false;
      setLookingUp(false);
    }
  }, [nostr.state, lookupExistingPublishers]);

  // Drop the previous account's choices the moment the signed-in npub changes
  // (including sign-out → undefined), so a new sign-in never shows stale feeds
  // while its own lookup is in flight.
  useEffect(() => {
    const npub = nostr.state?.user?.npub;
    if (prevNpubRef.current !== undefined && prevNpubRef.current !== npub) {
      setPublisherChoices([]);
      setIsReturningArtist(false);
    }
    prevNpubRef.current = npub;
  }, [nostr.state?.user?.npub]);

  const choosePublisher = useCallback((feed: PublisherFeed) => {
    dispatch({ type: 'SET_PUBLISHER_FEED', payload: feed });
    setIsReturningArtist(true);
    setPublisherChoices([]);
    // Land on the Artist/Publisher step (pre-filled with the chosen feed) so the
    // returning artist can review/edit it before moving on to the album.
    setStep('publisher');
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

      // Managed (Google) keypairs are minted with no kind-0 profile, so the npub
      // shows as a truncated npub1… everywhere. Give it a real name + avatar from
      // what the artist just entered. Managed-only (NIP-07/NIP-46 users already
      // have a profile + the opt-in pull). Best-effort — never blocks publishing.
      if (getConnectionMethod() === 'managed') {
        try {
          const existingProfile = await fetchNostrProfile(pubkey);
          const merged = mergeProfileFields(existingProfile, {
            name: publisherFeed.author,
            picture: publisherFeed.imageUrl,
          });
          if (merged) {
            const profileRes = await publishProfileMetadata(merged);
            if (profileRes.success) {
              nostr.updateProfile({
                displayName: merged.display_name || merged.name,
                picture: merged.picture,
              });
            }
          }
        } catch (e) {
          console.warn('Managed profile push failed (non-blocking):', e);
        }
      }

      return result;
    } finally {
      setPublishing(false);
    }
  }, [state.album, state.publisherFeed, nostr, isReturningArtist, dispatch]);

  const reset = useCallback(() => {
    localStorage.removeItem(STEP_PERSIST_KEY);
    localStorage.removeItem(MAX_STEP_PERSIST_KEY);
    lookingUpRef.current = false;
    setLightningPromptHandled(false);
    setStepState('intro');
    setMaxIndex(0);
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
    step, index, maxIndex, setStep, next, back,
    isReturningArtist, publisherChoices, lookingUp, publishing, progress,
    onSignedIn, choosePublisher, startNewPublisher,
    ensurePublisherShell, pullProfileFromNostr, linkAlbumToPublisher,
    suggestedLightningAddress, lightningPromptHandled,
    confirmLightningAddress, dismissLightningAddress,
    publish, reset, state, dispatch, createSupportRecipients,
  };
}

// The wizard's shared state/actions bag. Step components receive this as their
// `w` prop, so they can read `w.state` / `w.dispatch` and call the action
// callbacks without re-threading every field individually.
export type OnboardingDraft = ReturnType<typeof useOnboardingDraft>;
