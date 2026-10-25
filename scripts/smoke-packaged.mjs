#!/usr/bin/env node
/**
 * Starts a PACKAGED build and checks that it comes up: a window opens, the preload bridge is there (including the
 * backup export/import calls), and the sign-in screen renders. It runs against a throwaway data folder
 * (CADENCE_USER_DATA_DIR), so it never touches real data.
 *
 *   node scripts/smoke-packaged.mjs <path to Cadence.app/Contents/MacOS/Cadence | Cadence.exe>
 *
 * What it does not do: sign in, use the app, or check updates (an unpublished build has no app-update.yml).
 * See docs/RELEASING.md "Local package".
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const executablePath = process.argv[2];
if (!executablePath || !fs.existsSync(executablePath)) {
  console.error('Usage: node scripts/smoke-packaged.mjs <path to the packaged executable>');
  process.exit(1);
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-smoke-'));
const app = await electron.launch({ executablePath, env: { ...process.env, CADENCE_USER_DATA_DIR: userData }, timeout: 60000 });
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failed = true;
};
try {
  const stderr = [];
  app.process().stderr?.on('data', (d) => stderr.push(String(d)));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => ({
    title: document.title,
    save: typeof window.cadence?.saveData,
    archive: [window.cadence?.backupArchiveExport, window.cadence?.backupArchiveOpen, window.cadence?.backupArchiveApply].map((f) => typeof f),
    body: document.body.innerText,
  }));
  check(info.title === 'Cadence', `window title is "${info.title}"`);
  check(info.save === 'function', 'preload bridge present');
  check(info.archive.every((t) => t === 'function'), 'backup export / import bridge present');
  check(/sign in/i.test(info.body), 'sign-in screen rendered');
  const dir = await app.evaluate(({ app: a }) => a.getPath('userData'));
  check(dir === userData, 'used the throwaway data folder');
  check(!/Cannot find module/.test(stderr.join('')), 'no missing module reported');
  console.log(`  version ${await app.evaluate(({ app: a }) => a.getVersion())}`);
} catch (err) {
  console.error('✗', err instanceof Error ? err.message : err);
  failed = true;
} finally {
  await app.close().catch(() => undefined);
  fs.rmSync(userData, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
