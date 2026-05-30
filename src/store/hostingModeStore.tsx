import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type HostingMode = 'upload' | 'selfhost';

interface HostingModeContextType {
  hostingMode: HostingMode;
  setHostingMode: (mode: HostingMode) => void;
}

const HostingModeContext = createContext<HostingModeContextType | undefined>(undefined);

const STORAGE_KEY = 'msp-hosting-mode';

export function HostingModeProvider({ children }: { children: ReactNode }) {
  const [hostingMode, setHostingModeState] = useState<HostingMode>(() =>
    (localStorage.getItem(STORAGE_KEY) as HostingMode) || 'selfhost'
  );

  const setHostingMode = (mode: HostingMode) => {
    setHostingModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  return (
    <HostingModeContext.Provider value={{ hostingMode, setHostingMode }}>
      {children}
    </HostingModeContext.Provider>
  );
}

export function useHostingMode() {
  const context = useContext(HostingModeContext);
  if (!context) throw new Error('useHostingMode must be used within HostingModeProvider');
  return context;
}
