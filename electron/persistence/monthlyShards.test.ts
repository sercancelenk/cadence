import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  monthlyShardFilename,
  parseMonthlyShardFilename,
  listMonthlyShardMonths,
  monthKeyFromIso,
  splitWorkspaceForMonthlyShards,
  mergeMonthlyShardPartials,
  mergeBaseWithShards,
  wrapShardPayload,
  unwrapShardPayload,
  backupSnapshotKey,
  backupShardFilename,
  baseCoreForShardMerge,
  countShardableEntities,
  shardableEntityIdSet,
  shardRoundTripMatches,
  isMonthlyShardBackupFilename,
  resolveBackupSetBasePath,
  mergeWorkspaceFromBackupParts,
} = require('./monthlyShards.cjs');

const { unwrapStoredWorkspace } = require('./commitEnvelope.cjs');

const PREFIX = 'cadence';
const UID = '550e8400-e29b-41d4-a716-446655440000';

const sampleWorkspace = () => ({
  version: 3,
  teams: [{ id: 't1', name: 'Team', createdAt: '2026-01-01T00:00:00.000Z' }],
  people: [],
  todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
  notes: [
    { id: 'n1', title: 'Apr', createdAt: '2026-04-10T00:00:00.000Z', updatedAt: '2026-04-11T00:00:00.000Z' },
    { id: 'n2', title: 'May', createdAt: '2026-05-02T00:00:00.000Z', updatedAt: '2026-05-03T00:00:00.000Z' },
    { id: 'n3', title: 'No date', createdAt: '2026-04-01T00:00:00.000Z' },
  ],
  todoItems: [
    { id: 'td1', title: 'Task', createdAt: '2026-04-01T00:00:00.000Z', groupId: 'g1', sortOrder: 0 },
  ],
  items: [{ id: 'i1', title: '1:1', createdAt: '2026-03-15T00:00:00.000Z', teamId: 't1', kind: 'agenda' }],
});

