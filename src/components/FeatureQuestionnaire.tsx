import { FEATURE_DEFS, useFeaturePrefs } from '../store/featurePrefsStore';

interface FeatureQuestionnaireProps {
  /** Optional intro line shown above the questions. */
  intro?: string;
}

/**
 * Per-feature yes/no list that lets a user hide advanced features.
 * Live-saves on every toggle via the feature-prefs store, so no submit step
 * is needed. Reused by the onboarding tour's final step and the
 * "Feature Preferences" menu modal.
 */
export function FeatureQuestionnaire({ intro }: FeatureQuestionnaireProps) {
  const { isEnabled, setFeature } = useFeaturePrefs();

  return (
    <div className="feature-questionnaire">
      {intro && <p className="onboarding-text">{intro}</p>}
      {FEATURE_DEFS.map(feature => {
        const enabled = isEnabled(feature.id);
        return (
          <div key={feature.id} className="feature-questionnaire-row">
            <div className="feature-questionnaire-info">
              <span className="feature-questionnaire-icon" aria-hidden="true">{feature.icon}</span>
              <div>
                <div className="feature-questionnaire-question">{feature.question}</div>
                <div className="feature-questionnaire-detail">{feature.detail}</div>
              </div>
            </div>
            <div className="feature-questionnaire-toggle" role="group" aria-label={feature.question}>
              <button
                type="button"
                className={`feature-toggle-btn ${enabled ? 'active' : ''}`}
                aria-pressed={enabled}
                onClick={() => setFeature(feature.id, true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`feature-toggle-btn ${!enabled ? 'active' : ''}`}
                aria-pressed={!enabled}
                onClick={() => setFeature(feature.id, false)}
              >
                Not now
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
