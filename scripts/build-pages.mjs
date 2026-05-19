#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Assemble the GitHub Pages deploy folder.
 *
 * Layout we publish:
 *
 *   dist/
 *   ├── index.html              ← marketing landing (from landing/)
 *   ├── landing.css
 *   ├── icon.svg, favicon-32.png, …   (shared brand assets)
 *   ├── screenshots/*.png       ← from docs/screenshots
 *   └── app/                    ← the PWA bundle (built by Vite separately)
 *       ├── index.html
 *       ├── 404.html
 *       ├── manifest.webmanifest
 *       ├── sw.js
 *       └── assets/…
 *
 * This script does NOT run Vite — call it AFTER `npm run build:pwa` so
 * `dist/app/` already exists. We only do the file shuffle for the landing,
 * the shared icons, the screenshots, and the SPA 404 fallback.
 *
 * Why a script (rather than shell)? Because the project supports Windows
 * + Linux contributors too and `cp -r` semantics differ across platforms.
 * Node's `fs.cp` is consistent everywhere.
 */
import { cp, mkdir, readdir, copyFile, access, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function copyTree(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Missing source: ${from}`);
  }
  await cp(from, to, { recursive: true });
}

async function safeCopyFile(from, to) {
  try {
    await access(from);
  } catch {
    return false;
  }
  await copyFile(from, to);
  return true;
}

/**
 * Wipe everything from `dist/` *except* `dist/app/`, which the PWA build
 * we just ran has populated. Past Electron / `vite build` invocations
 * leave their artifacts at `dist/` root, and those would pollute the
 * Pages upload (and override the landing's own index.html).
 */
async function cleanDistRoot() {
  if (!existsSync(dist)) return;
  for (const entry of await readdir(dist)) {
    if (entry === 'app') continue;
    await rm(join(dist, entry), { recursive: true, force: true });
  }
}

async function main() {
  if (!existsSync(join(dist, 'app'))) {
    console.error(
      '[cadence] dist/app/ not found. Run `npm run build:pwa` first ' +
        'so Vite emits the PWA bundle into that directory.',
    );
    process.exit(1);
  }
  await ensureDir(dist);
  await cleanDistRoot();

  // 1. Marketing landing → dist root.
  const landingSrc = join(root, 'landing');
  console.log(`✓ landing/  → dist/`);
  for (const entry of await readdir(landingSrc)) {
    await cp(join(landingSrc, entry), join(dist, entry), { recursive: true });
  }

  // 2. Shared brand assets so the landing can reference them at the root.
  //    (The PWA already has its own copies under dist/app/.)
  const shared = [
    'icon.svg',
    'favicon-32.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
  ];
  for (const f of shared) {
    if (await safeCopyFile(join(root, 'public', f), join(dist, f))) {
      console.log(`✓ public/${f}  → dist/${f}`);
    }
  }

  // 3. Screenshots used by the landing's feature showcase.
  const shotsSrc = join(root, 'docs', 'screenshots');
  if (existsSync(shotsSrc)) {
    await copyTree(shotsSrc, join(dist, 'screenshots'));
    console.log(`✓ docs/screenshots/  → dist/screenshots/`);
  } else {
    console.warn(
      '[cadence] docs/screenshots/ not found — the landing will render with broken <img> tags.',
    );
  }

  // 4. SPA 404 fallback inside the PWA subtree. GitHub Pages serves any
  //    unknown URL under /cadence/app/* with this file, letting React Router
  //    (HashRouter) handle deep-link refreshes.
  const appIndex = join(dist, 'app', 'index.html');
  const appNotFound = join(dist, 'app', '404.html');
  if (existsSync(appIndex)) {
    await copyFile(appIndex, appNotFound);
    console.log(`✓ app/index.html  → app/404.html`);
  }

  console.log('\nPages bundle assembled in dist/.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
