import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { loadMain } = require('./testing/mainHarness.cjs') as {
  loadMain: (p: string) => { setPathCalls: Array<[string, string]>; dispose: () => void };
};
const MAIN = path.resolve(__dirname, 'main.cjs');

const saved = process.env.CADENCE_USER_DATA_DIR;
afterEach(() => {
  if (saved === undefined) delete process.env.CADENCE_USER_DATA_DIR;
  else process.env.CADENCE_USER_DATA_DIR = saved;
});

/** The data folder is Cadence's alone unless a test or a smoke run names another one on purpose. */
describe('where the app keeps its data', () => {
  it('is the Cadence folder in the application-data directory by default', () => {
    delete process.env.CADENCE_USER_DATA_DIR;
    const h = loadMain(MAIN);
    const userData = h.setPathCalls.find(([n]) => n === 'userData');
    expect(userData?.[1].endsWith(`${path.sep}Cadence`) || userData?.[1].endsWith(`${path.sep}Cadence (Dev)`)).toBe(true);
    h.dispose();
  });

  it('is the folder named by CADENCE_USER_DATA_DIR, so a packaged-app smoke run never touches real data', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-override-'));
    process.env.CADENCE_USER_DATA_DIR = dir;
    const h = loadMain(MAIN);
    expect(h.setPathCalls.find(([n]) => n === 'userData')?.[1]).toBe(dir);
    h.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('ignores a relative path instead of writing next to wherever the app was started', () => {
    process.env.CADENCE_USER_DATA_DIR = 'relative/path';
    const h = loadMain(MAIN);
    const chosen = h.setPathCalls.find(([n]) => n === 'userData')?.[1] ?? '';
    expect(path.isAbsolute(chosen)).toBe(true);
    expect(chosen).not.toContain('relative');
    h.dispose();
  });
});
