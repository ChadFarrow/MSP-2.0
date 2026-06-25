# Onboarding Landing Flow — Design

**Date:** 2026-06-24
**Branch:** `new-onboarding-v2`
**Status:** Approved (brainstorm) — pending implementation plan

## Context

MSP 2.0 has accumulated the right *pieces* — an album/video/publisher **Editor**, a guided new-user **Wizard**, a returning-artist **Profile** (just built), MSP-hosting, self-host export (Download XML), Podcast Index submission, and Podping — but no coherent **flow** that lands each kind of visitor where they need to be.

The driving product principle: a musician who wants nothing to do with **Nostr or Bitcoin/Lightning** must be able to use MSP end-to-end without friction. Those features are differentiators but also adoption barriers, so they must be optional and never foregrounded. (See memory `project_nostr-bitcoin-optional`.)

Three visitor paths motivate this work:
1. **New user, guided** — wants hand-holding to make and publish a feed.
2. **Returning account-holder** — used MSP-hosting before, comes back to add/edit feeds.
3. **Self-host / pure export** — makes a feed in MSP, downloads the XML, uploads it to their *own* server, and uses MSP only to submit the URL to Podcast Index and send podpings. No account, no Nostr, no Bitcoin.

The key realisation that untangles the design: the opening fork is **self-host vs MSP-host** — purely about *where the feed bytes live*. It is **orthogonal** to Nostr/Lightning, which remain optional add-ons available on *either* side. (A self-hoster can still add Lightning splits and publish to Nostr; an MSP-host user can stay Nostr-unaware via managed Google sign-in.)

## Goals

- A single landing-decision layer that routes each visitor to Editor, Wizard, or Profile — reusing all existing pieces, rebuilding none.
- Self-host / no-account is the **frictionless default**: straight to the Editor, no wizard, no account, no Nostr/Bitcoin shown.
- Keep the existing **"Have you used MSP 2.0 before?" gate** as the first-visit welcome.
- Designed so a future **per-hostname default** (`new.` → Wizard, apex → Editor) is a thin switch added later.

## Non-goals (out of scope for this spec)

- **Funding-vs-Lightning presentation** — presenting `<podcast:funding>` links as an equal, fiat-friendly support option alongside Lightning/V4V. This is an Editor/Wizard UI change, independent of routing. Tracked as a separate follow-up spec (and in memory `project_nostr-bitcoin-optional`).
- Any change to the Wizard's internal steps, the Profile internals, or the Save destinations themselves.
- The Phase 2 hostname layer is *documented* here but implemented as a later step (see below).

## Design

### 1. Landing decision (where a visitor ends up)

A single decision, evaluated **after the Nostr session finishes restoring** (`!nostrState.isLoading`) so we never flash the wrong screen. In priority order:

1. **Wizard mid-flight** — `wizardStorage.isInProgress()` (e.g. resuming after the Google OAuth full-page redirect) → **Wizard**. *(exists today)*
2. **Logged in with ≥1 MSP-hosted feed** → **Profile**. *(exists — the auto-route effect in `App.tsx` using `useMyHostedFeeds`)*
3. **Otherwise → the host's default view:**
   - **Phase 1:** default = **Editor** for everyone.
   - **Phase 2:** hostname-driven (see §3).

This only sets the *starting* point; every surface stays mutually reachable (§2).

### 2. The gate, retained and reframed

The **"Have you used MSP 2.0 before?" gate** (`OnboardingPage`, `startAtGate`) stays as the first-visit welcome. Its two branches:

- **"No, I'm new"** → a short follow-up — *"Where will your feed live?"*
  - **I'll host it myself** → **Editor** (self-host; no account, no Nostr/Bitcoin shown). Marks onboarding complete.
  - **Let MSP host it for me** → **Wizard** (MSP-host; managed Google or Nostr signer).
