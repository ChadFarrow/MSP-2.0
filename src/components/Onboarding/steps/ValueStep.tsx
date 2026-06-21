// src/components/Onboarding/steps/ValueStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';
import { Section } from '../../Section';
import { RecipientsList } from '../../RecipientsList';
import { FundingFields } from '../../FundingFields';

export function ValueStep({ w }: { w: OnboardingDraft }) {
  const { state, dispatch } = w;

  return (
    <Section title="Value / V4V" icon="⚡" defaultOpen>
      {w.suggestedLightningAddress && !w.lightningPromptHandled && (
        <div className="ln-suggestion">
          <p>Found a lightning address on your Nostr profile:
            <strong> {w.suggestedLightningAddress}</strong></p>
          <p>Use it to receive V4V payments for this release?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-small" onClick={() => w.confirmLightningAddress()}>
              Use this address
            </button>
            <button className="btn btn-secondary btn-small" onClick={w.dismissLightningAddress}>
              I&apos;ll enter a different one
            </button>
          </div>
        </div>
      )}
      {w.suggestedLightningAddress && w.lightningPromptHandled && (
        <button className="btn btn-secondary btn-small" style={{ marginBottom: 12 }} onClick={() => w.confirmLightningAddress()}>
          Use my Nostr lightning address ({w.suggestedLightningAddress})
        </button>
      )}
      {state.album.value.recipients[0]?.address && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85em', margin: '0 0 8px' }}>
          Your share is calculated automatically — you get whatever's left after the other recipients ({state.album.value.recipients[0].split}% right now).
        </p>
      )}
      <RecipientsList
        recipients={state.album.value.recipients}
        onUpdate={(idx, recipient) => dispatch({ type: 'UPDATE_RECIPIENT', payload: { index: idx, recipient } })}
        onRemove={(idx) => dispatch({ type: 'REMOVE_RECIPIENT', payload: idx })}
        onAdd={(recipient) => dispatch({ type: 'ADD_RECIPIENT', payload: recipient })}
      />

      <h4 style={{ marginTop: 24, marginBottom: 4, color: 'var(--text-secondary)' }}>Support link</h4>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85em', margin: '0 0 8px' }}>
        A page where fans can support you (Patreon, a tip jar, your site) — works without Lightning.
      </p>
      <FundingFields
        funding={state.album.funding}
        onUpdate={(funding) => dispatch({ type: 'UPDATE_ALBUM', payload: { funding } })}
      />
    </Section>
  );
}
