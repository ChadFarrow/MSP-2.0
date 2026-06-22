// src/components/Onboarding/steps/TracksStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';
import { TrackList } from '../../Editor/AlbumEditor/TrackList';

// Per-track value/persons overrides are hidden during onboarding; the wizard
// never gates on the lightning feature flag, so a constant false suffices.
const wizardIsEnabled = () => false;

export function TracksStep({ w }: { w: OnboardingDraft }) {
  return (
    <TrackList
      album={w.state.album}
      dispatch={w.dispatch}
      isEnabled={wizardIsEnabled}
      showOverrides={false}
    />
  );
}
