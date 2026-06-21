# Managed-key Nostr profile: make page-3 artist info authoritative on publish

**Date:** 2026-06-20
**Branch:** `new-onboarding-v2`
**Status:** Approved

## Context

A Google managed-keypair user starts with an empty Nostr kind-0 profile ("just a
keypair and nothing else"), whereas a NIP-07/NIP-46 user brings an existing profile that
MSP pulls in. On publish, MSP already pushes the wizard's **Artist Name** (`publisherFeed.author`,
page 3) and **publisher art** (`publisherFeed.imageUrl`, page 3) into the kind-0 for
managed keys (`useOnboardingDraft.ts:325`, gated `getConnectionMethod() === 'managed'`).

The gap: that push uses `mergeProfileFields`, which is **fill-empty / non-destructive**.
So the first publish sets name + art correctly, but if the artist later edits page 3 and
re-publishes, the kind-0 already has values and is **not updated** — the Nostr profile
goes stale.

## Goal

For managed (Google) keys, make page 3 **authoritative**: every publish sets the kind-0
`name`/`display_name` ← Artist Name and `picture` ← publisher art, so edits propagate.
NIP-07/NIP-46 keep the non-destructive behavior (they never run this push).

## Changes

### 1. `mergeProfileFields` — `src/utils/nostrSync.ts`
Add optional third arg `opts?: { overwrite?: boolean }`, default `false`.
- `overwrite: false` (default): unchanged — fills only empty `name`/`display_name`/`picture`.
- `overwrite: true`: set `name`/`display_name` ← `name` and `picture` ← `picture` whenever a
  value is provided **and differs** from the existing kind-0 value. Only mark `changed`
  (and thus publish) when something actually differs, so a no-edit re-publish doesn't emit a
  redundant kind-0 event.

### 2. Managed publish branch — `src/components/Onboarding/useOnboardingDraft.ts:328`
Pass `{ overwrite: true }`:
```ts
const merged = mergeProfileFields(
  existingProfile,
  { name: publisherFeed.author, picture: publisherFeed.imageUrl },
  { overwrite: true },
);
```
No other change to the branch — it's already managed-only and best-effort.

### 3. Test — `src/utils/nostrSync.test.ts`
Add `mergeProfileFields` overwrite cases:
- overwrite replaces an existing `name`/`display_name`/`picture` with new values;
- overwrite returns `null` when the provided values equal the existing ones (no redundant publish);
- default (no opts) behavior unchanged (existing tests still pass).

## Out of scope
- Seeding the profile at sign-up (decided: on-publish timing is fine).
- Changing NIP-07/NIP-46 profile handling.
- `about`/`nip05`/`lud16` fields (only name + picture are in scope).

## Verification
- `npm run test` — `nostrSync.test.ts` passes (old + new cases).
- `npm run lint` (0 errors) and `npm run build` (tsc + vite) succeed.
- Manual: Google sign-in → fill page 3 → publish (profile shows artist name + art) →
  edit artist name/art → re-publish → kind-0 reflects the edit.
