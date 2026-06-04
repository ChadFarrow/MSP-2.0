import { ModalWrapper } from './ModalWrapper';
import { FeatureQuestionnaire } from '../FeatureQuestionnaire';

interface FeaturePreferencesModalProps {
  onClose: () => void;
}

export function FeaturePreferencesModal({ onClose }: FeaturePreferencesModalProps) {
  return (
    <ModalWrapper
      isOpen={true}
      onClose={onClose}
      title="Feature Preferences"
      className="feature-preferences-modal"
      footer={
        <div style={{ display: 'flex', width: '100%' }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <FeatureQuestionnaire intro="Turn features on or off to control what shows up in the editor. Changes apply right away." />
    </ModalWrapper>
  );
}
