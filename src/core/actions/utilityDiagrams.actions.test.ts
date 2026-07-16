import { describe, expect, it } from 'vitest';
import { sampleErdDocument } from '../../lib/erd/erdModel';
import { emptyData, normalizeData } from '../model';
import {
  removeUtilityErdDocument,
  renameUtilityErdDocument,
  upsertUtilityErdDocument,
  upsertUtilitySketchDocument,
} from './index';

describe('utility ERD / Sketch actions', () => {
  it('creates and updates an ERD without touching notes/todos', () => {
    const base = emptyData();
    const notesBefore = structuredClone(base.notes);
    const todosBefore = structuredClone(base.todoItems);

    const created = upsertUtilityErdDocument(base, {
      id: 'erd-1',
      title: 'Checkout schema',
      document: sampleErdDocument(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.utilityErdDocuments).toHaveLength(1);
    expect(created.data.utilityErdDocuments?.[0]?.title).toBe('Checkout schema');
    expect(created.data.notes).toEqual(notesBefore);
    expect(created.data.todoItems).toEqual(todosBefore);

    const updated = upsertUtilityErdDocument(created.data, {
      id: 'erd-1',
      title: 'Checkout schema v2',
      document: sampleErdDocument(),
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.utilityErdDocuments).toHaveLength(1);
    expect(updated.data.utilityErdDocuments?.[0]?.title).toBe('Checkout schema v2');
  });

  it('renames and removes ERDs', () => {
    let d = emptyData();
    const created = upsertUtilityErdDocument(d, {
      id: 'erd-1',
      title: 'A',
      document: sampleErdDocument(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    d = created.data;
    d = renameUtilityErdDocument(d, 'erd-1', 'B');
    expect(d.utilityErdDocuments?.[0]?.title).toBe('B');
    d = removeUtilityErdDocument(d, 'erd-1');
    expect(d.utilityErdDocuments).toEqual([]);
  });

  it('rejects empty sketch saves', () => {
    const r = upsertUtilitySketchDocument(emptyData(), {
      id: 'sk-1',
      title: 'Board',
      sceneJson: JSON.stringify({ type: 'excalidraw', elements: [] }),
    });
    expect(r.ok).toBe(false);
  });

  it('round-trips saved diagrams through normalize without stripping them (forward-compat)', () => {
    const created = upsertUtilityErdDocument(emptyData(), {
      id: 'erd-keep',
      title: 'Keep me',
      document: sampleErdDocument(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const sketch = upsertUtilitySketchDocument(created.data, {
      id: 'sk-keep',
      title: 'Board',
      sceneJson: JSON.stringify({
        type: 'excalidraw',
        elements: [{ id: 'e1', type: 'rectangle', isDeleted: false }],
      }),
    });
    expect(sketch.ok).toBe(true);
    if (!sketch.ok) return;

    const again = normalizeData(JSON.parse(JSON.stringify(sketch.data)));
    expect(again.utilityErdDocuments?.map((d) => d.id)).toEqual(['erd-keep']);
    expect(again.utilitySketchDocuments?.map((d) => d.id)).toEqual(['sk-keep']);
    expect(again.notes).toEqual(sketch.data.notes);
    expect(again.todoItems).toEqual(sketch.data.todoItems);
  });

  it('preserves named ERD rows when nested document version is unsupported', () => {
    const future = {
      version: 3,
      notes: [],
      todoItems: [],
      teams: [],
      people: [],
      items: [],
      utilityErdDocuments: [
        {
          id: 'erd-future',
          title: 'Future schema',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          document: {
            version: 999,
            tables: [{ id: 't1', name: 'users', x: 0, y: 0, columns: [] }],
            relations: [],
            extraFutureField: true,
          },
        },
      ],
    };
    const normalized = normalizeData(future);
    expect(normalized.utilityErdDocuments).toHaveLength(1);
    expect(normalized.utilityErdDocuments?.[0]?.id).toBe('erd-future');
    expect(normalized.utilityErdDocuments?.[0]?.title).toBe('Future schema');
    expect((normalized.utilityErdDocuments?.[0]?.document as { version?: number }).version).toBe(
      999,
    );
  });
});
