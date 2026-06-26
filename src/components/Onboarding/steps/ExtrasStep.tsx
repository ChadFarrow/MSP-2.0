// src/components/Onboarding/steps/ExtrasStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';
import { useNostr } from '../../../store/nostrStore';
import { createEmptyPersonRole } from '../../../types/feed';
import { Section } from '../../Section';
import { PersonsSection } from '../../Editor/AlbumEditor/PersonsSection';

export function ExtrasStep({ w }: { w: OnboardingDraft }) {
  const { state, dispatch } = w;
  const { state: nostrState } = useNostr();
  // Managed (Google) users have no Nostr context — hide the per-person npub field.
  const isManaged = nostrState.connectionMethod === 'managed';

  return (
    <Section title="Credits & extras" icon="✨" defaultOpen>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em', marginTop: 0 }}>
        All optional. Publisher link: confirmed ✓
      </p>

      <label className="form-label">Credits / Persons</label>
      <PersonsSection
        persons={state.album.persons}
        onUpdatePerson={(index, person) => dispatch({ type: 'UPDATE_PERSON', payload: { index, person } })}
        onAddPerson={() => dispatch({ type: 'ADD_PERSON' })}
        onRemovePerson={(index) => dispatch({ type: 'REMOVE_PERSON', payload: index })}
        onUpdateRole={(personIndex, roleIndex, role) => dispatch({ type: 'UPDATE_PERSON_ROLE', payload: { personIndex, roleIndex, role } })}
        onAddRole={(personIndex) => dispatch({ type: 'ADD_PERSON_ROLE', payload: { personIndex, role: createEmptyPersonRole() } })}
        onRemoveRole={(personIndex, roleIndex) => dispatch({ type: 'REMOVE_PERSON_ROLE', payload: { personIndex, roleIndex } })}
        showThumbnailPreview
        showRolesModalButton
        hideNpub={isManaged}
        myNpub={isManaged ? undefined : nostrState.user?.npub}
      />
    </Section>
  );
}
