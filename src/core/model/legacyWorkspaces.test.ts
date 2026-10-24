/**
 * Upgrade safety: every workspace file that a past version could write must load
 * in this version with all notes and lists intact, and survive a save → load.
 *
 * `__fixtures__/legacy/*.json` were produced by running the REAL `normalizeData`
 * and serializer of each historical commit (notes introduced, lists introduced,
 * before/after unknown-key preservation, nested lists, …) over the same rich
 * workspace, so each file is exactly what that version could have put on disk.
 * Do not regenerate them from current code; add a new file when the on-disk
 * shape changes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compactAppDataForPersist, normalizeData, type AppData } from './index';

const require = createRequire(import.meta.url);
const { splitWorkspaceForMonthlyShards, mergeBaseWithShards } = require('../../../electron/persistence/monthlyShards.cjs');

const DIR = join(__dirname, '__fixtures__', 'legacy');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

type Rec = Record<string, unknown>;
const load = (file: string): Rec => JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Rec;
const byId = <T extends { id: string }>(xs: readonly T[]) => new Map(xs.map((x) => [x.id, x]));

/** Fields the file actually carries must come back with the same value. */
function expectCarried(fromFile: Rec, loaded: unknown, what: string) {
  const got = loaded as Rec | undefined;
  expect(got, `${what} is missing after load`).toBeDefined();
  for (const [key, value] of Object.entries(fromFile)) {
    if (value === undefined) continue;
    expect(got![key], `${what}.${key}`).toEqual(value);
  }
}

function expectSameContent(file: Rec, data: AppData, label: string) {
  const fileNotes = (file.notes ?? []) as Rec[];
  const fileGroups = (file.noteGroups ?? []) as Rec[];

  expect(data.notes.length, `${label}: note count`).toBe(fileNotes.length);
  const notes = byId(data.notes);
  for (const n of fileNotes) expectCarried(n, notes.get(n.id as string), `${label} note ${String(n.id)}`);

  expect(data.noteGroups.length, `${label}: list count`).toBe(fileGroups.length);
  const groups = byId(data.noteGroups);
  for (const g of fileGroups) expectCarried(g, groups.get(g.id as string), `${label} list ${String(g.id)}`);
}

describe('workspaces written by past versions', () => {
  it('has a fixture for every era', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const f of files) expect(((load(f).notes ?? []) as unknown[]).length, f).toBeGreaterThan(0);
  });

  describe.each(files)('%s', (file) => {
    it('loads with every note and list intact', () => {
      expectSameContent(load(file), normalizeData(load(file)), file);
    });

    it('survives a save and reload by this version', () => {
      const first = normalizeData(load(file));
      const onDisk = JSON.parse(JSON.stringify(compactAppDataForPersist(first)));
      expectSameContent(load(file), normalizeData(onDisk), `${file} (after save)`);
    });

    it('keeps every note through the monthly shard split and the live read merge', () => {
      const loaded = normalizeData(load(file));
      const onDisk = JSON.parse(JSON.stringify(compactAppDataForPersist(loaded)));
      const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(onDisk, { retainBaseBulk: true });
      const merged = mergeBaseWithShards(baseWorkspace, Object.values(shards));
      expectSameContent(load(file), normalizeData(merged), `${file} (after shard split)`);
    });

    it('keeps every note when only the base file survives next to stale shards', () => {
      const loaded = normalizeData(load(file));
      const onDisk = JSON.parse(JSON.stringify(compactAppDataForPersist(loaded)));
      const { baseWorkspace } = splitWorkspaceForMonthlyShards(onDisk, { retainBaseBulk: true });
      const merged = mergeBaseWithShards(baseWorkspace, []);
      expectSameContent(load(file), normalizeData(merged), `${file} (base only)`);
    });

    it('does not turn a locked note into an empty shell', () => {
      const locked = ((load(file).notes ?? []) as Rec[]).find((n) => n.id === 'n-locked');
      if (!locked) return;
      const note = normalizeData(load(file)).notes.find((n) => n.id === 'n-locked');
      expect(note?.locked).toBe(true);
      expect(note?.cipher).toEqual(locked.cipher);
    });
  });
});
