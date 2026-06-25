# Onboarding Landing Flow (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route new visitors by intent — a "Where will your feed live?" choice (self-host → straight to editor, no account; MSP-host → wizard) — keep the "used MSP before?" gate, soften the returning branch to offer (not force) sign-in, and make the wizard's skip-to-editor exit explicit.

**Architecture:** Pure UI-wiring changes over existing pieces. The gate (`OnboardingPage`) gains a second in-gate screen (the hosting choice) and two new callbacks; `App.tsx` wires those callbacks to existing flows (editor vs wizard); the wizard (`OnboardingWizard`) gains a labeled skip button that reuses its existing `handleDismiss`. No new components, no routing library, no data-model changes.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest. Context stores (`feedStore`, `nostrStore`). No React Router.

## Global Constraints

- **Typecheck with `npm run build` or `npx tsc -b`, never `tsc --noEmit`** — the root tsconfig is references-only and `tsc --noEmit` checks zero files (false green).
- **Lint with `npm run lint`** — must stay at 0 errors. Two pre-existing warnings (`ArtistPublishSection.tsx:214`, `admin/FeedList.tsx:40`) are expected and unrelated; introduce no new ones.
- **No component-test harness exists** (no React Testing Library / jsdom). The established pattern for UI changes is pure-function Vitest tests where a pure unit exists + `npm run build`/`npm run lint` + a manual `npm run dev` walkthrough. These three tasks are UI wiring with no extractable pure unit, so each task's "test cycle" is: build → lint → scripted manual verification. Do NOT add RTL/jsdom — that's a separate, out-of-scope change.
- **Manual gate re-trigger:** load `http://localhost:5173/?onboarding=1` once to force the gate on every load (persists via the `msp:force-onboarding` localStorage flag); load `?onboarding=0` to disarm. This is the documented way to re-test onboarding without clearing localStorage.
- **TypeScript strict mode** with `noUnusedLocals`/`noUnusedParameters` — remove props/vars you stop using (the build fails otherwise).
- **Branch:** `onboarding-landing-flow` (already checked out, cut from `new-onboarding-v2`).
- **Out of scope (do not implement here):** the Phase 2 hostname default (`new.` → wizard / apex → editor), and the funding-vs-Lightning presentation. Both are deferred per the spec.

---

## File Structure

- `src/components/OnboardingPage.tsx` — the gate. Add the in-gate "Where will your feed live?" screen + `onChooseSelfHost`/`onChooseMspHost` props; remove `onChooseFirstTime`.
- `src/App.tsx` — `AppContent`: wire the two new gate callbacks (self-host → editor; MSP-host → wizard) and soften `onChooseReturning` to not auto-open the sign-in modal.
- `src/components/Onboarding/OnboardingWizard.tsx` — add an explicit "Skip — I'll host it myself" footer button reusing `handleDismiss`.

Reused CSS (no new styles needed): `.onboarding-gate-actions`, `.onboarding-gate-btn`, `.onboarding-step`, `.onboarding-heading`, `.onboarding-text`, `.onboarding-welcome-icon`, `.step-nav`, `.btn`, `.btn-primary`, `.btn-secondary`.

---

## Task 1: Gate "I'm new" → "Where will your feed live?" choice

**Files:**
- Modify: `src/components/OnboardingPage.tsx` (props interface ~lines 5-11; signature ~line 19; gate render ~lines 67-98)
- Modify: `src/App.tsx` (the `OnboardingPage` render block, ~lines 299-326)

**Interfaces:**
- Produces (OnboardingPage props): `onChooseSelfHost?: () => void`, `onChooseMspHost?: () => void`. Removes `onChooseFirstTime?: () => void`.
- Consumes: existing `onboardingStorage.markComplete()`, `setShowOnboarding`, `handleSwitchFeedType('artist')`, `wizardStorage.markInProgress()`, `setShowArtistWizard`, and `dispatch` (all already in `AppContent`).

- [ ] **Step 1: Swap the props on `OnboardingPage`**