describe('monthlyShards', () => {
  it('builds and parses shard filenames', () => {
    expect(monthlyShardFilename(PREFIX, UID, '2026-04')).toBe(
      `cadence-data-${UID}-2026-04.json`,
    );
    expect(parseMonthlyShardFilename(PREFIX, UID, monthlyShardFilename(PREFIX, UID, '2026-04'))).toBe(
      '2026-04',
    );
    expect(parseMonthlyShardFilename(PREFIX, UID, `cadence-data-${UID}.json`)).toBeNull();
  });

  it('lists shard months from userData directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-shard-'));
    fs.writeFileSync(path.join(dir, monthlyShardFilename(PREFIX, UID, '2026-03')), '{}');
    fs.writeFileSync(path.join(dir, monthlyShardFilename(PREFIX, UID, '2026-04')), '{}');
    fs.writeFileSync(path.join(dir, `cadence-data-${UID}.json`), '{}');
    expect(listMonthlyShardMonths(dir, PREFIX, UID)).toEqual(['2026-03', '2026-04']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('monthKeyFromIso handles invalid input', () => {
    expect(monthKeyFromIso('2026-04-05T10:00:00.000Z')).toBe('2026-04');
    expect(monthKeyFromIso(undefined)).toBe('unknown');
  });

  it('retains full bulk in base by default for older app versions', () => {
    const workspace = sampleWorkspace();
    const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(workspace);
    expect(baseWorkspace.notes).toEqual(workspace.notes);
    expect(baseWorkspace.todoItems).toEqual(workspace.todoItems);
    expect(baseWorkspace.items).toEqual(workspace.items);
    expect(baseWorkspace.teams).toEqual(workspace.teams);
    expect(Object.keys(shards).sort()).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('round-trips split → shard merge without losing any id', () => {
    const workspace = sampleWorkspace();
    const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(workspace);
    const merged = mergeMonthlyShardPartials(baseCoreForShardMerge(baseWorkspace), Object.values(shards));
    expect(shardRoundTripMatches(workspace, merged)).toBe(true);
    expect(countShardableEntities(merged).total).toBe(countShardableEntities(workspace).total);
    expect(merged.teams).toEqual(workspace.teams);
  });

  it('legacy monolithic read path: no shards means base file is authoritative', () => {
    const workspace = sampleWorkspace();
    const { baseWorkspace } = splitWorkspaceForMonthlyShards(workspace);
    // Simulates old on-disk layout: only base file, no monthly shards yet.
    expect(shardRoundTripMatches(workspace, baseWorkspace)).toBe(true);
  });

  it('simulates older app version reading only the base file after sharding', () => {
    const workspace = sampleWorkspace();
    const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(workspace);
    // Older build ignores `-YYYY-MM` siblings and reads base only.
    const oldAppView = baseWorkspace;
    expect(shardableEntityIdSet(oldAppView).ids).toEqual(shardableEntityIdSet(workspace).ids);
    expect(oldAppView.notes).toHaveLength(3);
    // New build merges shards and must reach the same ids.
    const newAppView = mergeMonthlyShardPartials(baseCoreForShardMerge(baseWorkspace), Object.values(shards));
    expect(shardableEntityIdSet(newAppView).ids).toEqual(shardableEntityIdSet(workspace).ids);
  });

  it('falls back to base bulk when shard merge is incomplete', () => {
    const workspace = sampleWorkspace();
    const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(workspace);
    const partialShards = [shards['2026-04']]; // missing other months
    const merged = mergeMonthlyShardPartials(baseCoreForShardMerge(baseWorkspace), partialShards);
    expect(countShardableEntities(merged).total).toBeLessThan(countShardableEntities(workspace).total);
    // Caller would serve baseWorkspace instead — verify base still has everything.
    expect(shardRoundTripMatches(workspace, baseWorkspace)).toBe(true);
  });

  it('dedupes by id with shard copies winning over stale base bulk', () => {
    const base = {
      notes: [{ id: 'n1', title: 'stale-in-base' }],
      todoItems: [],
      items: [],
    };
    const partials = [{ notes: [{ id: 'n1', title: 'canonical-in-shard' }], todoItems: [], items: [] }];
    const merged = mergeMonthlyShardPartials(base, partials);
    expect(merged.notes).toEqual([{ id: 'n1', title: 'canonical-in-shard' }]);
  });

  describe('an older build wrote the base file after shards existed', () => {
    const T1 = '2026-04-11T00:00:00.000Z';
    const T2 = '2026-04-12T00:00:00.000Z';
    const shardsOf = (notes: unknown[]) => [{ notes, todoItems: [], items: [] }];
    const base = (over: Record<string, unknown>) => ({ notes: [], todoItems: [], items: [], ...over });

    it('keeps the newer edit an older build made to a note', () => {
      const merged = mergeMonthlyShardPartials(
        base({ notes: [{ id: 'n1', title: 'edited in old build', updatedAt: T2 }] }),
        shardsOf([{ id: 'n1', title: 'stale shard copy', updatedAt: T1 }]),
      );
      expect(merged.notes).toEqual([{ id: 'n1', title: 'edited in old build', updatedAt: T2 }]);
    });

    it('keeps a note that only the older build knows about', () => {
      const merged = mergeMonthlyShardPartials(
        base({ notes: [{ id: 'n1', updatedAt: T1 }, { id: 'new-in-old-build', updatedAt: T2 }] }),
        shardsOf([{ id: 'n1', updatedAt: T1 }]),
      );
      expect(merged.notes.map((n: { id: string }) => n.id).sort()).toEqual(['n1', 'new-in-old-build']);
    });

    it('keeps a note even when the older build also removed another one', () => {
      // Same count as the shards, so a count comparison would pick the wrong side.
      const merged = mergeMonthlyShardPartials(
        base({ notes: [{ id: 'kept', updatedAt: T1 }, { id: 'added', updatedAt: T2 }] }),
        shardsOf([{ id: 'kept', updatedAt: T1 }, { id: 'removed-in-old-build', updatedAt: T1 }]),
      );
      const ids = merged.notes.map((n: { id: string }) => n.id).sort();
      expect(ids).toContain('added');
      expect(ids).toContain('kept');
      expect(ids).toContain('removed-in-old-build'); // never lose; a delete can be repeated
    });

    it('lets the shard copy win when it is newer, equal, or undated', () => {
      const newer = mergeMonthlyShardPartials(
        base({ notes: [{ id: 'n1', title: 'base', updatedAt: T1 }] }),
        shardsOf([{ id: 'n1', title: 'shard', updatedAt: T2 }]),
      );
      expect(newer.notes[0].title).toBe('shard');

      const tie = mergeMonthlyShardPartials(
        base({ notes: [{ id: 'n1', title: 'base', updatedAt: T1 }] }),
        shardsOf([{ id: 'n1', title: 'shard', updatedAt: T1 }]),
      );
      expect(tie.notes[0].title).toBe('shard');

      const undated = mergeMonthlyShardPartials(
        base({ notes: [{ id: 'n1', title: 'base' }] }),
        shardsOf([{ id: 'n1', title: 'shard' }]),
      );
      expect(undated.notes[0].title).toBe('shard');
    });

    it('ignores an unparsable timestamp instead of letting it win', () => {
      const merged = mergeMonthlyShardPartials(
        base({ notes: [{ id: 'n1', title: 'base', updatedAt: 'not-a-date' }] }),
        shardsOf([{ id: 'n1', title: 'shard', updatedAt: T1 }]),
      );
      expect(merged.notes[0].title).toBe('shard');
    });

    it('applies the same rule to todos and team items', () => {
      const merged = mergeMonthlyShardPartials(
        base({
          todoItems: [{ id: 't1', title: 'base-newer', updatedAt: T2 }],
          items: [{ id: 'i1', title: 'base-newer', updatedAt: T2 }],
        }),
        [
          {
            notes: [],
            todoItems: [{ id: 't1', title: 'shard-older', updatedAt: T1 }],
            items: [{ id: 'i1', title: 'shard-older', updatedAt: T1 }],
          },
        ],
      );
      expect(merged.todoItems[0].title).toBe('base-newer');
      expect(merged.items[0].title).toBe('base-newer');
    });
  });

  describe('restore and rollback read the same way as the live path', () => {
    const T1 = '2026-04-11T00:00:00.000Z';
    const T2 = '2026-04-12T00:00:00.000Z';
    const parts = (base: Record<string, unknown>, shardNotes: unknown[]) =>
      mergeWorkspaceFromBackupParts(
        { notes: [], todoItems: [], items: [], ...base },
        [{ notes: shardNotes, todoItems: [], items: [] }],
        (parsed: unknown) => ({ workspace: parsed }),
      ).workspace as { notes: Array<{ id: string; title?: string }> };

    it('keeps an edit that only the base file holds', () => {
      const ws = parts(
        { notes: [{ id: 'n1', title: 'newer in base', updatedAt: T2 }] },
        [{ id: 'n1', title: 'stale in shard', updatedAt: T1 }],
      );
      expect(ws.notes).toEqual([{ id: 'n1', title: 'newer in base', updatedAt: T2 }]);
    });

    it('keeps a note that exists only in a shard even when the base repeats an id', () => {
      const ws = parts(
        { notes: [{ id: 'n1', updatedAt: T1 }, { id: 'n1', updatedAt: T1 }, { id: 'n1', updatedAt: T1 }] },
        [{ id: 'shard-only', updatedAt: T1 }],
      );
      expect(ws.notes.map((n) => n.id).sort()).toEqual(['n1', 'shard-only']);
    });

    it('keeps everything when a crash left a deleted note in the shard but the base has a newer edit', () => {
      // Base is committed first: it already lacks the deleted note and holds the edit.
      const ws = parts(
        { notes: [{ id: 'kept', title: 'edited', updatedAt: T2 }] },
        [{ id: 'kept', title: 'old', updatedAt: T1 }, { id: 'deleted-in-base', updatedAt: T1 }],
      );
      const byId = new Map(ws.notes.map((n) => [n.id, n.title]));
      expect(byId.get('kept')).toBe('edited');
      expect(byId.has('deleted-in-base')).toBe(true);
    });
  });

  it('compares timestamps by instant, not by text', () => {
    const merged = mergeMonthlyShardPartials(
      { notes: [{ id: 'n1', title: 'base', updatedAt: '2026-04-12T15:00:00.000+02:00' }], todoItems: [], items: [] },
      [{ notes: [{ id: 'n1', title: 'shard', updatedAt: '2026-04-12T12:00:00.000Z' }], todoItems: [], items: [] }],
    );
    // 15:00+02:00 = 13:00Z, which is after 12:00Z although the text sorts the other way.
    expect(merged.notes[0].title).toBe('base');
  });

  it('live read path loses nothing an older build wrote to the base file after sharding', () => {
    const workspace = sampleWorkspace();
    const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(workspace);
    const partials = Object.values(shards);

    // Older build: edits n1, adds a note, drops n2 — and writes only the base file.
    const afterOldBuild = {
      ...baseWorkspace,
      notes: [
        { id: 'n1', title: 'edited later', createdAt: '2026-04-10T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
        { id: 'n3', title: 'No date', createdAt: '2026-04-01T00:00:00.000Z' },
        { id: 'n-new', title: 'written in old build', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
      ],
    };

    const merged = mergeBaseWithShards(afterOldBuild, partials) as { notes: Array<{ id: string; title: string }> };
    const byId = new Map(merged.notes.map((n) => [n.id, n.title]));
    expect(byId.get('n1')).toBe('edited later');
    expect(byId.get('n-new')).toBe('written in old build');
    expect(byId.has('n2')).toBe(true);
    expect(byId.has('n3')).toBe(true);

    // What this version writes next must still hold all of it.
    const { shards: resharded } = splitWorkspaceForMonthlyShards(merged);
    expect(shardRoundTripMatches(merged, mergeBaseWithShards({ notes: [], todoItems: [], items: [] }, Object.values(resharded)))).toBe(true);
  });

  it('preserves entities without id during merge', () => {
    const merged = mergeMonthlyShardPartials(
      { notes: [{ title: 'legacy-no-id' }], todoItems: [], items: [] },
      [{ notes: [], todoItems: [], items: [] }],
    );
    expect(merged.notes).toEqual([{ title: 'legacy-no-id' }]);
  });

  it('wraps and unwraps shard payloads', () => {
    const partial = { notes: [{ id: 'n1' }], todoItems: [], items: [] };
    const wrapped = wrapShardPayload('2026-04', partial);
    expect(unwrapShardPayload(wrapped)).toEqual({
      month: '2026-04',
      notes: [{ id: 'n1' }],
      todoItems: [],
      items: [],
    });
  });

  it('groups backup snapshot filenames', () => {
    const base = 'data-pre-save-2026-04-05T12-00-00-000Z.json';
    expect(backupSnapshotKey(base)).toBe('data-pre-save-2026-04-05T12-00-00-000Z');
    expect(backupSnapshotKey(backupShardFilename(base, '2026-04'))).toBe(
      'data-pre-save-2026-04-05T12-00-00-000Z',
    );
  });

  it('upgrade path: empty workspace stays valid', () => {
    const empty = {
      version: 3,
      teams: [],
      people: [],
      todoGroups: [],
      notes: [],
      todoItems: [],
      items: [],
    };
    const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(empty);
    expect(Object.keys(shards)).toHaveLength(0);
    expect(shardRoundTripMatches(empty, baseWorkspace)).toBe(true);
  });

  it('resolves shard backup filename to its base backup sibling', () => {
    const dir = '/backups/user';
    const base = 'data-pre-save-2026-04-05T12-00-00-000Z.json';
    const shard = backupShardFilename(base, '2026-04');
    const resolved = resolveBackupSetBasePath(`${dir}/${shard}`, () => [base, shard]);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.basePath).toBe(`${dir}/${base}`);
    }
  });

  it('rejects orphan shard backup without a base sibling', () => {
    const resolved = resolveBackupSetBasePath('/backups/user/data-pre-save-T-shard-2026-04.json', () => []);
    expect(resolved.ok).toBe(false);
  });

  it('restores old monolithic backup exports unchanged', () => {
    const workspace = sampleWorkspace();
    const loaded = mergeWorkspaceFromBackupParts(workspace, [], unwrapStoredWorkspace);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(shardRoundTripMatches(workspace, loaded.workspace)).toBe(true);
  });

  it('restores sharded backup set by merging base + shard siblings', () => {
    const workspace = sampleWorkspace();
    const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(workspace);
    const envelope = {
      magic: 'CDNC1',
      writeGeneration: 2,
      workspace: baseWorkspace,
    };
    const partials = Object.values(shards);
    const loaded = mergeWorkspaceFromBackupParts(envelope, partials, unwrapStoredWorkspace);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(shardRoundTripMatches(workspace, loaded.workspace)).toBe(true);
  });

  it('identifies monthly shard backup filenames', () => {
    expect(isMonthlyShardBackupFilename('data-pre-save-T-shard-2026-04.json')).toBe(true);
    expect(isMonthlyShardBackupFilename('data-pre-save-T.json')).toBe(false);
  });
});
