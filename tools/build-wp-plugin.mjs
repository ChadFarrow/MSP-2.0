#!/usr/bin/env node
/**
 * Package the WordPress plugin: `npm run build:wp` runs this after
 * `vite build --mode wordpress` has written the editor bundle to
 * wordpress/msp-studio/build/.
 *
 * Copies the plugin into wordpress/dist/msp-studio/, stamps the version into
 * the plugin header and readme there (the checked-in files keep 0.0.0, so a
 * build never dirties the tree), and zips it to
 * wordpress/dist/msp-studio-<version>.zip — the file a site owner uploads under
 * Plugins → Add New → Upload Plugin.
 *
 * The version is the website's: 0.1.<commit count − 255>, as in vite.config.ts.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginSrc = join(root, 'wordpress', 'msp-studio');
const distDir = join(root, 'wordpress', 'dist');
const staged = join(distDir, 'msp-studio');

function version() {
  try {
    const count = parseInt(execSync('git rev-list --count HEAD', { cwd: root }).toString().trim(), 10);
    // A shallow clone has too few commits for the offset; use package.json then.
    if (!(count > 255)) throw new Error('shallow');
    return `0.1.${String(count - 255).padStart(2, '0')}`;
  } catch {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  }
}

if (!existsSync(join(pluginSrc, 'build', 'index.html'))) {
  console.error('wordpress/msp-studio/build/index.html is missing. Run `vite build --mode wordpress` first (npm run build:wp does both).');
  process.exit(1);
}

const v = version();
rmSync(staged, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(pluginSrc, staged, { recursive: true });
// public/ ships a 1.8 MB logo for the website's og:image, which only social
// crawlers fetch. Nothing in the plugin uses it.
rmSync(join(staged, 'build', 'msp-logo.png'), { force: true });

function stamp(file, pattern, replacement) {
  const path = join(staged, file);
  const before = readFileSync(path, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`No version line found in ${file}`);
  writeFileSync(path, after);
}
stamp('msp-studio.php', /^( \* Version:\s+).*$/m, `$1${v}`);
stamp('readme.txt', /^(Stable tag:\s+).*$/m, `$1${v}`);

const zipName = `msp-studio-${v}.zip`;
rmSync(join(distDir, zipName), { force: true });
try {
  execSync(`zip -qr ${JSON.stringify(zipName)} msp-studio -x '*.DS_Store'`, { cwd: distDir, stdio: 'inherit' });
} catch {
  console.error('Packaging needs the `zip` command. The unzipped plugin is in wordpress/dist/msp-studio/.');
  process.exit(1);
}
console.log(`WordPress plugin ${v}: wordpress/dist/${zipName}`);