In `src/components/OnboardingPage.tsx`, replace the `onChooseFirstTime` prop with the two hosting callbacks. Change the interface (around lines 8-11):

```tsx
  onClose: () => void;
  startAtGate?: boolean;
  /** Fired when a returning user picks "Yes, I've used this before" on the gate. */
  onChooseReturning?: () => void;
  /** Fired from the "Where will your feed live?" screen — self-host goes straight
      to the editor (no account, no wizard); MSP-host launches the guided wizard. */
  onChooseSelfHost?: () => void;
  onChooseMspHost?: () => void;
}
```

And the function signature (line 19):

```tsx
export function OnboardingPage({ onClose, startAtGate = false, onChooseReturning, onChooseSelfHost, onChooseMspHost }: OnboardingPageProps) {
```

- [ ] **Step 2: Add the in-gate hosting-choice state**

In `src/components/OnboardingPage.tsx`, just after the existing `const [step, setStep] = useState(...)` (line 17), add:

```tsx
  // Within the gate (step 0): 'ask' = the "used before?" question; 'hosting' =
  // the "where will your feed live?" follow-up shown after picking "I'm new".
  const [gateView, setGateView] = useState<'ask' | 'hosting'>('ask');
```

- [ ] **Step 3: Rewrite the gate render to two screens**

Replace the entire `{step === 0 && ( … )}` block (lines 67-98) with:

```tsx
        {step === 0 && gateView === 'ask' && (
          <div className="onboarding-step onboarding-gate">
            <div className="onboarding-welcome-icon">👋</div>
            <h2 className="onboarding-heading">Have you used MSP 2.0 before?</h2>
            <p className="onboarding-text">
              If you're returning, jump straight into the app.
              <br />
              First time here? We'll point you the right way.
            </p>
            <div className="onboarding-gate-actions">
              <button
                type="button"
                className="btn btn-primary onboarding-gate-btn"
                onClick={() => (onChooseReturning ?? onClose)()}
              >
                Yes, I've used this before →
              </button>
              <button
                type="button"
                className="btn btn-secondary onboarding-gate-btn"
                onClick={() => setGateView('hosting')}
              >
                No, I'm new
              </button>
            </div>
            <img
              src={mspLogo}
              alt="MSP 2.0"
              className="onboarding-gate-logo"
              style={{ width: 200, height: 200, borderRadius: 24, marginTop: 32 }}
            />
          </div>
        )}

        {step === 0 && gateView === 'hosting' && (
          <div className="onboarding-step onboarding-gate">
            <div className="onboarding-welcome-icon">🎵</div>
            <h2 className="onboarding-heading">Where will your feed live?</h2>
            <p className="onboarding-text">
              Let MSP host your feed for you, or make the feed and host it on your
              own website. You can change your mind anytime.
            </p>
            <div className="onboarding-gate-actions">
              <button
                type="button"
                className="btn btn-primary onboarding-gate-btn"
                onClick={() => onChooseMspHost?.()}
              >
                Let MSP host it for me →
              </button>
              <button
                type="button"
                className="btn btn-secondary onboarding-gate-btn"
                onClick={() => onChooseSelfHost?.()}
              >
                I'll host it myself
              </button>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 24 }}
              onClick={() => setGateView('ask')}
            >
              ← Back
            </button>
          </div>
        )}
```

- [ ] **Step 4: Wire the callbacks in `App.tsx`**

In `src/App.tsx`, replace the `onChooseFirstTime={() => { … }}` prop on `<OnboardingPage>` (lines 316-324) with the two new handlers:

