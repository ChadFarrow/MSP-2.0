# Google Managed-Key Profile Push — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Google managed-key user publishes through the onboarding wizard, write their Artist Name + publisher artwork to their (otherwise-blank) Nostr kind-0 profile so the fresh npub shows a real name and avatar across Nostr apps.

**Architecture:** A pure fill-empty merge helper plus a thin kind-0 publish helper, both added to `src/utils/nostrSync.ts` next to the existing `fetchNostrProfile`. The wizard's `publish()` calls them behind a `getConnectionMethod() === 'managed'` gate, best-effort, after the feed publish succeeds. `nostrStore` gains an `updateProfile()` method so the in-app identity card reflects the new values immediately.

**Tech Stack:** React 19 + TypeScript, Vitest 4, nostr-tools, existing `signEventWithTimeout` / `publishEventToRelays` helpers.

## Global Constraints

- TypeScript strict mode; `noUnusedLocals` / `noUnusedParameters` enforced — no unused imports/vars.
- Never call `signer.signEvent` / `getPublicKey` directly — use `signEventWithTimeout` / `getPublicKeyWithTimeout`.
- Feature is **managed-method only** (`getConnectionMethod() === 'managed'`). NIP-07 / NIP-46 paths must be untouched.
- The profile push is **best-effort**: a failure must never block or reject the wizard `publish()` flow.
- Merge is **non-destructive**: only fill kind-0 fields that are currently empty.
- Commit messages: imperative tense; end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Reference spec: `docs/superpowers/specs/2026-06-19-google-profile-push-design.md`.

---

### Task 1: Pure profile-merge helper

**Files:**
- Modify: `src/utils/nostrSync.ts` (add `mergeProfileFields`, after `fetchNostrProfile` which ends at line 92)
- Test: `src/utils/nostrSync.test.ts` (create)

**Interfaces:**
- Consumes: `NostrProfile` interface (already exported from `nostrSync.ts:36`).
- Produces: `mergeProfileFields(existing: NostrProfile | null, fields: { name?: string; picture?: string }): NostrProfile | null` — returns the merged profile if it adds at least one field, else `null`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/nostrSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeProfileFields } from './nostrSync';

