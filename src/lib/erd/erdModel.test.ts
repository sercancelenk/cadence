import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createColumn,
  createTable,
  downloadDataUrl,
  downloadTextFile,
  emptyErdDocument,
  erdDocumentToJson,
  parseErdDocument,
  sampleErdDocument,
} from './erdModel';

describe('erdModel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates tables with a primary key by default', () => {
    const t = createTable({ name: 'orders' });
    expect(t.name).toBe('orders');
    expect(t.columns.some((c) => c.pk)).toBe(true);
  });

  it('round-trips sample document JSON', () => {
    const sample = sampleErdDocument();
    const json = erdDocumentToJson(sample);
    const parsed = parseErdDocument(JSON.parse(json));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.tables).toHaveLength(2);
      expect(parsed.doc.relations).toHaveLength(1);
    }
  });

  it('rejects bad payloads defensively', () => {
    expect(parseErdDocument(null).ok).toBe(false);
    expect(parseErdDocument({ version: 99, tables: [], relations: [] }).ok).toBe(false);
    expect(parseErdDocument({ version: 1, tables: [] }).ok).toBe(false);
    expect(parseErdDocument({ version: 1, tables: [], relations: 'x' }).ok).toBe(false);
    expect(emptyErdDocument().tables).toEqual([]);
  });

  it('fills missing column ids and drops broken relations on import', () => {
    const t = createTable({ name: 'a', id: 't1' });
    const raw = {
      version: 1,
      tables: [
        {
          id: 't1',
          name: 'a',
          x: 10,
          y: 20,
          columns: [{ name: 'id', type: 'uuid', pk: true }],
        },
        {
          id: 't2',
          name: 'b',
          x: 200,
          y: 20,
          columns: [{ id: 'c2', name: 'ref', type: 'uuid' }],
        },
      ],
      relations: [
        {
          fromTableId: 't1',
          fromColumnId: 'missing',
          toTableId: 'gone',
          toColumnId: 'x',
        },
        {
          fromTableId: 't2',
          fromColumnId: 'c2',
          toTableId: 't1',
          toColumnId: 'also-missing',
        },
      ],
    };
    const parsed = parseErdDocument(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.tables[0]?.columns[0]?.id).toBeTruthy();
      expect(parsed.doc.relations).toHaveLength(0);
    }
    expect(createColumn({ name: 'x' }).name).toBe('x');
    expect(t.id).toBe('t1');
  });

  it('skips malformed rows and duplicate ids while keeping valid relations', () => {
    const raw = {
      version: 1,
      tables: [
        null,
        'skip',
        {
          id: 'dup',
          name: '',
          columns: [null, { id: 'c1', name: '', type: 'nope' }, { id: 'c1', name: 'ignored-dup' }],
        },
        {
          id: 'dup',
          name: 'second-dup-table',
          columns: [{ id: 'c9', name: 'x', type: 'string' }],
        },
        {
          id: 't2',
          name: 'ok',
          x: Number.NaN,
          y: 'bad',
          columns: [{ id: 'pk', name: 'id', type: 'uuid', pk: true }],
        },
      ],
      relations: [
        null,
        {
          id: 'r1',
          fromTableId: 'dup',
          fromColumnId: 'c1',
          toTableId: 't2',
          toColumnId: 'missing',
        },
        {
          id: 'r1',
          fromTableId: 'dup',
          fromColumnId: 'c1',
          toTableId: 't2',
          toColumnId: 'pk',
        },
        {
          id: 'r1',
          fromTableId: 'dup',
          fromColumnId: 'c1',
          toTableId: 't2',
          toColumnId: 'pk',
        },
        { fromTableId: '', fromColumnId: 'c1', toTableId: 't2', toColumnId: 'pk' },
      ],
    };
    const parsed = parseErdDocument(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.tables).toHaveLength(2);
      expect(parsed.doc.tables[0]?.name).toBe('Table');
      expect(parsed.doc.tables[0]?.columns[0]?.name).toBe('column');
      expect(parsed.doc.tables[1]?.columns.some((c) => c.pk)).toBe(true);
      expect(parsed.doc.relations).toHaveLength(1);
      expect(parsed.doc.relations[0]?.id).toBe('r1');
      expect(parsed.doc.relations[0]?.toColumnId).toBe('pk');
    }
  });

  it('triggers browser downloads for JSON and data URLs', () => {
    const click = vi.fn();
    const revoke = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:erd-test');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: revoke });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: click });
      }
      return el;
    });

    downloadTextFile('erd.json', '{"version":1}');
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:erd-test');

    downloadDataUrl('erd.png', 'data:image/png;base64,xx');
    expect(click).toHaveBeenCalledTimes(2);
  });
});
