import { describe, expect, it } from 'vitest';
import { createColumn, createTable, emptyErdDocument, type ErdDocument } from '../erd/erdModel';
import { applyErdProposal, describeErd, diffErdProposal, type ErdProposal } from './erdAi';

function current(): ErdDocument {
  const users = createTable({ id: 'tu', name: 'users', x: 80, y: 100, columns: [createColumn({ id: 'cu1', name: 'id', type: 'uuid', pk: true }), createColumn({ id: 'cu2', name: 'email', type: 'string' })] });
  const posts = createTable({ id: 'tp', name: 'posts', x: 420, y: 100, columns: [createColumn({ id: 'cp1', name: 'id', type: 'uuid', pk: true }), createColumn({ id: 'cp2', name: 'user_id', type: 'uuid' })] });
  return {
    version: 1,
    tables: [users, posts],
    relations: [{ id: 'r1', fromTableId: 'tp', fromColumnId: 'cp2', toTableId: 'tu', toColumnId: 'cu1' }],
  };
}
const col = (name: string, type: 'uuid' | 'string' | 'text' | 'int' | 'timestamp' = 'string', pk?: boolean) => ({ name, type, ...(pk ? { pk: true } : {}) });

const proposal: ErdProposal = {
  tables: [
    { name: 'users', columns: [col('id', 'uuid', true), col('email'), col('display_name')] },
    { name: 'posts', columns: [col('id', 'uuid', true), col('user_id', 'uuid')] },
    { name: 'comments', columns: [col('id', 'uuid', true), col('post_id', 'uuid'), col('body', 'text')] },
  ],
  relations: [
    { fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    { fromTable: 'comments', fromColumn: 'post_id', toTable: 'posts', toColumn: 'id' },
  ],
};

describe('describeErd', () => {
  it('lists tables with their columns and the relations, by name', () => {
    expect(describeErd(current())).toBe('users(id uuid pk, email string)\nposts(id uuid pk, user_id uuid)\nrelations: posts.user_id -> users.id');
    expect(describeErd(emptyErdDocument())).toBe('(empty diagram)');
  });
});

describe('diffErdProposal', () => {
  it('finds new tables, new columns on existing tables and new relations, ignoring case', () => {
    const d = diffErdProposal(current(), { ...proposal, tables: proposal.tables.map((t) => ({ ...t, name: t.name.toUpperCase() })), relations: proposal.relations.map((r) => ({ fromTable: r.fromTable.toUpperCase(), fromColumn: r.fromColumn, toTable: r.toTable.toUpperCase(), toColumn: r.toColumn })) });
    expect(d.newTables.map((t) => t.name)).toEqual(['COMMENTS']);
    expect(d.extendedTables).toEqual([{ name: 'users', newColumns: [col('display_name')] }]);
    expect(d.newRelations).toEqual([{ fromTable: 'COMMENTS', fromColumn: 'post_id', toTable: 'POSTS', toColumn: 'id' }]);
  });

  it('is empty when the proposal adds nothing, and never reports a table the proposal left out as removed', () => {
    const d = diffErdProposal(current(), { tables: [{ name: 'users', columns: [col('id', 'uuid', true)] }], relations: [] });
    expect(d).toEqual({ newTables: [], extendedTables: [], newRelations: [] });
  });
});

describe('applyErdProposal', () => {
  it('adds only what was accepted, and never changes what is already there', () => {
    const before = current();
    const snapshot = JSON.parse(JSON.stringify(before));
    const next = applyErdProposal(before, proposal, new Set(['comments', 'users']));
    expect(before).toEqual(snapshot); // the input is untouched
    for (const t of snapshot.tables) {
      const kept = next.tables.find((x) => x.id === t.id);
      expect(kept?.name).toBe(t.name);
      expect(kept?.x).toBe(t.x);
      expect(kept?.y).toBe(t.y);
      for (const c of t.columns) expect(kept?.columns.find((x) => x.id === c.id)).toEqual(c);
    }
    expect(next.relations).toContainEqual(snapshot.relations[0]);
    const users = next.tables.find((t) => t.id === 'tu')!;
    expect(users.columns.map((c) => c.name)).toEqual(['id', 'email', 'display_name']);
    const comments = next.tables.find((t) => t.name === 'comments')!;
    expect(comments.columns.map((c) => c.name)).toEqual(['id', 'post_id', 'body']);
    expect(comments.columns[0].pk).toBe(true);
  });

  it('wires new relations by name to the right ids, and drops one whose table or column is not there', () => {
    const next = applyErdProposal(current(), proposal, new Set(['comments']));
    const comments = next.tables.find((t) => t.name === 'comments')!;
    const rel = next.relations.find((r) => r.fromTableId === comments.id);
    expect(rel).toMatchObject({ toTableId: 'tp', toColumnId: 'cp1', fromColumnId: comments.columns[1].id });
    // "users.display_name" was not accepted, so a relation that needed it could not be added
    const needs = applyErdProposal(current(), { tables: proposal.tables, relations: [{ fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'display_name' }] }, new Set());
    expect(needs.relations).toHaveLength(1);
  });

  it('leaves out a table that was not accepted, with its relations', () => {
    const next = applyErdProposal(current(), proposal, new Set());
    expect(next.tables).toHaveLength(2);
    expect(next.relations).toHaveLength(1);
  });

  it('places new tables to the right of the existing ones, in a grid, with fresh unique ids', () => {
    const many: ErdProposal = { tables: Array.from({ length: 7 }, (_, i) => ({ name: `t${i}`, columns: [col('id', 'uuid', true)] })), relations: [] };
    const next = applyErdProposal(current(), many, new Set(many.tables.map((t) => t.name)));
    const added = next.tables.slice(2);
    expect(added).toHaveLength(7);
    expect(Math.min(...added.map((t) => t.x))).toBeGreaterThan(420);
    expect(new Set(next.tables.map((t) => t.id)).size).toBe(9);
    const spots = new Set(added.map((t) => `${t.x},${t.y}`));
    expect(spots.size).toBe(7);
  });

  it('starts at the top left of an empty diagram', () => {
    const next = applyErdProposal(emptyErdDocument(), { tables: [{ name: 'a', columns: [col('id', 'uuid', true)] }], relations: [] }, new Set(['a']));
    expect(next.tables[0]).toMatchObject({ x: 80, y: 80 });
  });
});
