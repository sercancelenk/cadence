/**
 * Round-trip compatibility of note lists (`noteGroups`).
 *
 * Lists gained `parentId` after the first release of lists. Older builds that
 * keep unknown keys (`withExtras`) must carry `parentId` through a load → save,
 * and this build must carry keys it does not know yet. Both rest on the on-disk
 * shape below, so it is pinned here: a group is a flat object with `parentId`
 * as an ordinary key, and nothing outside the group is needed to rebuild the tree.
 */

import { describe, expect, it } from 'vitest';
import { compactAppDataForPersist, emptyData, normalizeData, type AppData } from './index';

const TS = '2026-01-01T00:00:00.000Z';

function roundTrip(raw: unknown): AppData {
  const first = normalizeData(raw);
  const disk = JSON.parse(JSON.stringify(compactAppDataForPersist(first)));
  return normalizeData(disk);
}

function fileWith(noteGroups: unknown[], notes: unknown[] = []) {
  return { ...emptyData(), noteGroups, notes };
}

const note = (id: string, groupId?: string) => ({
  id,
  title: id,
  body: '',
  locked: false,
  ...(groupId ? { groupId } : {}),
  createdAt: TS,
  updatedAt: TS,
});

describe('note list round trip', () => {
  it('keeps parentId, archived, pinned and sort order through load → save → load', () => {
    const out = roundTrip(
      fileWith([
        { id: 'a', name: 'A', sortOrder: 0, createdAt: TS },
        { id: 'b', name: 'B', sortOrder: 1, parentId: 'a', archived: true, pinned: true, createdAt: TS },
      ]),
    );
    expect(out.noteGroups.map((g) => [g.id, g.parentId, g.archived, g.pinned, g.sortOrder])).toEqual([
      ['a', undefined, undefined, undefined, 0],
      ['b', 'a', true, true, 1],
    ]);
  });

  it('keeps a parentId that points at a list that is missing, so a restore or sync can make it valid again', () => {
    const out = roundTrip(
      fileWith([{ id: 'orphan', name: 'Orphan', sortOrder: 0, parentId: 'not-here', createdAt: TS }]),
    );
    expect(out.noteGroups[0]!.parentId).toBe('not-here');
  });

  it('keeps fields a newer build added to a list', () => {
    const out = roundTrip(
      fileWith([{ id: 'a', name: 'A', sortOrder: 0, createdAt: TS, color: 'teal', futureFlags: { x: 1 } }]),
    );
    expect(out.noteGroups[0]).toMatchObject({ color: 'teal', futureFlags: { x: 1 } });
  });

  it('keeps top-level collections this build does not know', () => {
    const out = roundTrip({ ...fileWith([{ id: 'a', name: 'A', sortOrder: 0, createdAt: TS }]), noteTemplates: [{ id: 't' }] });
    expect((out as unknown as Record<string, unknown>).noteTemplates).toEqual([{ id: 't' }]);
  });

  it('keeps every note id and its list through the round trip', () => {
    const out = roundTrip(
      fileWith(
        [
          { id: 'a', name: 'A', sortOrder: 0, createdAt: TS },
          { id: 'b', name: 'B', sortOrder: 1, parentId: 'a', createdAt: TS },
        ],
        [note('n1', 'b'), note('n2', 'a'), note('n3')],
      ),
    );
    expect(out.notes.map((n) => [n.id, n.groupId])).toEqual([
      ['n1', 'b'],
      ['n2', 'a'],
      ['n3', undefined],
    ]);
  });

  it('writes parentId as a plain key on the group so older builds with extras keep it', () => {
    const first = normalizeData(
      fileWith([
        { id: 'a', name: 'A', sortOrder: 0, createdAt: TS },
        { id: 'b', name: 'B', sortOrder: 1, parentId: 'a', createdAt: TS },
      ]),
    );
    const disk = JSON.parse(JSON.stringify(compactAppDataForPersist(first))) as {
      noteGroups: Record<string, unknown>[];
    };
    expect(disk.noteGroups.find((g) => g.id === 'b')).toMatchObject({ parentId: 'a' });
    expect('parentId' in disk.noteGroups.find((g) => g.id === 'a')!).toBe(false);
  });

  it('omits the lists key for a workspace that never used lists, so it stays byte-quiet for older builds', () => {
    const disk = compactAppDataForPersist(normalizeData(emptyData()));
    expect('noteGroups' in disk).toBe(false);
  });
});
