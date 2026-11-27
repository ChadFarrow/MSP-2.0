import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isWordPress, wpConfig } from './utils/runtimeTarget'
import { installApiShim } from './wordpress/apiShim'

// The WordPress plugin build has no same-origin /api; route those calls before
// anything renders. A no-op in every other build (see runtimeTarget.ts).
if (isWordPress()) {
  const cfg = wpConfig()
  if (cfg) installApiShim(cfg)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
