// src/components/Onboarding/steps/AlbumStep.tsx
import type { OnboardingDraft } from '../useOnboardingDraft';
import { useNostr } from '../../../store/nostrStore';
import { AlbumInfoSection } from '../../Editor/AlbumEditor/AlbumInfoSection';
import { AlbumArtworkSection } from '../../Editor/AlbumEditor/AlbumArtworkSection';

export function AlbumStep({ w }: { w: OnboardingDraft }) {
  const { state, dispatch } = w;
  const { state: nostrState } = useNostr();

  return (
    <>
      <AlbumInfoSection
        album={state.album}
        dispatch={dispatch}
        isArtistMode
        isLoggedIn={nostrState.isLoggedIn}
        userNpub={nostrState.user?.npub}
      />
      <AlbumArtworkSection album={state.album} dispatch={dispatch} toggleSource />
    </>
  );
}
