// src/components/Onboarding/CopyableUrlRow.tsx
//
// A labeled, read-only URL field with a Copy button and optional help text.
// Used on the wizard's post-publish screen for the album feed + publisher catalog
// URLs (previously two duplicated inline blocks).

import type { ReactNode } from 'react';

interface CopyableUrlRowProps {
  label: string;
  value: string;
  helpText?: ReactNode;
}

export function CopyableUrlRow({ label, value, helpText }: CopyableUrlRowProps) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <div className="onboarding-url-row">
        <input className="form-input" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button className="btn btn-secondary btn-small" onClick={() => navigator.clipboard.writeText(value)}>
          Copy
        </button>
      </div>
      {helpText && <p className="onboarding-help-text">{helpText}</p>}
    </div>
  );
}
