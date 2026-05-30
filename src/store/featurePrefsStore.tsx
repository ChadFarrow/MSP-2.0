import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { featurePrefsStorage } from '../utils/storage';

// Advanced features a first-time user can choose to hide via the onboarding
// questionnaire (and re-toggle later from the ☰ menu).
//
// To add another hideable feature: (1) add its id to FeatureId, (2) append a
// descriptor here, (3) wrap that feature's UI in `{isEnabled('<id>') && …}` at
// its render site. No other changes to the store or questionnaire are needed.
export type FeatureId = 'lightning';

export interface FeatureDef {
  id: FeatureId;
  icon: string;
  question: string;
  detail: string;
}

export const FEATURE_DEFS: FeatureDef[] = [
  {
    id: 'lightning',
    icon: '⚡',
    question: 'Will you set up Lightning payments?',
    detail: 'Value-4-Value splits pay you and your collaborators in Bitcoin automatically.',
  },
];

type FeaturePrefs = Partial<Record<FeatureId, boolean>>;

interface FeaturePrefsContextType {
  prefs: FeaturePrefs;
  /** A feature is visible unless the user has explicitly turned it off. */
  isEnabled: (id: FeatureId) => boolean;
  setFeature: (id: FeatureId, enabled: boolean) => void;
}

const FeaturePrefsContext = createContext<FeaturePrefsContextType | undefined>(undefined);

export function FeaturePrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<FeaturePrefs>(() => featurePrefsStorage.load() as FeaturePrefs);

  const setFeature = useCallback((id: FeatureId, enabled: boolean) => {
    setPrefs(prev => {
      const next = { ...prev, [id]: enabled };
      featurePrefsStorage.save(next);
      return next;
    });
  }, []);

  const isEnabled = useCallback((id: FeatureId) => prefs[id] !== false, [prefs]);

  return (
    <FeaturePrefsContext.Provider value={{ prefs, isEnabled, setFeature }}>
      {children}
    </FeaturePrefsContext.Provider>
  );
}

export function useFeaturePrefs() {
  const context = useContext(FeaturePrefsContext);
  if (!context) {
    throw new Error('useFeaturePrefs must be used within FeaturePrefsProvider');
  }
  return context;
}
