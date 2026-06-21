# Primal signup carousel — onboarding "New to Nostr" panel

**Date:** 2026-06-20
**Branch:** `new-onboarding-v2`
**Status:** Approved

## Context

The onboarding wizard's "Try Nostr — I'm new" path (`NewToNostrPanel`) walks a
first-timer through creating a Nostr identity in Primal, then connecting it to MSP via a
remote signer (NIP-46). Today that walkthrough is a text-only numbered step list. We have
real screenshots of Primal's iOS account-creation flow, so we're replacing the
account-creation half of the step list with a visual carousel. The connect half stays
live-visual via the existing QR (the user scans MSP's `nostrconnect://` QR with Primal).

## Goal

Show the actual Primal signup as a swipeable, captioned screenshot carousel so a new user
sees exactly what to do, then connects with the QR-first remote-signer flow already in
`NostrLoginPanel`.

## Locked decisions (unchanged)

- Primal-only walkthrough; no other app names.
- iOS + Android wording (screenshots are iOS; captions stay generic where possible).
- Connect step leads with scanning MSP's QR.

## Assets

5 screenshots copied from Photos and converted to WebP (`cwebp -q 80`, ~144K total) into
`src/assets/onboarding/`:

| File | Screen | Caption |
|---|---|---|
| `primal-1-create-account.webp` | Create Account | Add a display name and photo — Primal generates your Nostr keys for you. |
| `primal-2-follow-people.webp` | Follow People | Pick a few topics to follow (optional). |
| `primal-3-account-preview.webp` | Account Preview | Review your new profile. |
| `primal-4-account-created.webp` | Success! | Keep **Save to iCloud Keychain** on so your key is backed up. |
| `primal-5-profile.webp` | Profile | 🎉 You're on Nostr — now connect it to MSP. |

## Components

### `PrimalSignupCarousel.tsx` (new, `src/components/Onboarding/`)
Self-contained presentational carousel.
- Local `index` state (0–4). Renders the active image + caption, `‹`/`›` arrow buttons,
  `n/5` counter, and a row of dot buttons.
- Imports the 5 images as modules into a local `SLIDES` array (`{ src, alt, caption }`).
- Fixed image frame height so the panel doesn't reflow between slides.
- Accessibility: `alt` per image, `aria-label` on arrows ("Previous"/"Next"), dots are
  real `<button>`s with `aria-label` ("Go to step n") and `aria-current` on the active dot.
- No external deps; no Nostr/store coupling — pure props-free component.

### `NewToNostrPanel.tsx` (restructure)
Replaces the numbered step list with:
1. Intro line (kept, lightly reworded).
2. A short **Download** line with the `primal.net` link — "available on iOS and Android."
3. Heading "Create your account in Primal" + `<PrimalSignupCarousel />`.
4. **Connect** section "Then connect it to MSP":
   - `inlineConnect` (wizard): render `<NostrLoginPanel />` below (QR-first button).
   - non-inline (modal): point to the **Remote Signer** tab, as today.

## Styling

Carousel styles added to `App.css` (alongside existing `.nostr-connect-primal` /
`.primal-step*` rules): frame, image fit (`object-fit: contain`, max-height ~360px),
caption, arrows, dots. Reuses existing button classes where possible.

## Out of scope

- Screenshots of the QR-scan / remote-signer connect step (none exist yet; the live QR
  covers it).
- Android-specific screenshots.
- Carousel autoplay / swipe-gesture libraries (arrows + dots + native scroll only).

## Verification

- `npm run lint` (no unused vars from new `index` state) and `npm run build` (tsc + vite —
  confirms WebP imports resolve and types are clean).
- `npm run dev`, open the wizard auth step → "Try Nostr — I'm new": the carousel renders,
  arrows + dots cycle all 5 captioned shots, and the connect QR button still appears below.