- **"Yes, I've used this before"** → logged in → **Profile**; logged out → **Editor**, with sign-in **offered, not forced** (a self-host returner must not hit a sign-in wall). *(Change from current behaviour, which pops the sign-in modal unconditionally.)*

After the gate is completed, return visits skip it and go straight to the §1 decision.

### 3. Reachability (no locked doors)

The landing decision is a starting point, never a trap. Existing entry points are sufficient, with **one addition**:

| From → To | Mechanism | Status |
|---|---|---|
| Editor → Wizard | "New" → **New Artist (Guided)** (`NewFeedChoiceModal`) | exists |
| Editor → MSP-host | **Save → Host on MSP** (`SaveModal`) | exists |
| Editor → Profile | hamburger → **My Profile** (logged in) | exists |
| Wizard → Editor | **"Skip — I'll host it myself"** exit | **ADD** — make the escape explicit |
| Profile → Editor | Edit / + New Album / ✕ Close | built |
| Anywhere → Sign In | header / hamburger | exists |

The only new affordance: a clear **skip-to-editor exit in the Wizard**, so an MSP-host newcomer who changes their mind (or decides to self-host) isn't stuck.

### 4. Phase 2 — hostname default (deferred)

Once Phase 1 feels balanced, add a thin `window.location.hostname` check feeding §1 step 3's "host default":

- `new.musicsideproject.com` → default landing = **Wizard**; its gate "I'm new" branch may skip the self-host/MSP-host follow-up and go straight to the Wizard (the domain already implies "new user, guide me").
- apex / `www` / legacy `msp.podtards.com` → default landing = **Editor**.

Steps 1 (wizard-in-progress) and 2 (logged-in → Profile) still win regardless of hostname — a user never loses their session or feeds because of which domain they typed. The switch is trivial to toggle and changes none of the pieces.

## Affected code (reuse, not rebuild)

- `src/App.tsx` — `AppContent`: the landing-decision logic, the `view` state (`'profile' | 'editor'` today; the gate/wizard are separate flags), the existing auto-route effect, and the gate render. The "Yes, used before" handler (`onChooseReturning`) changes from forcing the sign-in modal to offering it.
- `src/components/OnboardingPage.tsx` — the gate; add the **"Where will your feed live?"** follow-up to the "I'm new" branch (new `onChooseSelfHost` / `onChooseMspHost`-style callbacks, alongside the existing `onChooseFirstTime` / `onChooseReturning`).
- `src/components/Onboarding/OnboardingWizard.tsx` — add the explicit **skip-to-editor** exit.
- Storage flags (`onboardingStorage`, `wizardStorage` in `src/utils/storage.ts`) — reused as-is.
- No changes to `ArtistProfile`, `useMyHostedFeeds`, `NewFeedChoiceModal`, or `SaveModal` for this spec.

## Verification

Manual, against `npm run dev` (and `npm run build` for typecheck — root tsconfig is references-only, so `tsc --noEmit` is a false green):

- **New + self-host:** first visit → gate → "I'm new" → "I'll host it myself" → lands in **Editor**; no account/Nostr/Bitcoin prompts; Save → Download XML works; Podping + Submit-to-PI reachable.
- **New + MSP-host:** gate → "I'm new" → "Let MSP host it" → **Wizard**; can **skip to Editor** mid-way.
- **Returning, logged out, self-host:** gate → "Yes, used before" → **Editor**, sign-in only *offered*; no forced modal.
- **Returning, logged in, owner:** gate "Yes" (or return visit) → **Profile** with feeds.
- **OAuth resume:** wizard-in-progress flag → **Wizard** at the saved step after the Google redirect.
- **Phase 2 (when added):** `new.` host → Wizard default; apex host → Editor default; logged-in still → Profile on both.

## Rollout

- **Phase 1:** gate reframe + self-host/MSP-host follow-up + "Yes, used before" offers sign-in + Wizard skip-to-editor exit + Editor as universal default.
- **Phase 2:** hostname default switch.
- **Follow-up spec:** funding-equal-to-Lightning support presentation.
