# Combined Artist Editor — Design Spec

**Date:** 2026-05-21
**Status:** Approved (pending implementation plan)
**Related:** PR #63 (Artist Setup flow), which this design supersedes the UX of.

## Context

The Artist Setup flow added in PR #63 creates two cross-linked feeds — an album feed and a publisher catalog — at the same time. The user lands in album mode and must manually switch to publisher mode (and back) to finish setup. That mode-switch is the friction this design removes.

We want first-time artists to fill in everything for both feeds **on a single page**, without ever using the feedType dropdown during setup.

## Approach

Add a new `'artist'` feedType. The top header dropdown becomes a four-item list:

```
Album / Video / Publisher / Artist (Album + Publisher)
```

Selecting Artist renders a new `<ArtistEditor />` component that stacks the existing Album editor sections above the existing Publisher editor sections in one scroll. Both feeds remain as separate entities in store (`state.album` + `state.publisherFeed`) with cross-referenced `podcastGuid` fields. Each section dispatches to its own slice of state — no shared inputs in the MVP. Field duplication (e.g., owner email appears in both halves) is accepted in exchange for reusing the existing section components verbatim.

This is **MVP-shaped on purpose**. A second iteration could de-duplicate shared fields into single "Identity / Value / Funding" sections that dispatch to both feeds. That's out of scope for this spec.

## Scope

### In scope

- Extending `FeedType` to include `'artist'` and propagating to the feedType dropdown, persistence, and routing
- Creating `<ArtistEditor />` that renders the existing album-editor sections above the existing publisher-editor sections
- Auto-creation of missing feeds when the user first switches to Artist mode (so the dropdown itself becomes a valid entry point with no prior setup)
- Rewiring the existing "Artist Setup" button in `NewFeedChoiceModal` to be a shortcut that switches to Artist mode (the mode-switch handler does the feed creation)
- Save modal in Artist mode: the existing package option (`Download Feed Package (album + publisher)`) becomes visible because `!isPublisherMode` is true and the cross-link check already exists. Other save destinations operate on the album, unchanged.
- Fixing the inverted-condition bug at `CatalogFeedsSection.tsx:259` discovered during PR #63 review
- Hiding the "Go to Publisher" green banner in `Editor.tsx` when `feedType === 'artist'` (redundant — publisher sections are already on the same page)

### Out of scope

