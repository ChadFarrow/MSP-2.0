import type { ReactNode } from 'react';

interface EditorChromeProps {
  chromeless?: boolean;
  children: ReactNode;
}

export function EditorChrome({ chromeless = false, children }: EditorChromeProps) {
  if (chromeless) return <>{children}</>;
  return (
    <div className="main-content">
      <div className="editor-panel">
        {children}
      </div>
    </div>
  );
}
