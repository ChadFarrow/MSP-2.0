import { execSync } from 'child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Offset so that current commit count (258) maps to patch version 3 → "0.1.03"
const VERSION_OFFSET = 255

function getAutoVersion(): string {
  try {
    // On Vercel, the repo is shallow-cloned without a remote. Unshallow via GitHub URL.
    const isShallow = execSync('git rev-parse --is-shallow-repository').toString().trim()
    if (isShallow === 'true') {
      const owner = process.env.VERCEL_GIT_REPO_OWNER
      const slug = process.env.VERCEL_GIT_REPO_SLUG
      if (owner && slug) {
        execSync(`git fetch --unshallow https://github.com/${owner}/${slug}.git`, { stdio: 'ignore' })
      }
    }
    const count = parseInt(execSync('git rev-list --count HEAD').toString().trim(), 10)
    const patch = (count - VERSION_OFFSET).toString().padStart(2, '0')
    return `0.1.${patch}`
  } catch {
    return pkg.version
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // `npm run build:wp` builds the WordPress plugin from this same source. Its
  // bundle is served from the plugin's folder, under a <base> the plugin sets,
  // so asset URLs must be relative; see wordpress/msp-studio/ and
  // src/utils/runtimeTarget.ts.
  ...(mode === 'wordpress' ? {
    base: './',
    build: { outDir: 'wordpress/msp-studio/build', emptyOutDir: true },
  } : {}),
  define: {
    __APP_VERSION__: JSON.stringify(getAutoVersion()),
  },
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API calls to production server during development
      '/api': {
        target: 'https://musicsideproject.com',
        changeOrigin: true,
        secure: true
      }
    }
  }
}))