```tsx
        onChooseSelfHost={() => {
          // Self-host: no account, no wizard — straight to the editor. They make the
          // feed, download the XML, and host it themselves. Nostr/Lightning stay
          // optional. Force album mode so a brand-new user lands on the album editor.
          onboardingStorage.markComplete();
          setShowOnboarding(false);
          dispatch({ type: 'SET_FEED_TYPE', payload: 'album' });
        }}
        onChooseMspHost={() => {
          // MSP-host: the guided wizard (account via Google/Nostr), ends with a
          // hosted feed. Mark the gate complete, enter Artist mode, open the wizard.
          onboardingStorage.markComplete();
          setShowOnboarding(false);
          handleSwitchFeedType('artist');
          wizardStorage.markInProgress();
          setShowArtistWizard(true);
        }}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: clean (no output, exit 0). If it reports `onChooseFirstTime` unused or missing, confirm you removed it from both the interface and the `App.tsx` usage.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: `0 errors` (the 2 known warnings only).

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open `http://localhost:5173/?onboarding=1`.
- Gate shows "Have you used MSP 2.0 before?" → click **No, I'm new** → screen changes to "Where will your feed live?".
- Click **← Back** → returns to the "used before?" question.
- **No, I'm new → I'll host it myself** → gate closes, lands in the **Editor** (Album mode), no sign-in/Nostr/Bitcoin prompt.
- Reload `?onboarding=1`, **No, I'm new → Let MSP host it for me** → the **Wizard** opens.

- [ ] **Step 8: Commit**

```bash
git add src/components/OnboardingPage.tsx src/App.tsx
git commit -m "Add self-host vs MSP-host choice to onboarding gate

The gate's 'I'm new' branch now asks where the feed will live: self-host
goes straight to the editor (no account, no wizard); MSP-host opens the
guided wizard. Replaces onChooseFirstTime with onChooseSelfHost/onChooseMspHost.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: "Yes, I've used this before" offers sign-in instead of forcing it

**Files:**
- Modify: `src/App.tsx` (the `onChooseReturning` handler, ~lines 304-315)

**Interfaces:**
- Consumes: `onboardingStorage.markComplete()`, `setShowOnboarding` (both already present).
- Behavior change: a logged-out returning user lands in the **Editor** (no auto-opened sign-in modal). Sign-in stays available via the header/hamburger; if they sign in and own ≥1 hosted feed, the existing auto-route effect moves them to the Profile.

**Rationale:** a self-host returner must not hit a sign-in wall. The header Sign In is the standing "offer"; the modal is no longer forced open.

- [ ] **Step 1: Simplify the returning handler**

In `src/App.tsx`, replace the `onChooseReturning={() => { … }}` body (lines 304-315) with:

```tsx
        onChooseReturning={() => {
          // Returning artist: close the gate and land in the editor. Sign-in is
          // OFFERED via the header (not forced) so a self-host returner isn't walled.
          // If a session restores (or they sign in) and owns >=1 hosted feed, the
          // auto-route effect moves them to their Profile.
          onboardingStorage.markComplete();
          setShowOnboarding(false);
        }}
```

(This removes the `setNostrConnectReturning(true)` + `setShowNostrConnectModal(true)` calls from this path. Leave the `nostrConnectReturning` state, the hamburger Sign In's `setNostrConnectReturning(false)`, and the `NostrConnectModal returning={...}` prop in place — they remain valid for the header/hamburger sign-in path and a future inline returning-offer. They are not dead: the hamburger path still sets and reads the flag.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean. If it flags `nostrConnectReturning` or `setNostrConnectReturning` as unused, confirm the hamburger Sign In button still calls `setNostrConnectReturning(false)` and the modal render still passes `returning={nostrConnectReturning}` — both should remain from prior work.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: `0 errors` (2 known warnings only).

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `http://localhost:5173/?onboarding=1` **while logged out**.
- Gate → **Yes, I've used this before** → lands directly in the **Editor**; **no sign-in modal pops up**.
- Confirm a Sign In affordance is still reachable from the header/hamburger.
- (Owner check) Sign in via the hamburger as an identity that owns ≥1 hosted feed → you are auto-routed to the **Profile** (the existing effect).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "Offer (not force) sign-in on the returning-artist gate branch

'Yes, I've used this before' now lands in the editor instead of auto-
opening the sign-in modal, so a self-host returner isn't walled. The
header Sign In remains the offer; the auto-route effect still moves a
signed-in owner to their Profile.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Make the wizard's skip-to-editor exit explicit

