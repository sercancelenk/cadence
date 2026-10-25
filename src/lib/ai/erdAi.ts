import { createColumn, createTable, ERD_DOC_VERSION, type ErdColumnType, type ErdDocument, type ErdRelation, type ErdTable } from '../erd/erdModel';
import { uuid } from '../uuid';

/**
 * AI-suggested changes to an ER diagram. The model describes the schema it thinks the user wants;
 * this works out what that ADDS to the diagram and applies only what the user accepts. Existing
 * tables, columns, ids and positions are never changed or removed.
 */

export type ProposalColumn = { name: string; type: ErdColumnType; pk?: boolean };
export type ProposalTable = { name: string; columns: ProposalColumn[] };
export type ProposalRelation = { fromTable: string; fromColumn: string; toTable: string; toColumn: string };
export type ErdProposal = { tables: ProposalTable[]; relations: ProposalRelation[] };

export type ErdDiff = {
  newTables: ProposalTable[];
  extendedTables: { name: string; newColumns: ProposalColumn[] }[];
  newRelations: ProposalRelation[];
};

const norm = (s: string) => s.trim().toLowerCase();

/** The diagram as text for the prompt: `users(id uuid pk, email string)` and `relations: a.b -> c.d`. */
export function describeErd(doc: ErdDocument): string {
  if (doc.tables.length === 0) return '(empty diagram)';
  const lines = doc.tables.map((t) => `${t.name}(${t.columns.map((c) => `${c.name} ${c.type}${c.pk ? ' pk' : ''}`).join(', ')})`);
  const byId = new Map(doc.tables.map((t) => [t.id, t]));
  const rels = doc.relations
    .map((r) => {
      const from = byId.get(r.fromTableId);
      const to = byId.get(r.toTableId);
      const fc = from?.columns.find((c) => c.id === r.fromColumnId);
      const tc = to?.columns.find((c) => c.id === r.toColumnId);
      return from && to && fc && tc ? `${from.name}.${fc.name} -> ${to.name}.${tc.name}` : null;
    })
    .filter((x): x is string => !!x);
  if (rels.length > 0) lines.push(`relations: ${rels.join(', ')}`);
  return lines.join('\n');
}

export function diffErdProposal(current: ErdDocument, proposal: ErdProposal): ErdDiff {
  const existing = new Map(current.tables.map((t) => [norm(t.name), t]));
  const newTables: ProposalTable[] = [];
  const extendedTables: ErdDiff['extendedTables'] = [];
  for (const t of proposal.tables) {
    const have = existing.get(norm(t.name));
    if (!have) {
      newTables.push(t);
      continue;
    }
    const known = new Set(have.columns.map((c) => norm(c.name)));
    const newColumns = t.columns.filter((c) => !known.has(norm(c.name)));
    if (newColumns.length > 0) extendedTables.push({ name: have.name, newColumns });
  }
  const byId = new Map(current.tables.map((t) => [t.id, t]));
  const haveRelation = new Set(
    current.relations.map((r) => {
      const from = byId.get(r.fromTableId);
      const to = byId.get(r.toTableId);
      const fc = from?.columns.find((c) => c.id === r.fromColumnId)?.name ?? '';
      const tc = to?.columns.find((c) => c.id === r.toColumnId)?.name ?? '';
      return [from?.name, fc, to?.name, tc].map((x) => norm(x ?? '')).join('|');
    }),
  );
  const newRelations = proposal.relations.filter(
    (r) => !haveRelation.has([r.fromTable, r.fromColumn, r.toTable, r.toColumn].map(norm).join('|')),
  );
  return { newTables, extendedTables, newRelations };
}

/**
 * The diagram with the accepted additions. `accepted` holds the lower-case names of the new tables
 * and of the existing tables whose new columns are wanted. A relation is added only when both of
 * its ends exist in the result.
 */
export function applyErdProposal(current: ErdDocument, proposal: ErdProposal, accepted: ReadonlySet<string>): ErdDocument {
  const diff = diffErdProposal(current, proposal);
  const wanted = new Set([...accepted].map(norm));

  const tables: ErdTable[] = current.tables.map((t) => {
    const ext = diff.extendedTables.find((e) => norm(e.name) === norm(t.name));
    if (!ext || !wanted.has(norm(t.name))) return t;
    return { ...t, columns: [...t.columns, ...ext.newColumns.map((c) => createColumn({ name: c.name, type: c.type, pk: c.pk }))] };
  });

  const added = diff.newTables.filter((t) => wanted.has(norm(t.name)));
  const startX = current.tables.length > 0 ? Math.max(...current.tables.map((t) => t.x)) + 360 : 80;
  added.forEach((t, i) => {
    tables.push(
      createTable({
        name: t.name,
        x: startX + (i % 3) * 340,
        y: 80 + Math.floor(i / 3) * 280,
        columns: t.columns.map((c) => createColumn({ name: c.name, type: c.type, pk: c.pk })),
      }),
    );
  });

  const relations: ErdRelation[] = [...current.relations];
  const table = (name: string) => tables.find((t) => norm(t.name) === norm(name));
  for (const r of diff.newRelations) {
    const from = table(r.fromTable);
    const to = table(r.toTable);
    const fc = from?.columns.find((c) => norm(c.name) === norm(r.fromColumn));
    const tc = to?.columns.find((c) => norm(c.name) === norm(r.toColumn));
    if (from && to && fc && tc) {
      relations.push({ id: uuid(), fromTableId: from.id, fromColumnId: fc.id, toTableId: to.id, toColumnId: tc.id });
    }
  }
  return { version: ERD_DOC_VERSION, tables, relations };
}
