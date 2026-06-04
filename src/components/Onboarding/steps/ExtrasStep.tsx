// src/components/Onboarding/steps/ExtrasStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';
import { createEmptyPersonRole } from '../../../types/feed';
import { Section } from '../../Section';
import { FundingFields } from '../../FundingFields';
import { PersonsSection } from '../../Editor/AlbumEditor/PersonsSection';

export function ExtrasStep({ w }: { w: OnboardingDraft }) {
  const { state, dispatch } = w;

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
      />

      <div style={{ marginTop: 16 }}>
        <FundingFields
          funding={state.album.funding}
          onUpdate={(funding) => dispatch({ type: 'UPDATE_ALBUM', payload: { funding } })}
        />
      </div>
    </Section>
  );
}