- Smart de-duplicated sections (single "Artist Identity" block writing to both feeds). Deferred to v2.
- Tracking field linkage between the two feeds. Fields are fully independent.
- Migration of existing cross-linked album+publisher feed pairs (created by PR #63's current Artist Setup) into Artist mode. Users with such pairs see the new dropdown item; selecting it just opens the combined view over their existing data. No data migration needed.
- Other save destinations learning about Artist mode. They keep targeting the album, same as today.

## Architecture

### Type changes

```ts
// src/types/feed.ts
export type FeedType = 'album' | 'video' | 'publisher' | 'artist';
```

Re-exported from `src/store/feedStore.tsx` (existing pattern).

### Storage

`feedTypeStorage` (in `feedStore.tsx`) loads and persists feedType. Its allowed-values guard must include `'artist'` so a refresh in Artist mode survives.

### Routing

`src/App.tsx:292` currently:
```tsx
{state.feedType === 'publisher' ? <PublisherEditor /> : <Editor key={...} />}
```

Becomes:
```tsx
{state.feedType === 'publisher' ? <PublisherEditor />
  : state.feedType === 'artist' ? <ArtistEditor />
  : <Editor key={...} />}
```

### `<ArtistEditor />` (new)

Path: `src/components/Editor/ArtistEditor.tsx`.

Renders two stacked blocks with visual separators:

1. **Album block** — invokes the existing `<Editor />` component (renamed/exported appropriately, or its inner JSX inlined; see "Open question" below).
2. **Publisher block** — invokes the existing `<PublisherEditor />` component (or its inner JSX inlined).

Visual treatment: each block is preceded by a sticky section header (e.g., `══ ALBUM ══` / `══ PUBLISHER ══`) so the user knows which feed they're editing. Header is a thin colored bar with the medium icon and short helper text ("These fields go into your album RSS feed", etc.).

#### Open question for implementation

`<Editor />` and `<PublisherEditor />` today own the `main-content / editor-panel` chrome (margins, padding, scroll container). When stacked inside `<ArtistEditor />` we don't want two scrollable panels — we want one outer scroll. The implementation plan should choose between:

(a) Adding a `chromeless` prop to `<Editor />` and `<PublisherEditor />` so they can be rendered inside another panel; or
(b) Inlining their inner JSX in `<ArtistEditor />` (DRY trade-off — sections still come from the same files, just composed in a new wrapper).

Option (a) is preferred because it keeps `<ArtistEditor />` thin and avoids forking the section composition.

### State management

No reducer changes are strictly required — both `state.album` and `state.publisherFeed` already exist in the store. The combined editor reads/writes them through the same actions the existing editors use.

`handleSwitchFeedType` in `App.tsx` gets a new branch for the `'artist'` case:

```ts
case 'artist': {
  const needsAlbum = !state.album?.podcastGuid;
  const needsPublisher = !state.publisherFeed?.podcastGuid;
  const albumGuid = state.album?.podcastGuid ?? crypto.randomUUID();
  const publisherGuid = state.publisherFeed?.podcastGuid ?? crypto.randomUUID();

  if (needsPublisher) {
    dispatch({ type: 'SET_PUBLISHER_FEED', payload: {
      ...createEmptyPublisherFeed(),
      podcastGuid: publisherGuid,
      remoteItems: [{ feedGuid: albumGuid, feedUrl: '', title: '', medium: 'music' }]
    }});
  }
  if (needsAlbum) {
    dispatch({ type: 'SET_ALBUM', payload: {
      ...createEmptyAlbum(),
      podcastGuid: albumGuid,
      publisher: { feedGuid: publisherGuid }
    }});
  } else if (state.album.publisher?.feedGuid !== publisherGuid) {
    // Album exists but isn't cross-linked yet — link it
    dispatch({ type: 'UPDATE_ALBUM', payload: { publisher: { feedGuid: publisherGuid } } });
  }
  dispatch({ type: 'SET_FEED_TYPE', payload: 'artist' });
  break;
}
```

Key behavior:
- Both feeds get auto-created with cross-linked GUIDs if missing
- Pre-existing feeds are preserved; only the missing side(s) are created
- An existing album without a publisher link gets the link added without overwriting other album fields
- `SET_ALBUM` and `SET_PUBLISHER_FEED` both set `feedType` themselves, so we explicitly `SET_FEED_TYPE: 'artist'` afterward to override

### `NewFeedChoiceModal` simplification

PR #63 added an "Artist Setup" button that calls `handleArtistSetup` (which directly dispatches both feeds). With the new dropdown entry point, that button's `onClick` simplifies to:

```ts
const handleArtistSetup = () => {
  handleSwitchFeedType('artist');  // does the auto-create + mode switch
  setShowNewFeedChoiceModal(false);
};
```

The current `handleArtistSetup` body (the manual two-dispatch logic) is removed — the logic lives in `handleSwitchFeedType`'s `'artist'` branch now.

### Save modal

The package option's visibility guard:
```ts
!isPublisherMode && publisherFeed && album.publisher?.feedGuid === publisherFeed.podcastGuid
```

`isPublisherMode` is `feedType === 'publisher'`, which is false in Artist mode → the option appears. No change to the SaveModal.

For all other Save destinations in Artist mode (Local Storage, Download XML, Submit to PodcastIndex, Host on MSP, etc.), behavior is identical to album mode — they read `album` from props, which `App.tsx` passes correctly in non-video modes.

### CatalogFeedsSection bug fix

`src/components/Editor/PublisherEditor/CatalogFeedsSection.tsx:259`:
```ts
// before (broken — feedType is ALWAYS 'publisher' inside this section, so currentAlbum is always null)
const currentAlbum = feedState.feedType !== 'publisher' ? feedState.album : null;

// after
const currentAlbum = feedState.album;
```

`state.album` persists in store across feedType switches, so reading it directly is safe regardless of mode. In Artist mode the section sees the same album the user is currently editing above; in Publisher mode it sees whichever album was last loaded.

### Editor.tsx Go-to-Publisher banner

The green "Linked to publisher feed" banner block (`Editor.tsx:674–697`) is suppressed when `feedType === 'artist'` because the publisher sections are already visible directly below the album sections on the same page. The fallback descriptive `<p>` (lines 698–701) is also suppressed in Artist mode — the section heading is enough context.

## Data flow

```
User selects "Artist" from top dropdown
  → handleSwitchFeedType('artist')
  → reducer creates missing album/publisher with cross-linked GUIDs
  → state.feedType = 'artist'
  → App renders <ArtistEditor />
  → ArtistEditor renders <Editor chromeless /> then <PublisherEditor chromeless />
  → each section dispatches normal album / publisher actions
  → Save modal: "Download Feed Package" option visible (cross-link condition met)
  → user clicks Save → Package → existing case 'package' in SaveModal generates both XMLs + next-steps.txt
```

## Error handling

Nothing new. The existing editors already handle their own error states (empty feed, missing GUIDs, etc.). The only new failure mode is `crypto.randomUUID()` throwing — irrelevant in practice (all supported browsers ship `crypto.randomUUID`; if it's missing, the entire app fails to load earlier).

## Testing

Manual checklist (no new automated tests required; the changes are composition of existing tested components):

1. **Cold start, Artist mode:** Fresh load, switch top dropdown to Artist. Expect: combined editor renders, album and publisher feeds both exist in store with `album.publisher.feedGuid === publisherFeed.podcastGuid`.
2. **Persistence:** In Artist mode, edit some fields in both halves, reload the page. Expect: stays in Artist mode (feedTypeStorage round-trips); fields persist.
3. **Mode round-trip:** Artist → Album → Artist. Expect: same data, no duplication, no extra publisher feeds created.
4. **Mode round-trip with existing album:** Start in Album mode with an existing album that has no publisher link. Switch to Artist. Expect: album is preserved (title/tracks etc. unchanged), a publisher feed is created, cross-link is set on `album.publisher.feedGuid`.
5. **CatalogFeedsSection prompt (publisher mode):** Open the existing PR-style flow (Artist Setup button → mode switches to Artist → switch dropdown to Publisher manually). Expect: the green "Current album is in this catalog" banner now appears (was dead code before this design).
6. **Save → Download Feed Package in Artist mode:** Expect: 3 files download (album XML, publisher XML, next-steps.txt) with cross-referenced GUIDs.
7. **Save → Submit to PodcastIndex in Artist mode:** Expect: same as in album mode — submits the album feed URL.
8. **Switch to Video mode from Artist:** Expect: video feed editor appears; album and publisher feeds remain in store untouched.
9. **NewFeedChoiceModal → Artist Setup button:** Expect: modal closes, feedType becomes 'artist', combined editor renders, both feeds created.

Existing tests in `xmlGenerator.test.ts`, `xmlParser.test.ts`, etc. should pass unchanged.

## Touch list (for implementation plan)

- `src/types/feed.ts` — add `'artist'` to `FeedType` union
- `src/store/feedStore.tsx` — re-export the updated `FeedType`; ensure `feedTypeStorage` accepts `'artist'`
- `src/App.tsx` — route `'artist'` to `<ArtistEditor />`; extend `handleSwitchFeedType` with the `'artist'` branch; simplify `handleArtistSetup` to just call `handleSwitchFeedType('artist')`; add `'Artist (Album + Publisher)'` to the feedType dropdown UI
- `src/components/Editor/ArtistEditor.tsx` — new component, stacks Album + Publisher editor blocks with section headers
- `src/components/Editor/Editor.tsx` — accept optional `chromeless` prop; suppress publisher banner in Artist mode
- `src/components/Editor/PublisherEditor/index.tsx` — accept optional `chromeless` prop
- `src/components/Editor/PublisherEditor/CatalogFeedsSection.tsx` — fix inverted condition at line 259
- `src/components/modals/NewFeedChoiceModal.tsx` — no changes (button stays; only its handler shrinks in App.tsx)

## Verification

After implementation:
1. `npm run lint` — no new errors beyond the 25 pre-existing
2. `npm run build` — clean tsc pass
3. `npm run test` — all 89 tests green
4. `npm run dev` and exercise the 9-step manual checklist above
