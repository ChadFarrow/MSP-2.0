# Combined Artist Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `'artist'` feedType that renders album + publisher editors stacked on one page, eliminating the mode-switch friction in PR #63's Artist Setup flow.

**Architecture:** Extend `FeedType` to include `'artist'`; add a new `<ArtistEditor />` that composes the existing `<Editor />` (album) and `<PublisherEditor />` (publisher) chromeless inside one scroll container. `handleSwitchFeedType('artist')` auto-creates missing feeds with cross-linked GUIDs. The existing SaveModal package-download option already works because its visibility check (`!isPublisherMode && cross-link match`) is satisfied in Artist mode.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7.2, React Context + useReducer (no Redux), Vitest 4 (no component-level testing — pure-function tests only).

**Branch:** Continue on `claude/artist-publisher-feed-flow-Ad6B7` (the open PR #63 branch). New commits layer on top.

**Source spec:** `docs/superpowers/specs/2026-05-21-combined-artist-editor-design.md`

---

### Task 1: Extend `FeedType` union with `'artist'`

**Files:**
- Modify: `src/types/feed.ts:4`
- Modify: `src/utils/storage.ts:139`

Extending the `FeedType` discriminated union will surface every consumer that switch-cases over feedType. tsc's exhaustiveness checking is our safety net.

- [ ] **Step 1: Update the type union**

In `src/types/feed.ts`, line 4:

```ts
export type FeedType = 'album' | 'video' | 'publisher' | 'artist';
```

- [ ] **Step 2: Update feedTypeStorage allowlist**

In `src/utils/storage.ts`, line 139, change the includes-check to accept `'artist'`:

```ts
return stored && ['album', 'video', 'publisher', 'artist'].includes(stored) ? stored : 'album';
```

- [ ] **Step 3: Verify type narrowing across the codebase**

Run: `npm run build`

Expected: clean tsc pass. If tsc complains about non-exhaustive switch statements over `FeedType`, do NOT silence with `default:` — note the location and address those sites in later tasks (the spec only requires changes in `App.tsx`, the dropdown, and `feedTypeStorage`; other call sites should naturally fall through to album-like behavior).

If a site you don't expect to touch complains, add a minimal handler that aliases `'artist'` to `'album'` behavior locally and note it in the commit. Examples that might surface:
- `getActiveAlbum` (feedStore.tsx:78): already uses `feedType === 'video'` check — falls through to `state.album` for any other value, so 'artist' works without modification
- `updateActiveFeed` (feedStore.tsx:86): same — `feedType === 'video'` check, else updates album

- [ ] **Step 4: Commit**

```bash
git add src/types/feed.ts src/utils/storage.ts
git commit -m "Add 'artist' to FeedType union and feedTypeStorage allowlist"
```

---

### Task 2: Add Artist option to the top dropdown

**Files:**
- Modify: `src/App.tsx:186-194`

- [ ] **Step 1: Add the option element**

In `src/App.tsx`, locate the feed-type-select block (currently lines 186-194). Add a fourth `<option>` after publisher:

```tsx
<select
  className="feed-type-select"
  value={state.feedType}
  onChange={(e) => handleSwitchFeedType(e.target.value as FeedType)}
>
  <option value="album">Album</option>
  <option value="video">Video</option>
  <option value="publisher">Publisher</option>
  <option value="artist">Artist (Album + Publisher)</option>
</select>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: clean pass. The dropdown will now offer Artist; selecting it dispatches `SET_FEED_TYPE: 'artist'` which the existing reducer handles (line 437-439) without modification. The app will render `<Editor />` (the default branch in App.tsx:292) — fine until Task 5 adds the route.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Add Artist option to feed-type dropdown"
```

---

### Task 3: Add `'artist'` branch to `handleSwitchFeedType`

**Files:**
- Modify: `src/App.tsx:164-174`

When the user selects Artist, auto-create missing feeds with cross-linked GUIDs. Pre-existing feeds are preserved (only the missing side is filled in).

- [ ] **Step 1: Rewrite `handleSwitchFeedType`**

In `src/App.tsx`, replace the existing `handleSwitchFeedType` (lines 164-174) with:

```tsx
const handleSwitchFeedType = (feedType: FeedType) => {
  if (feedType === 'artist') {
    const albumGuid = state.album?.podcastGuid || crypto.randomUUID();
    const publisherGuid = state.publisherFeed?.podcastGuid || crypto.randomUUID();

    if (!state.publisherFeed) {
      dispatch({ type: 'SET_PUBLISHER_FEED', payload: {
        ...createEmptyPublisherFeed(),
        podcastGuid: publisherGuid,
        remoteItems: [{ feedGuid: albumGuid, feedUrl: '', title: '', medium: 'music' }]
      }});
    }
    if (!state.album) {
      dispatch({ type: 'SET_ALBUM', payload: {
        ...createEmptyAlbum(),
        podcastGuid: albumGuid,
        publisher: { feedGuid: publisherGuid }
      }});
    } else if (state.album.publisher?.feedGuid !== publisherGuid) {
      dispatch({ type: 'UPDATE_ALBUM', payload: { publisher: { feedGuid: publisherGuid } } });
    }
    // SET_ALBUM and SET_PUBLISHER_FEED both set feedType themselves; override last
    dispatch({ type: 'SET_FEED_TYPE', payload: 'artist' });
    return;
  }

  dispatch({ type: 'SET_FEED_TYPE', payload: feedType });
  if (feedType === 'video' && !state.videoFeed) {
    dispatch({ type: 'CREATE_NEW_VIDEO_FEED' });
  }
  if (feedType === 'publisher' && !state.publisherFeed) {
    dispatch({ type: 'CREATE_NEW_PUBLISHER_FEED' });
  }
};
```

Notes:
- `createEmptyAlbum` and `createEmptyPublisherFeed` are already imported at the top of `App.tsx` (PR #63 added them — verify the imports are still there; if not, add: `import { createEmptyAlbum, createEmptyPublisherFeed } from './types/feed';`)
- `state.album` is always defined initially (feedStore initializes it from localStorage or with `createEmptyAlbum()`), so the `!state.album` branch is defensive. The check `state.album.publisher?.feedGuid !== publisherGuid` catches the realistic case: pre-existing album without a publisher link.
- We deliberately don't `pendingHostedStorage.clear()` here — the user may be linking an existing hosted album to a new publisher, and clearing hosted credentials would break that.

- [ ] **Step 2: Verify imports**

Open `src/App.tsx` and confirm both `createEmptyAlbum` and `createEmptyPublisherFeed` are imported (PR #63 added them). If missing, add to the existing `../types/feed` import line.

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: clean pass.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

In browser: select Artist from the top dropdown. Open React DevTools → inspect feedStore state. Expected: `state.feedType === 'artist'`, `state.album.publisher.feedGuid === state.publisherFeed.podcastGuid`. The page still renders the Album editor (no ArtistEditor yet — that's Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "Auto-create cross-linked album+publisher when switching to Artist mode"
```

---

### Task 4: Add `chromeless` prop to `<Editor />` and `<PublisherEditor />`

**Files:**
- Modify: `src/components/Editor/Editor.tsx` (top of file + outer return)
- Modify: `src/components/Editor/PublisherEditor/index.tsx`

Both editors wrap their contents in `<div className="main-content"><div className="editor-panel">…</div></div>`. When stacked inside `<ArtistEditor />` we want a single outer scroll container, not two nested ones. The `chromeless` prop lets the editors skip their own chrome when composed.

- [ ] **Step 1: Find the chrome wrapper in `<Editor />`**

Open `src/components/Editor/Editor.tsx` and locate the top-level return. It should start with something like:

```tsx
return (
  <div className="main-content">
    <div className="editor-panel">
      {/* ... all the sections ... */}
    </div>
  </div>
);
```

- [ ] **Step 2: Add `chromeless` prop and conditional wrapping**

At the top of the file, where `Editor` is declared, change:

```tsx
export function Editor() {
```

to:

```tsx
interface EditorProps {
  chromeless?: boolean;
}

export function Editor({ chromeless = false }: EditorProps = {}) {
```

(The `= {}` default lets call sites without props still work, e.g. `<Editor />`.)

Then in the return, extract the inner content into a fragment and conditionally wrap it:

```tsx
const content = (
  <>
    {/* all the existing JSX that was inside <div className="editor-panel"> */}
  </>
);

return chromeless ? content : (
  <div className="main-content">
    <div className="editor-panel">
      {content}
    </div>
  </div>
);
```

If the existing JSX is large (it is), keep the original structure and only adjust the outer wrapping — don't refactor the inner sections.

- [ ] **Step 3: Do the same for `<PublisherEditor />`**

In `src/components/Editor/PublisherEditor/index.tsx`, currently:

```tsx
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

  // ... computes catalogStatus, allFeedsHosted ...

  return (
    <div className="main-content">
      <div className="editor-panel">
        {/* sections */}
      </div>
    </div>
  );
}
```

Change to:

```tsx
interface PublisherEditorProps {
  chromeless?: boolean;
}

export function PublisherEditor({ chromeless = false }: PublisherEditorProps = {}) {
  const { state, dispatch } = useFeed();
  const { publisherFeed } = state;

  const wrap = (content: React.ReactNode) => chromeless ? content : (
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
```

If `React` isn't already imported at the top of `index.tsx`, add: `import type { ReactNode } from 'react';` and use `ReactNode` instead of `React.ReactNode`.

- [ ] **Step 4: Verify existing pages still render**

Run: `npm run build` then `npm run dev`

In browser: switch between Album, Video, Publisher modes. Each should look IDENTICAL to before — chrome (main-content / editor-panel) still wraps each editor because we pass no `chromeless` prop at the existing call sites in `App.tsx:292`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor/Editor.tsx src/components/Editor/PublisherEditor/index.tsx
git commit -m "Add chromeless prop to Editor and PublisherEditor for composition"
```

---

### Task 5: Create `<ArtistEditor />` and wire the route

**Files:**
- Create: `src/components/Editor/ArtistEditor.tsx`
- Modify: `src/App.tsx:21` (imports) and `:292` (route)

- [ ] **Step 1: Create the ArtistEditor component**

Create `src/components/Editor/ArtistEditor.tsx`:

```tsx
import { Editor } from './Editor';
import { PublisherEditor } from './PublisherEditor';

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 16px',
  margin: '24px 0 12px 0',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const albumHeaderStyle: React.CSSProperties = {
  ...sectionHeaderStyle,
  marginTop: 0,
  backgroundColor: 'rgba(99, 102, 241, 0.1)',
  border: '1px solid rgba(99, 102, 241, 0.3)',
  color: 'var(--text-primary)',
};

const publisherHeaderStyle: React.CSSProperties = {
  ...sectionHeaderStyle,
  backgroundColor: 'rgba(139, 92, 246, 0.1)',
  border: '1px solid rgba(139, 92, 246, 0.3)',
  color: 'var(--text-primary)',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  textTransform: 'none',
  letterSpacing: 'normal',
  color: 'var(--text-secondary)',
  marginLeft: '4px',
};

export function ArtistEditor() {
  return (
    <div className="main-content">
      <div className="editor-panel">
        <div style={albumHeaderStyle}>
          <span>🎵 Album</span>
          <span style={subtitleStyle}>— fields below go into your album RSS feed</span>
        </div>
        <Editor chromeless />

        <div style={publisherHeaderStyle}>
          <span>🏢 Publisher</span>
          <span style={subtitleStyle}>— fields below go into your publisher (label) RSS feed</span>
        </div>
        <PublisherEditor chromeless />
      </div>
    </div>
  );
}
```

Notes:
- The emoji prefixes match the icons used elsewhere in PR #63 (`&#127970;` for the publisher section, etc.). We're using literal emoji here for simplicity.
- Both sections share one outer `main-content` / `editor-panel` chrome, so there's one scroll container, not two.
- If `React.CSSProperties` isn't accepted by the file, add `import type { CSSProperties } from 'react';` and use `CSSProperties` instead.

- [ ] **Step 2: Import ArtistEditor in App.tsx**

In `src/App.tsx`, near line 21 where `PublisherEditor` is imported, add:

```tsx
import { ArtistEditor } from './components/Editor/ArtistEditor';
```

- [ ] **Step 3: Add the route**

In `src/App.tsx`, locate line 292 (the existing ternary):

```tsx
{state.feedType === 'publisher' ? <PublisherEditor /> : <Editor key={...} />}
```

Replace with:

```tsx
{state.feedType === 'publisher' ? <PublisherEditor />
  : state.feedType === 'artist' ? <ArtistEditor />
  : <Editor key={`${state.feedType}-${state.album?.podcastGuid}-${state.videoFeed?.podcastGuid}`} />}
```

(Keep the existing `key` on the default-branch `<Editor />` intact; it's there to force remount on feed swaps.)

- [ ] **Step 4: Verify build**

Run: `npm run build`

Expected: clean pass.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`

In browser:
1. Select Artist from the top dropdown
2. Expected: see the indigo "Album" header bar, then the entire album editor, then the violet "Publisher" header bar, then the entire publisher editor, all in one scroll
3. Edit a field in each half, scroll between them
4. Switch to Album mode from the dropdown — should land cleanly with just album fields visible
5. Switch back to Artist — both fields you edited should still be present

- [ ] **Step 6: Commit**

```bash
git add src/components/Editor/ArtistEditor.tsx src/App.tsx
git commit -m "Add ArtistEditor combined view and route 'artist' feedType to it"
```

---

### Task 6: Suppress the "Go to Publisher" banner in Artist mode

**Files:**
- Modify: `src/components/Editor/Editor.tsx:672-702`

The green "Linked to publisher feed" banner with the "Go to Publisher" button is redundant in Artist mode (publisher sections are already on the same page).

- [ ] **Step 1: Get access to feedType inside Editor**

In `src/components/Editor/Editor.tsx`, near the top of the `Editor` function body, locate the existing `useFeed()` call. The destructure should already include `state` — confirm `state.feedType` is reachable. If not (e.g., the file uses a different destructure pattern), adjust to:

```tsx
const { state, dispatch } = useFeed();
// state.feedType is now available
```

- [ ] **Step 2: Wrap the Publisher Feed section's inner content**

In `src/components/Editor/Editor.tsx`, find the Publisher Section block (around lines 672-702). The current structure:

```tsx
<Section title="Publisher Feed (Advanced)" icon="&#127970;">
  {state.publisherFeed && album.publisher?.feedGuid === state.publisherFeed.podcastGuid ? (
    <div /* green linked banner */> ... </div>
  ) : (
    <p /* descriptive text */> ... </p>
  )}
  <div className="form-group">
    <label>Publisher Feed URL ...
    {/* rest of the inputs */}
  </div>
</Section>
```

Modify to hide BOTH the banner and the descriptive paragraph when in Artist mode (the section header alone is enough context, and the publisher fields are immediately visible below the album fields):

```tsx
<Section title="Publisher Feed (Advanced)" icon="&#127970;">
  {state.feedType !== 'artist' && (
    state.publisherFeed && album.publisher?.feedGuid === state.publisherFeed.podcastGuid ? (
      <div /* green linked banner — unchanged */> ... </div>
    ) : (
      <p /* descriptive text — unchanged */> ... </p>
    )
  )}
  <div className="form-group">
    {/* unchanged */}
  </div>
</Section>
```

If preferred, hide the entire `<Section>` in Artist mode instead — but keep it shown so users in Artist mode can still see / verify the underlying Publisher Feed URL fields the album is linked to.

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: clean pass.

- [ ] **Step 4: Manual check**

Run: `npm run dev`

In browser:
1. Switch to Artist mode
2. Scroll within the Album block to the "Publisher Feed (Advanced)" section
3. Expected: no green "Linked to publisher feed: …" banner; no "Link this album to a publisher catalog…" descriptive text; the Publisher Feed URL input and other fields ARE still visible
4. Switch to Album mode
5. Expected: the green banner reappears (still cross-linked from Task 3)

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor/Editor.tsx
git commit -m "Hide Editor's Publisher-Feed banner in Artist mode"
```

---

### Task 7: Fix CatalogFeedsSection dead-code condition

**Files:**
- Modify: `src/components/Editor/PublisherEditor/CatalogFeedsSection.tsx:259`

The inline "Current album … is in this catalog" / "Add This Album" banner has been dead code since PR #63 — its conditional inverts the publisher-mode check that gates the entire section. Fix surfaces it in both publisher mode and artist mode.

- [ ] **Step 1: Replace the broken conditional**

In `src/components/Editor/PublisherEditor/CatalogFeedsSection.tsx`, line 259:

Before:
```ts
const currentAlbum = feedState.feedType !== 'publisher' ? feedState.album : null;
```

After:
```ts
const currentAlbum = feedState.album;
```

Rationale: `state.album` persists in store across feedType switches (it's a separate field, not feedType-conditional). Reading it directly is safe in publisher mode AND artist mode. The downstream guards (`currentAlbum?.podcastGuid && (...)` at line 274) already handle the empty-album case.

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: clean pass.

- [ ] **Step 3: Manual check**

Run: `npm run dev`

In browser:
1. Switch to Artist mode (auto-creates cross-linked feeds per Task 3)
2. Scroll down to the Publisher block → Catalog Feeds section
3. Expected: a green banner reading "Current album <strong>…</strong> is in this catalog." (Artist Setup pre-populates the catalog with this album in Task 3, so `albumAlreadyInCatalog` is true)
4. Manually edit `state.album.podcastGuid` (e.g., via React DevTools, or temporarily change it in code) so it no longer matches any catalog entry
5. Expected: banner flips to indigo "Current album … is not in this catalog yet" with an "Add This Album" button

If you can't easily mutate the GUID for testing, an alternative check: switch to Publisher mode (still works), the same banner should appear.

- [ ] **Step 4: Commit**

```bash
git add src/components/Editor/PublisherEditor/CatalogFeedsSection.tsx
git commit -m "Fix CatalogFeedsSection dead-code condition for current-album shortcut"
```

---

### Task 8: Simplify `handleArtistSetup` to delegate to mode switch

**Files:**
- Modify: `src/App.tsx:122-136`

The PR's existing `handleArtistSetup` does two manual dispatches. With Task 3 in place, `handleSwitchFeedType('artist')` does the same thing. Simplify.

- [ ] **Step 1: Replace `handleArtistSetup` body**

In `src/App.tsx`, locate `handleArtistSetup` (currently lines 122-136). Replace with:

```tsx
const handleArtistSetup = () => {
  handleSwitchFeedType('artist');
  setShowNewFeedChoiceModal(false);
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: clean pass. The button in `NewFeedChoiceModal` still calls `onArtistSetup`, which still points at this handler — no other rewiring needed.

- [ ] **Step 3: Manual check**

Run: `npm run dev`

In browser:
1. Click "New" → "Artist Setup"
2. Expected: modal closes, feedType becomes Artist, combined editor renders with both feeds cross-linked
3. Click "New" → "Start Blank"
4. Expected: still works (creates an empty album, lands in album mode) — Task 8 should not affect this path

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "Simplify handleArtistSetup to delegate to handleSwitchFeedType"
```

---

### Task 9: Run full static-check suite

**Files:** none modified.

- [ ] **Step 1: Lint**

Run: `npm run lint`

Expected: 25 errors / 1 warning (identical to master — no new lint issues introduced). If the count is higher, find and fix the new ones; do NOT mass-fix pre-existing tech debt.

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: clean tsc + vite pass.

- [ ] **Step 3: Test**

Run: `npm run test`

Expected: 89 tests pass (no new tests; existing tests cover utility functions that this work doesn't touch).

- [ ] **Step 4: If any check fails**

Stop, fix the root cause, and rerun. Do not proceed to manual testing until all three are green.

---

### Task 10: Manual browser verification (the spec's 9-step checklist)

**Files:** none modified.

Run: `npm run dev` and exercise each numbered scenario from the spec's Testing section. Re-listed here for convenience:

- [ ] **1. Cold start, Artist mode.** Fresh page load, select Artist. Verify combined editor renders. Open React DevTools, confirm `state.album.publisher.feedGuid === state.publisherFeed.podcastGuid`.

- [ ] **2. Persistence.** Edit fields in both halves of the Artist editor. Reload the page. Verify stays in Artist mode (feedTypeStorage persists 'artist') and fields stick.

- [ ] **3. Mode round-trip.** Artist → Album → Artist. Verify no extra feeds created, fields preserved, cross-link intact.

- [ ] **4. Existing album mode round-trip.** Start in Album mode with an existing album that has no publisher link (manually clear `album.publisher` via DevTools, or import an album feed without one). Switch to Artist. Verify the album is preserved and a publisher feed is auto-created and cross-linked.

- [ ] **5. CatalogFeedsSection prompt in Publisher mode.** From Artist mode, switch to Publisher mode via the dropdown. In the Catalog Feeds section, verify the green "Current album … is in this catalog" banner appears.

- [ ] **6. Save → Download Feed Package in Artist mode.** Click Save → choose "Download Feed Package (album + publisher)" → 3 files download. Open each XML and verify cross-referenced GUIDs (`<podcast:publisher feedGuid="…">` in album points at publisher's GUID; `<podcast:remoteItem feedGuid="…" medium="music">` in publisher points at album's GUID).

- [ ] **7. Save → Submit to PodcastIndex in Artist mode.** Verify it submits the album feed URL, same as in album mode.

- [ ] **8. Switch to Video mode from Artist.** Verify video editor appears; the album and publisher feeds remain in store (still in DevTools), untouched.

- [ ] **9. NewFeedChoiceModal → Artist Setup button.** From any mode, click New → Artist Setup. Verify the modal closes, feedType becomes Artist, combined editor renders, both feeds created/preserved.

- [ ] **10. Regression: Album / Video / Publisher modes unchanged.** Quick spot-check that the three pre-existing modes look and behave identically to master. No chrome/layout changes, no extra fields, no console errors.

If any check fails, fix the root cause (don't paper over), commit the fix as a follow-up, and re-verify.

---

### Task 11: Update PR #63 description and push

**Files:** none in repo (GitHub PR body only).

- [ ] **Step 1: Push the branch**

```bash
git push origin claude/artist-publisher-feed-flow-Ad6B7
```

- [ ] **Step 2: Update the PR description**

Run:
```bash
gh pr edit 63 --body "$(cat <<'EOF'
Introduces an "Artist Setup" path that creates both an album feed and a
publisher catalog simultaneously with GUIDs cross-linked, then opens a
combined editor where the user fills both feeds on a single page.

## What's new

- **Artist feedType (new):** Top dropdown now offers Album / Video /
  Publisher / Artist (Album + Publisher). Selecting Artist auto-creates
  any missing feeds with cross-linked GUIDs and renders ArtistEditor,
  which stacks the existing Album and Publisher editors in one scroll.
- **Artist Setup button (existing in PR):** The "New" modal's Artist
  Setup button is preserved as a shortcut — it just switches to Artist
  mode (the mode switch does the feed creation).
- **Download Feed Package:** Save → Download Feed Package downloads
  album XML + publisher XML + next-steps.txt, with cross-referenced
  GUIDs baked in.
- **Bug fix:** CatalogFeedsSection's "Add This Album" prompt was dead
  code (inverted feedType check); now appears as designed.

Existing flows (Album / Video / Publisher) are unchanged.

Spec: docs/superpowers/specs/2026-05-21-combined-artist-editor-design.md
Plan: docs/superpowers/plans/2026-05-21-combined-artist-editor.md
EOF
)"
```

- [ ] **Step 3: Verify PR is green**

Run: `gh pr view 63 --json statusCheckRollup,mergeable,mergeStateStatus`

Expected: `mergeable: MERGEABLE`, all status checks SUCCESS.

---

## Plan summary

| Task | Files touched | Risk |
|---|---|---|
| 1. Extend FeedType + storage | 2 | Low — type-system surface only |
| 2. Add dropdown option | 1 | Trivial |
| 3. handleSwitchFeedType branch | 1 | Medium — feed creation logic |
| 4. chromeless prop | 2 | Low — additive prop, default preserves behavior |
| 5. ArtistEditor + route | 2 | Low — composition of tested components |
| 6. Hide redundant banner | 1 | Trivial |
| 7. Fix dead-code condition | 1 | Trivial — one-line fix |
| 8. Simplify handleArtistSetup | 1 | Trivial |
| 9. Static checks | 0 | Verification only |
| 10. Manual browser test | 0 | Verification only |
| 11. Push + PR update | 0 | Documentation |

Total estimate: 1–2 hours including manual testing.