describe('mergeProfileFields', () => {
  it('fills name, display_name, and picture for a null (fresh) profile', () => {
    const r = mergeProfileFields(null, { name: 'Doerfels', picture: 'https://img/a.png' });
    expect(r).toEqual({ name: 'Doerfels', display_name: 'Doerfels', picture: 'https://img/a.png' });
  });

  it('returns null when the existing profile already has name + picture (nothing to fill)', () => {
    const r = mergeProfileFields(
      { name: 'Existing', display_name: 'Existing', picture: 'https://old.png', lud16: 'a@b.com' },
      { name: 'New', picture: 'https://new.png' }
    );
    expect(r).toBeNull();
  });

  it('fills only empty fields and preserves unrelated ones', () => {
    const r = mergeProfileFields(
      { picture: 'https://old.png', lud16: 'a@b.com' },
      { name: 'New', picture: 'https://new.png' }
    );
    expect(r).toEqual({
      name: 'New',
      display_name: 'New',
      picture: 'https://old.png',
      lud16: 'a@b.com',
    });
  });

  it('returns null when the supplied fields are empty/whitespace', () => {
    expect(mergeProfileFields(null, { name: '   ', picture: '' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/nostrSync.test.ts`
Expected: FAIL — `mergeProfileFields` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/nostrSync.ts`, immediately after the closing `}` of `fetchNostrProfile` (line 92):

```ts
// Merge artist-provided fields into an existing kind-0 profile, filling only
// fields that are currently empty (non-destructive — mirrors the opt-in profile
// pull in the wizard). Returns the merged profile if it adds anything, else null.
export function mergeProfileFields(
  existing: NostrProfile | null,
  fields: { name?: string; picture?: string }
): NostrProfile | null {
  const merged: NostrProfile = existing ? { ...existing } : {};
  const name = (fields.name ?? '').trim();
  const picture = (fields.picture ?? '').trim();
  let changed = false;
  if (name && !merged.name) { merged.name = name; changed = true; }
  if (name && !merged.display_name) { merged.display_name = name; changed = true; }
  if (picture && !merged.picture) { merged.picture = picture; changed = true; }
  return changed ? merged : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/nostrSync.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/nostrSync.ts src/utils/nostrSync.test.ts
git commit -m "Add mergeProfileFields: non-destructive kind-0 profile merge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: kind-0 publish helper

**Files:**
- Modify: `src/utils/nostrSync.ts` (add `publishProfileMetadata` after `mergeProfileFields`)
- Test: `src/utils/nostrSync.test.ts` (extend)

**Interfaces:**
- Consumes: `hasSigner`, `getPublicKeyWithTimeout`, `signEventWithTimeout` (from `./nostrSigner`, already imported at `nostrSync.ts:13`); `publishEventToRelays`, `DEFAULT_RELAYS` (from `./nostrRelay`, already imported at `nostrSync.ts:6-12`); `NostrEvent` (already imported at `nostrSync.ts:2`).
- Produces: `publishProfileMetadata(profile: NostrProfile, relays?: string[]): Promise<{ success: boolean; eventId?: string }>`.

- [ ] **Step 1: Write the failing test**

Add the mocks at the TOP of `src/utils/nostrSync.test.ts` (above the existing imports), and a new `describe` block at the bottom. The mocks must cover every export `nostrSync.ts` pulls from `./nostrSigner` and `./nostrRelay`:

```ts
import { describe, it, expect, vi } from 'vitest';

const { signMock, publishMock } = vi.hoisted(() => ({
  signMock: vi.fn(async (e: { kind: number; content: string }) => ({ ...e, id: 'fake-event-id', sig: 'fake-sig' })),
  publishMock: vi.fn(async () => ({ successCount: 1, results: [] })),
}));

vi.mock('./nostrSigner', () => ({
  hasSigner: () => true,
  getPublicKeyWithTimeout: vi.fn(async () => 'pubkeyhex'),
  signEventWithTimeout: signMock,
}));

vi.mock('./nostrRelay', () => ({
  DEFAULT_RELAYS: ['wss://relay.test'],
  MUSIC_RELAYS: ['wss://relay.test'],
  connectRelay: vi.fn(),
  collectEvents: vi.fn(),
  publishEventToRelays: publishMock,
}));
```

Update the existing top import line to pull in the new function:

```ts
import { mergeProfileFields, publishProfileMetadata } from './nostrSync';
```

Add this `describe` block at the end of the file:

```ts
describe('publishProfileMetadata', () => {
  it('signs a kind-0 event carrying the profile JSON and publishes it', async () => {
    const res = await publishProfileMetadata({ name: 'Doerfels', display_name: 'Doerfels', picture: 'https://img/a.png' });
    expect(res.success).toBe(true);
    expect(res.eventId).toBe('fake-event-id');

    const signedEvent = signMock.mock.calls[0][0];
    expect(signedEvent.kind).toBe(0);
    expect(JSON.parse(signedEvent.content)).toMatchObject({
      name: 'Doerfels',
      display_name: 'Doerfels',
      picture: 'https://img/a.png',
    });
    expect(publishMock).toHaveBeenCalledTimes(1);
  });
});
```

> Note: the four `mergeProfileFields` tests from Task 1 still run in this file. They don't touch the mocked modules, so they remain green.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/nostrSync.test.ts`
Expected: FAIL — `publishProfileMetadata` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/nostrSync.ts`, immediately after `mergeProfileFields`:

```ts
// Publish the logged-in user's kind-0 profile (NIP-01 metadata). Used to give a
// freshly-minted managed (Google) keypair a real name + avatar. Best-effort:
// returns { success: false } rather than throwing so callers never break.
export async function publishProfileMetadata(
  profile: NostrProfile,
  relays = DEFAULT_RELAYS
): Promise<{ success: boolean; eventId?: string }> {
  if (!hasSigner()) return { success: false };
  try {
    const pubkey = await getPublicKeyWithTimeout();
    const unsigned: NostrEvent = {
      kind: 0,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(profile),
    };
    const signed = await signEventWithTimeout(unsigned);
    const { successCount } = await publishEventToRelays(signed as NostrEvent, relays);
    return { success: successCount > 0, eventId: (signed as NostrEvent).id };
  } catch {
    return { success: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/nostrSync.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/utils/nostrSync.ts src/utils/nostrSync.test.ts
git commit -m "Add publishProfileMetadata: publish a kind-0 Nostr profile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Expose updateProfile on nostrStore

**Files:**
- Modify: `src/store/nostrStore.tsx` (context type `:100-106`, provider body, context value `:352-353`)

**Interfaces:**
- Consumes: existing `UPDATE_PROFILE` reducer case (`nostrStore.tsx:66`) and its action payload type `{ displayName?: string; picture?: string; nip05?: string; lud16?: string }` (`nostrStore.tsx:32`).
- Produces: `updateProfile(payload: { displayName?: string; picture?: string; nip05?: string; lud16?: string }): void` on the `useNostr()` context.

- [ ] **Step 1: Add the method to the context type**

In `src/store/nostrStore.tsx`, extend `NostrContextType` (currently lines 100-106):

```ts
interface NostrContextType {
  state: NostrAuthState;
  login: () => Promise<void>;
  loginWithNip46: (bunkerUri?: string, onUriGenerated?: (uri: string) => void) => Promise<void>;
  loginWithGoogle: () => void;
  updateProfile: (payload: { displayName?: string; picture?: string; nip05?: string; lud16?: string }) => void;
  logout: () => void;
}
```

- [ ] **Step 2: Define the callback in the provider**

In `src/store/nostrStore.tsx`, immediately before the `logout` callback (currently `const logout = useCallback(...)` at line 346):

```ts
  // Apply local profile fields (used after publishing a kind-0 for managed keys
  // so the identity card updates without waiting for a relay round-trip).
  const updateProfile = useCallback((payload: { displayName?: string; picture?: string; nip05?: string; lud16?: string }) => {
    dispatch({ type: 'UPDATE_PROFILE', payload });
  }, []);
```

- [ ] **Step 3: Add it to the provider value**

In `src/store/nostrStore.tsx`, update the context value (line 353):

```tsx
    <NostrContext.Provider value={{ state, login, loginWithNip46, loginWithGoogle, updateProfile, logout }}>
```

- [ ] **Step 4: Verify it type-checks and builds**

Run: `npm run build`
Expected: build succeeds (tsc + vite), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/store/nostrStore.tsx
git commit -m "Expose updateProfile() on the Nostr store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire the managed-only push into the wizard publish() + docs

**Files:**
- Modify: `src/components/Onboarding/useOnboardingDraft.ts` (imports near the top; `publish()` body, `:308-318`)
- Modify: `CLAUDE.md` (Nostr Integration → managed keypair note)

**Interfaces:**
- Consumes: `mergeProfileFields`, `publishProfileMetadata`, `fetchNostrProfile` (from `../../utils/nostrSync`); `getConnectionMethod` (from `../../utils/nostrSigner`); `nostr.updateProfile` (Task 3). The hook already holds `nostr` via `useNostr()` and `pubkey` is in scope inside `publish()` (`useOnboardingDraft.ts:254`); `publisherFeed` (with `.author` and `.imageUrl`) is the local var built at `:301`.
- Produces: no new exports — behavioral change only.

- [ ] **Step 1: Add the imports**

The hook imports from neither `nostrSync` nor `nostrSigner` today. Add two new import lines in `src/components/Onboarding/useOnboardingDraft.ts`, directly after the existing `import { generateRssFeed } from '../../utils/xmlGenerator';` (line 25):

```ts
import { fetchNostrProfile, mergeProfileFields, publishProfileMetadata } from '../../utils/nostrSync';
import { getConnectionMethod } from '../../utils/nostrSigner';
```

- [ ] **Step 2: Confirm the Nostr context handle**

The hook already holds the context as `const nostr = useNostr();` (line 81), so `nostr.updateProfile(...)` is callable directly. No change needed in this step — the call is added in Step 3.

- [ ] **Step 3: Add the gated push inside publish()**

In `src/components/Onboarding/useOnboardingDraft.ts`, inside `publish()`, after the publisher-feed result is handled and BEFORE `return result;` (currently lines 315-318):

```ts
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
```

> Also add `nostr` (or `nostr.updateProfile`) to the `useCallback` dependency array of `publish()` if the linter flags it — the array currently ends `}, [state.album, state.publisherFeed, nostr.state, isReturningArtist, dispatch]);` (`:322`). Change `nostr.state` to `nostr` there, or append `nostr.updateProfile`.

- [ ] **Step 4: Verify build + lint + tests**

Run: `npm run build && npm run lint && npm run test`
Expected: build succeeds; lint shows **0 errors** (pre-existing warnings in `ArtistPublishSection.tsx` and `admin/FeedList.tsx` are acceptable); all tests pass (now including the 5 in `nostrSync.test.ts`).

- [ ] **Step 5: Update CLAUDE.md**

In `CLAUDE.md`, under the **Nostr Integration** section, in the **Managed keypair (Google sign-in)** bullet, append a sentence:

```md
The onboarding wizard also **pushes** a profile for managed keys: on publish, if `getConnectionMethod() === 'managed'`, it writes the publisher's Artist Name (`author`) and artwork (`imageUrl`) to the user's kind-0 profile via `publishProfileMetadata()` (`src/utils/nostrSync.ts`), filling only empty fields (`mergeProfileFields`). This is the inverse of the opt-in profile *pull* and is managed-only — NIP-07/NIP-46 users already have a profile. Best-effort; never blocks publishing.
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Onboarding/useOnboardingDraft.ts CLAUDE.md
git commit -m "Push Artist Name + artwork to Nostr profile for managed keys

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual Verification (preview deploy, Google session)

After Task 4, push the branch and test on the branch preview (`msp-2-0-git-new-onboarding-v2-…vercel.app/?onboarding=1`), since the Google OAuth backend isn't reachable from local dev:

1. Sign in with **Google** in the wizard (fresh account ideally).
2. Set an **Artist Name** and upload **publisher artwork**, then complete **Publish**.
3. Open the npub in a Nostr client (e.g. Primal) and confirm the profile now shows that **name** and **avatar**.
4. Re-run the wizard / republish and confirm it does **not** overwrite a name/picture you've since edited elsewhere (fill-empty behavior).
5. Sanity check a NIP-07 or NIP-46 session: publishing must **not** touch their existing profile.
