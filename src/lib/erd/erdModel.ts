import { uuid } from '../uuid';

export const ERD_DOC_VERSION = 1 as const;

export const ERD_COLUMN_TYPES = [
  'uuid',
  'string',
  'text',
  'int',
  'bigint',
  'decimal',
  'boolean',
  'timestamp',
  'date',
  'json',
] as const;

export type ErdColumnType = (typeof ERD_COLUMN_TYPES)[number];

export type ErdColumn = {
  id: string;
  name: string;
  type: ErdColumnType;
  pk?: boolean;
};

export type ErdTable = {
  id: string;
  name: string;
  x: number;
  y: number;
  columns: ErdColumn[];
};

export type ErdRelation = {
  id: string;
  /** Source table id */
  fromTableId: string;
  /** Source column id */
  fromColumnId: string;
  /** Target table id */
  toTableId: string;
  /** Target column id */
  toColumnId: string;
};

export type ErdDocument = {
  version: typeof ERD_DOC_VERSION;
  tables: ErdTable[];
  relations: ErdRelation[];
};

export function createColumn(partial?: Partial<ErdColumn>): ErdColumn {
  return {
    id: partial?.id ?? uuid(),
    name: partial?.name ?? 'column',
    type: partial?.type ?? 'string',
    ...(partial?.pk ? { pk: true } : {}),
  };
}

export function createTable(partial?: Partial<ErdTable> & { name?: string }): ErdTable {
  const id = partial?.id ?? uuid();
  return {
    id,
    name: partial?.name ?? 'Table',
    x: partial?.x ?? 80,
    y: partial?.y ?? 80,
    columns: partial?.columns?.length
      ? partial.columns.map((c) => createColumn(c))
      : [
          createColumn({ name: 'id', type: 'uuid', pk: true }),
          createColumn({ name: 'created_at', type: 'timestamp' }),
        ],
  };
}

export function emptyErdDocument(): ErdDocument {
  return { version: ERD_DOC_VERSION, tables: [], relations: [] };
}

export function sampleErdDocument(): ErdDocument {
  const users = createTable({ name: 'users', x: 80, y: 100 });
  const posts = createTable({
    name: 'posts',
    x: 420,
    y: 100,
    columns: [
      createColumn({ name: 'id', type: 'uuid', pk: true }),
      createColumn({ name: 'user_id', type: 'uuid' }),
      createColumn({ name: 'title', type: 'string' }),
      createColumn({ name: 'body', type: 'text' }),
    ],
  });
  const userIdCol = users.columns.find((c) => c.name === 'id')!;
  const fkCol = posts.columns.find((c) => c.name === 'user_id')!;
  return {
    version: ERD_DOC_VERSION,
    tables: [users, posts],
    relations: [
      {
        id: uuid(),
        fromTableId: posts.id,
        fromColumnId: fkCol.id,
        toTableId: users.id,
        toColumnId: userIdCol.id,
      },
    ],
  };
}

export type ErdParseResult = { ok: true; doc: ErdDocument } | { ok: false; error: string };

function isColumnType(v: unknown): v is ErdColumnType {
  return typeof v === 'string' && (ERD_COLUMN_TYPES as readonly string[]).includes(v);
}

/** Parse a previously exported ERD JSON document (defensive). */
export function parseErdDocument(raw: unknown): ErdParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid ERD file (not an object).' };
  const o = raw as Record<string, unknown>;
  if (o.version !== ERD_DOC_VERSION) {
    return { ok: false, error: `Unsupported ERD version (expected ${ERD_DOC_VERSION}).` };
  }
  if (!Array.isArray(o.tables) || !Array.isArray(o.relations)) {
    return { ok: false, error: 'ERD file must include tables and relations arrays.' };
  }

  const tables: ErdTable[] = [];
  const tableIds = new Set<string>();
  for (const row of o.tables) {
    if (!row || typeof row !== 'object') continue;
    const t = row as Record<string, unknown>;
    const id = typeof t.id === 'string' && t.id ? t.id : uuid();
    if (tableIds.has(id)) continue;
    tableIds.add(id);
    const colsRaw = Array.isArray(t.columns) ? t.columns : [];
    const columns: ErdColumn[] = [];
    const colIds = new Set<string>();
    for (const c of colsRaw) {
      if (!c || typeof c !== 'object') continue;
      const col = c as Record<string, unknown>;
      const cid = typeof col.id === 'string' && col.id ? col.id : uuid();
      if (colIds.has(cid)) continue;
      colIds.add(cid);
      columns.push({
        id: cid,
        name: typeof col.name === 'string' && col.name.trim() ? col.name.trim() : 'column',
        type: isColumnType(col.type) ? col.type : 'string',
        ...(col.pk === true ? { pk: true } : {}),
      });
    }
    if (columns.length === 0) columns.push(createColumn({ name: 'id', type: 'uuid', pk: true }));
    tables.push({
      id,
      name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : 'Table',
      x: typeof t.x === 'number' && Number.isFinite(t.x) ? t.x : 80,
      y: typeof t.y === 'number' && Number.isFinite(t.y) ? t.y : 80,
      columns,
    });
  }

  const relations: ErdRelation[] = [];
  const relIds = new Set<string>();
  for (const row of o.relations) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const fromTableId = typeof r.fromTableId === 'string' ? r.fromTableId : '';
    const fromColumnId = typeof r.fromColumnId === 'string' ? r.fromColumnId : '';
    const toTableId = typeof r.toTableId === 'string' ? r.toTableId : '';
    const toColumnId = typeof r.toColumnId === 'string' ? r.toColumnId : '';
    if (!fromTableId || !fromColumnId || !toTableId || !toColumnId) continue;
    if (!tableIds.has(fromTableId) || !tableIds.has(toTableId)) continue;
    const fromTable = tables.find((t) => t.id === fromTableId);
    const toTable = tables.find((t) => t.id === toTableId);
    if (!fromTable?.columns.some((c) => c.id === fromColumnId)) continue;
    if (!toTable?.columns.some((c) => c.id === toColumnId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : uuid();
    if (relIds.has(id)) continue;
    relIds.add(id);
    relations.push({ id, fromTableId, fromColumnId, toTableId, toColumnId });
  }

  return { ok: true, doc: { version: ERD_DOC_VERSION, tables, relations } };
}

export function erdDocumentToJson(doc: ErdDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Trigger a browser download of text content. */
export function downloadTextFile(filename: string, contents: string, mime = 'application/json'): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download from a data URL (e.g. PNG). */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
