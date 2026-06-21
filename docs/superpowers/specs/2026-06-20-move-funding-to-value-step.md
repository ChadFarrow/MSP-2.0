# Move the funding tag from Credits/extras (step 7) to the Value page (step 6)

**Date:** 2026-06-20
**Branch:** `new-onboarding-v2`
**Status:** Approved

## Context

The Podcasting 2.0 funding tag (`<podcast:funding>` — a support URL + text) is currently
collected in the wizard's **Extras step (7, "Credits & extras")**, below Credits/Persons,
as two generically-labeled inputs ("URL" / "Text"). That's the wrong home: funding isn't a
credit or a person — it's a "how fans support you" mechanism, so it belongs with V4V on the
**Value step (6)**. This also gives Google managed users (who have no Lightning wallet) a
visible, zero-setup support option right where they'd look for it.

## Goal

Move the funding fields from step 7 to step 6, clearly labeled as a support link. No data
or type changes — still `album.funding` → `<podcast:funding>`.

## Changes

### 1. `src/components/Onboarding/steps/ValueStep.tsx`
Below the existing V4V `RecipientsList`, add a labeled "Support link" block:
- A heading **"Support link"** + one-line helper: *"A page where fans can support you
  (Patreon, a tip jar, your site) — works without Lightning."*
- The existing `<FundingFields funding={state.album.funding} onUpdate={f => dispatch({ type: 'UPDATE_ALBUM', payload: { funding: f } })} />` (same binding it has in ExtrasStep today).

### 2. `src/components/Onboarding/steps/ExtrasStep.tsx`
Remove the `<FundingFields>` block and its `<div style={{ marginTop: 16 }}>` wrapper. The
step becomes just the intro line + Credits/Persons. Drop the now-unused `FundingFields`
import.

### 3. No other changes
`album.funding`, the `Funding` type, `UPDATE_ALBUM`, XML generation, and `ReviewSummary`
(which reads `album.funding`) are untouched — the field just moves in the UI.

## Out of scope
- Lightning/V4V behavior, auto-provisioned wallets, skipping the Value step for Google
  users — separate decisions, not part of this move.
- Publisher-level funding (`PublisherFundingSection`) — unrelated; the wizard funding is
  album-level.

## Verification
- `npm run lint` (0 errors) and `npm run build` succeed.
- Walk the wizard: step 6 (Value) now shows V4V recipients + the "Support link" funding
  fields; step 7 (Credits & extras) shows only Credits/Persons (no funding).
- Enter a funding URL on step 6 → step 8 (Review) still lists it.