**Files:**
- Modify: `src/components/Onboarding/OnboardingWizard.tsx` (footer JSX ~lines 237-275; stale comment ~lines 248-249)

**Interfaces:**
- Consumes: the existing `handleDismiss` (line 75) — `wizardStorage.markComplete(); onComplete();` — which closes the wizard and lands in the editor, preserving whatever the user entered (the wizard writes to the same `feedStore` as the editor).
- Produces: a visible "Skip — I'll host it myself" footer button. No new props.

**Rationale:** the wizard already exits to the editor via the top-right ✕, but it reads as "close", not "skip to editor / I'll host it myself". This adds an explicit, labeled affordance.

- [ ] **Step 1: Add the explicit skip button to the footer**

In `src/components/Onboarding/OnboardingWizard.tsx`, change the start of the `footer` JSX (lines 238-244) from:

```tsx
    <div className="step-nav" style={{ width: '100%' }}>
      {/* Left: Back */}
      {canGoBack && (
        <button className="btn btn-secondary" onClick={w.back} disabled={step === 'review' && w.publishing}>
          Back
        </button>
      )}
```

to:

```tsx
    <div className="step-nav" style={{ width: '100%' }}>
      {/* Left: explicit skip-to-editor exit, then Back. Skipping keeps whatever the
          user has entered (the wizard writes to the same feedStore as the editor). */}
      <button
        className="btn btn-secondary"
        onClick={handleDismiss}
        disabled={step === 'review' && w.publishing}
        title="Leave the guided setup and finish in the editor — I'll host the feed myself"
      >
        Skip — I'll host it myself
      </button>
      {canGoBack && (
        <button className="btn btn-secondary" onClick={w.back} disabled={step === 'review' && w.publishing}>
          Back
        </button>
      )}
```

- [ ] **Step 2: Fix the now-stale footer comment**

In the same file, update the comment at lines ~248-249. Change:

```tsx
      {/* Right: primary action (Next / Publish / Open). The top-right X handles
          skip-to-editor, so there's no separate Skip button. */}
```

to:

```tsx
      {/* Right: primary action (Next / Publish / Open). Skip-to-editor lives on the
          left (and the top-right X does the same). */}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: `0 errors` (2 known warnings only).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `http://localhost:5173/?onboarding=1` → **No, I'm new → Let MSP host it for me** to open the wizard.
- Advance a step or two and type something into a field (e.g. the album title on the Album step).
- Click **Skip — I'll host it myself** → the wizard closes and you land in the **Editor**, with what you typed still present.
- Re-open the wizard and confirm the top-right ✕ still also exits to the editor.

- [ ] **Step 6: Commit**

```bash
git add src/components/Onboarding/OnboardingWizard.tsx
git commit -m "Add explicit 'Skip — I'll host it myself' exit to the wizard

The wizard already exits to the editor via the top-right X; this adds a
labeled footer button so an MSP-host newcomer who decides to self-host
isn't stuck. Reuses handleDismiss; entered fields are preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all three tasks)

- [ ] `npm run build` → clean (tsc + vite).
- [ ] `npm run lint` → 0 errors (2 known warnings).
- [ ] `npx vitest run` → all pass (no tests changed, but confirm nothing regressed).
- [ ] Full manual walk of the four flows from the spec's verification section:
  - New + self-host → editor, no account prompts.
  - New + MSP-host → wizard, with working skip-to-editor.
  - Returning, logged out → editor, sign-in offered not forced.
  - Returning, logged in + owns feeds → Profile.

## Notes / deferred

- **Phase 2 (hostname default):** when ready, add a `window.location.hostname` check feeding the landing decision (`new.` → wizard default, apex → editor default). Not in this plan.
- **Funding-vs-Lightning presentation:** separate follow-up spec (memory `project_nostr-bitcoin-optional`).
- The `OnboardingPage` tour steps (`step` 1-3 + questionnaire) are unreachable from the gate now (the "I'm new" button goes to the hosting choice, not the tour). They were already effectively unreachable after the "Getting Started" menu item was removed. Left in place intentionally — removing them is out of scope and unrelated.
