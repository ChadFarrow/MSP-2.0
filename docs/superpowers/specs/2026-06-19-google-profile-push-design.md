# Push Artist Name + artwork to Nostr profile (Google managed keys)

**Date:** 2026-06-19
**Branch:** new-onboarding-v2
**Status:** Approved design

## Context

The onboarding wizard ties a Nostr identity to the artist's publisher feed. When a
returning Nostr user signs in, the wizard already offers an opt-in **pull**
(`pullProfileFromNostr` in `useOnboardingDraft.ts:189`, "Use my Nostr name & photo")
that fills the publisher `author` / `title` / `imageUrl` form fields from the user's
existing kind-0 profile (`user.displayName` / `user.picture`).

Google managed-keypair users (`connectionMethod === 'managed'`) are different: their
npub is freshly minted by the server at sign-in and has **no kind-0 profile at all**, so
they show up as a truncated `npub1…` across every Nostr app. They have nothing to pull.

This feature is the **inverse push**: take what the managed user typed into the wizard
(Artist Name + publisher artwork) and write it to their Nostr profile so the fresh npub
gets a real name and avatar everywhere.

## Scope

- **Only** when `getConnectionMethod() === 'managed'`. NIP-07 and NIP-46 are never
  touched — they keep the existing opt-in pull. Rationale: NIP-07 users already have a
  profile; NIP-46/Primal users get one from Primal. Only the Google keypair is born blank.
- **Out of scope:** pushing the lightning address (`lud16`) or any field other than name +
  picture; any new UI beyond an optional success-screen confirmation line.

## Behavior

Publish a Nostr **kind-0** profile event with:

- `name` **and** `display_name` ← publisher `author` (Artist Name)
- `picture` ← publisher `imageUrl` (publisher artwork)

**Non-destructive merge (mirrors the pull):** fetch the user's current kind-0 via the
existing `fetchNostrProfile()`, then only fill fields that are currently empty
(`name = existing.name || author`, `display_name = existing.display_name || author`,
`picture = existing.picture || imageUrl`). A fresh managed npub has no profile, so all
three set cleanly. A re-run, or anything already present (including unrelated fields like
`lud16`/`about`/`nip05`), is preserved. Skip the publish entirely if there is nothing new
to write (both name and picture already populated, or the form values are empty).

**Timing:** runs at publish time inside the wizard's `publish()`
(`useOnboardingDraft.ts:253`), behind the managed-only gate. Managed signing is
local/instant, so there is no extra signer prompt. It is **best-effort**: a relay-publish
failure is logged (`console.warn`) and does **not** block the feed from publishing
(wrapped so its error can't reject the publish flow).

**After success:** update the in-app identity card to reflect the new name/picture. The
hook's `dispatch` is the **feedStore** reducer, but `UPDATE_PROFILE` is a **nostrStore**
action that is not currently exposed. So `nostrStore` gains a small `updateProfile(payload)`
context method (it already has the `UPDATE_PROFILE` reducer case — this just wires a
callback to it, mirroring `login`/`logout`), and the wizard calls it. This is a
nice-to-have; if `updateProfile` is undesirable to add, the card self-corrects on the next
session restore (which re-fetches kind-0), so the UI update can be dropped without
affecting the core feature.

## Components

1. **`publishProfileMetadata(profile, relays?)`** — new helper in
   `src/utils/nostrSync.ts`, placed next to its read-twin `fetchNostrProfile()`. Builds the
   kind-0 event (`{ kind: 0, pubkey, created_at, tags: [], content: JSON.stringify(profile) }`),
   signs with the existing `signEventWithTimeout`, publishes via the existing
   `publishEventToRelays` to `DEFAULT_RELAYS`. Returns `{ success, eventId? }`. Gets the
   pubkey via `getPublicKeyWithTimeout()` like the other write helpers in this file.

2. **Gated call in `publish()`** (`useOnboardingDraft.ts`) — after the feed publish
   succeeds, if `getConnectionMethod() === 'managed'`: fetch existing profile, compute the
   merged `{ name, display_name, picture }`, and if it adds anything, call
   `publishProfileMetadata(...)`, then `nostr.updateProfile({ displayName, picture })`
   (see below). All wrapped in try/catch so it never breaks publishing.

3. **`updateProfile` on `nostrStore`** — new context method exposing the existing
   `UPDATE_PROFILE` reducer case (`{ displayName?, picture?, nip05?, lud16? }`), mirroring
   how `login` / `logout` are exposed. Consumed by the wizard for the immediate card update.

## Data flow

```
publisher.author  ─┐
publisher.imageUrl ─┤→ merge with fetchNostrProfile(pubkey) (fill-empty) →
                    │   publishProfileMetadata({name, display_name, picture})
                    │   → signEventWithTimeout(kind 0) → publishEventToRelays(DEFAULT_RELAYS)
                    └→ on success: dispatch UPDATE_PROFILE → identity card updates
```

## Error handling

- No pubkey / not managed → skip silently (no-op).
- Nothing new to write → skip (don't spam relays with an identical profile).
- Sign/publish throws → `console.warn`, swallow; feed publish proceeds and succeeds.

## Testing

- **Unit (`nostrSync` helper):** mock the signer + relay publish; assert the kind-0 event
  content carries name/display_name/picture and that an existing-profile merge fills only
  empty fields. (Mirror the style of existing `nostrSync`-adjacent tests.)
- **Manual (preview deploy, Google session):** sign in with Google in the wizard, set
  Artist Name + publisher artwork, publish, then confirm in a Nostr client (e.g. Primal)
  that the npub now shows that name and avatar. Re-run to confirm it doesn't clobber an
  edited profile.

## Alternatives considered (rejected)

- **Push when leaving the publisher step** — fires earlier but adds a separate signing
  moment; no benefit since publish-time is when values are finalized.
- **Server-side default profile at `google-callback`** — impossible; the artist name
  doesn't exist at sign-in.
- **Always overwrite name/picture from the form** — simpler but could clobber a managed
  profile the user edited elsewhere; fill-empty is safer and matches the pull's semantics.
