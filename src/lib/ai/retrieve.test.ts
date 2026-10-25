import { describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../core/model';

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock('./embeddings', async (importOriginal) => ({ ...(await importOriginal<typeof import('./embeddings')>()), embedTexts }));

import { checkCitations, rerankWithEmbeddings, retrieve, type Source } from './retrieve';

const note = (id: string, title: string, text: string, over: Record<string, unknown> = {}) => ({
  id, title, body: text, bodyPlainText: text, locked: false, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
});
const todo = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, groupId: 'g', title, status: 'todo', done: false, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
});
const data = (over: Record<string, unknown> = {}) =>
  ({ notes: [], todoItems: [], items: [], people: [{ id: 'p1', teamId: 't1', name: 'Ayşe' }], ...over }) as unknown as AppData;

describe('retrieve on a large workspace', () => {
  it('stays fast with thousands of long notes and still ranks the obvious match first', () => {
    const filler = 'The quarterly planning meeting covered budgets, hiring and roadmap items for several teams. '.repeat(40);
    const notes = Array.from({ length: 5000 }, (_, i) => note(`n${i}`, `Meeting ${i}`, `${filler} reference ${i}`));
    notes.push(note('target', 'Zanzibar offsite logistics', 'Flights and hotel for the zanzibar offsite'));
    const started = performance.now();
    const s = retrieve(data({ notes }), 'zanzibar offsite', {});
    const ms = performance.now() - started;
    expect(s[0]?.id).toBe('target');
    // A guard against a runaway scan (it was ~600 ms before the budget), loose enough for a loaded CI machine.
    expect(ms).toBeLessThan(2500);
  });
});

describe('retrieve', () => {
  it('ranks by how well a note or task matches, title matches first', () => {
    const d = data({
      notes: [note('n1', 'Cooking', 'The deployment pipeline is mentioned once here'), note('n2', 'Deployment pipeline', 'details')],
      todoItems: [todo('t1', 'Fix deployment pipeline')],
    });
    const s = retrieve(d, 'deployment pipeline', {});
    expect(s.map((x) => x.id)).toEqual(expect.arrayContaining(['n1', 'n2', 't1']));
    expect(s[0].n).toBe(1);
    expect(s.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(s.slice(0, 2).map((x) => x.id)).not.toContain('n1');
  });

  it('matches Turkish letters whatever the keyboard produced', () => {
    const d = data({ notes: [note('n1', 'Toplantı notları', 'Işık ve şeker üzerine karar verildi')] });
    expect(retrieve(d, 'isik seker', {}).map((x) => x.id)).toEqual(['n1']);
    expect(retrieve(d, 'IŞIK ŞEKER', {}).map((x) => x.id)).toEqual(['n1']);
    expect(retrieve(d, 'toplantiyi', {}).map((x) => x.id)).toEqual(['n1']);
  });

  it('never returns locked or archived notes, nor archived tasks', () => {
    const d = data({
      notes: [note('lock', 'Secret plan', 'secret', { locked: true }), note('arch', 'Secret plan', 'secret', { archived: true }), note('ok', 'Secret plan', 'secret')],
      todoItems: [todo('ta', 'Secret plan', { archived: true })],
    });
    expect(retrieve(d, 'secret plan', {}).map((x) => x.id)).toEqual(['ok']);
  });

  it('includes people records only when asked, and links them to the person', () => {
    const d = data({ items: [{ id: 'i1', personId: 'p1', kind: 'feedback', title: 'Review feedback', body: 'great work on the launch', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] });
    expect(retrieve(d, 'launch feedback', {})).toEqual([]);
    const s = retrieve(d, 'launch feedback', { includePeople: true });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: 'person', href: '/teams/t1/people/p1' });
  });

  it('cuts a snippet of at most 600 characters around the match', () => {
    const long = 'filler '.repeat(400) + 'the needle is here ' + 'filler '.repeat(400);
    const s = retrieve(data({ notes: [note('n1', 'Long', long)] }), 'needle', {});
    expect(s[0].snippet.length).toBeLessThanOrEqual(600);
    expect(s[0].snippet).toContain('needle');
  });

  it('returns at most `limit`, nothing for an empty or unmatched question, and links notes and tasks', () => {
    const many = Array.from({ length: 30 }, (_, i) => note(`n${i}`, `Release ${i}`, 'release notes'));
    expect(retrieve(data({ notes: many }), 'release', { limit: 5 })).toHaveLength(5);
    expect(retrieve(data({ notes: many }), 'release', {})).toHaveLength(8);
    expect(retrieve(data({ notes: many }), '   ', {})).toEqual([]);
    expect(retrieve(data({ notes: many }), 'zzzzqq', {})).toEqual([]);
    const s = retrieve(data({ notes: [note('n1', 'Plan', 'roadmap')], todoItems: [todo('t1', 'Roadmap review')] }), 'roadmap', {});
    expect(s.find((x) => x.id === 'n1')?.href).toBe('/notes?id=n1');
    expect(s.find((x) => x.id === 't1')?.href).toBe('/todos?focus=t1');
  });

  it('stays fast and bounded on a very large workspace', () => {
    const many = Array.from({ length: 3000 }, (_, i) => note(`n${i}`, `Note ${i}`, 'lorem ipsum '.repeat(500)));
    const started = Date.now();
    retrieve(data({ notes: many }), 'lorem question', {});
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('rerankWithEmbeddings', () => {
  const sources: Source[] = ['a', 'b', 'c'].map((id, i) => ({ n: i + 1, kind: 'note', id, title: id, snippet: id, score: 3 - i }));
  const settings = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm', embeddingModel: 'text-embedding-3-small' } as never;

  it('orders by similarity to the question and renumbers', async () => {
    embedTexts.mockResolvedValueOnce([[1, 0], [0, 1], [1, 0], [0.5, 0.5]]);
    const out = await rerankWithEmbeddings({ settings, query: 'q', sources, limit: 2, dataClass: 'content' });
    expect(out.map((s) => s.id)).toEqual(['b', 'c']);
    expect(out.map((s) => s.n)).toEqual([1, 2]);
  });

  it('keeps the keyword order when the request fails or no embedding model is set', async () => {
    embedTexts.mockRejectedValueOnce(new Error('boom'));
    expect((await rerankWithEmbeddings({ settings, query: 'q', sources, limit: 2, dataClass: 'content' })).map((s) => s.id)).toEqual(['a', 'b']);
    embedTexts.mockClear();
    const noModel = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' } as never;
    const out = await rerankWithEmbeddings({ settings: noModel, query: 'q', sources, limit: 2, dataClass: 'content' });
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
    expect(embedTexts).not.toHaveBeenCalled();
  });
});

describe('checkCitations', () => {
  const sources: Source[] = [1, 2].map((n) => ({ n, kind: 'note', id: `n${n}`, title: `T${n}`, snippet: 's', score: 1 }));

  it('accepts known citations and flags unknown ones', () => {
    expect(checkCitations('Yes [1] and also [2].', sources)).toEqual({ cited: [1, 2], unknown: [] });
    expect(checkCitations('Maybe [3] or [1][7]', sources)).toEqual({ cited: [1], unknown: [3, 7] });
  });

  it('reports an answer with no citations', () => {
    expect(checkCitations('No idea.', sources)).toEqual({ cited: [], unknown: [] });
  });
});
