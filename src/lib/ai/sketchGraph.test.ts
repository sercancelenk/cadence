import { describe, expect, it } from 'vitest';
import { describeGraph, sceneToGraph } from './sketchGraph';

const box = (id: string, x: number, y: number, text?: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'rectangle', x, y, width: 100, height: 60, isDeleted: false, boundElements: text ? [{ type: 'text', id: `${id}-t` }] : [], ...extra,
});
const label = (id: string, containerId: string, text: string) => ({ id, type: 'text', containerId, text, x: 0, y: 0, width: 10, height: 10, isDeleted: false });
const arrow = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'arrow', x: 0, y: 0, width: 0, height: 0, points: [[0, 0], [100, 0]], isDeleted: false, ...extra,
});
const scene = (elements: unknown[]) => JSON.stringify({ type: 'excalidraw', elements });

describe('sceneToGraph', () => {
  it('reads shapes with their labels and arrows bound to both ends', () => {
    const g = sceneToGraph(scene([
      box('a', 0, 0, 'x'), label('a-t', 'a', 'Login'),
      box('b', 300, 0, 'x'), label('b-t', 'b', 'Dashboard'),
      arrow('r', { startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' } }),
    ]));
    expect(g.ok && g.value.nodes.map((n) => n.label)).toEqual(['Login', 'Dashboard']);
    expect(g.ok && g.value.edges).toEqual([{ from: 0, to: 1, label: undefined }]);
  });

  it('matches an unbound arrow to the nearest shapes at its two ends', () => {
    const g = sceneToGraph(scene([
      box('a', 0, 0, 'x'), label('a-t', 'a', 'A'),
      box('b', 400, 0, 'x'), label('b-t', 'b', 'B'),
      arrow('r', { x: 100, y: 30, points: [[0, 0], [296, 0]] }),
    ]));
    expect(g.ok && g.value.edges).toEqual([{ from: 0, to: 1, label: undefined }]);
  });

  it('drops an unbound arrow whose end is far from every shape', () => {
    const g = sceneToGraph(scene([
      box('a', 0, 0, 'x'), label('a-t', 'a', 'A'),
      box('b', 400, 0, 'x'), label('b-t', 'b', 'B'),
      arrow('r', { x: 100, y: 30, points: [[0, 0], [100, 0]] }),
    ]));
    expect(g.ok && g.value.edges).toEqual([]);
  });

  it('ignores deleted elements and shapes without text', () => {
    const g = sceneToGraph(scene([
      box('a', 0, 0, 'x', { isDeleted: true }), label('a-t', 'a', 'Gone'),
      box('b', 0, 0), box('c', 0, 0, 'x'), label('c-t', 'c', 'Kept'),
    ]));
    expect(g.ok && g.value.nodes.map((n) => n.label)).toEqual(['Kept']);
  });

  it('uses free text as a node and an arrow label from its bound text', () => {
    const g = sceneToGraph(scene([
      { id: 'f', type: 'text', text: 'Free note', x: 0, y: 0, width: 50, height: 20, isDeleted: false },
      box('b', 300, 0, 'x'), label('b-t', 'b', 'B'),
      arrow('r', { startBinding: { elementId: 'f' }, endBinding: { elementId: 'b' }, boundElements: [{ type: 'text', id: 'r-t' }] }),
      label('r-t', 'r', 'yes'),
    ]));
    expect(g.ok && g.value.nodes.map((n) => n.label)).toEqual(['Free note', 'B']);
    expect(g.ok && g.value.edges[0]).toEqual({ from: 0, to: 1, label: 'yes' });
  });

  it('orders nodes top to bottom, then left to right', () => {
    const g = sceneToGraph(scene([
      box('b', 300, 0, 'x'), label('b-t', 'b', 'Right'),
      box('c', 0, 200, 'x'), label('c-t', 'c', 'Below'),
      box('a', 0, 0, 'x'), label('a-t', 'a', 'Left'),
    ]));
    expect(g.ok && g.value.nodes.map((n) => n.label)).toEqual(['Left', 'Right', 'Below']);
  });

  it('refuses an empty sketch and malformed input', () => {
    expect(sceneToGraph(scene([])).ok).toBe(false);
    expect(sceneToGraph('not json').ok).toBe(false);
    expect(sceneToGraph(JSON.stringify({ elements: 3 })).ok).toBe(false);
    expect(sceneToGraph(scene([box('a', 0, 0)])).ok).toBe(false);
  });

  it('keeps at most 40 nodes and says it was cut', () => {
    const els: unknown[] = [];
    for (let i = 0; i < 60; i++) els.push(box(`n${i}`, (i % 10) * 150, Math.floor(i / 10) * 100, 'x'), label(`n${i}-t`, `n${i}`, `N${i}`));
    const g = sceneToGraph(scene(els));
    expect(g.ok && g.value.nodes).toHaveLength(40);
    expect(g.ok && g.value.cut).toBe(true);
  });

  it('clips long labels and strips newlines', () => {
    const g = sceneToGraph(scene([box('a', 0, 0, 'x'), label('a-t', 'a', 'one\ntwo ' + 'z'.repeat(200))]));
    expect(g.ok && g.value.nodes[0].label).not.toContain('\n');
    expect(g.ok && Array.from(g.value.nodes[0].label).length).toBeLessThanOrEqual(80);
  });
});

describe('describeGraph', () => {
  it('lists numbered nodes and arrows', () => {
    const g = sceneToGraph(scene([
      box('a', 0, 0, 'x'), label('a-t', 'a', 'A'), box('b', 300, 0, 'x'), label('b-t', 'b', 'B'),
      arrow('r', { startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' } }),
    ]));
    if (!g.ok) throw new Error('x');
    const text = describeGraph(g.value);
    expect(text).toContain('1: A');
    expect(text).toContain('2: B');
    expect(text).toContain('1 -> 2');
  });
});

describe('mermaidNoteFields', () => {
  it('makes a note body with one mermaid code block and the source as plain text', async () => {
    const { mermaidNoteFields } = await import('./sketchGraph');
    const f = mermaidNoteFields('flowchart TD\n  A --> B');
    expect(f.bodyFormat).toBe('prosemirror');
    const doc = JSON.parse(f.body) as { content: Array<{ type: string; attrs?: { language?: string }; content?: Array<{ text: string }> }> };
    expect(doc.content[0]).toMatchObject({ type: 'codeBlock', attrs: { language: 'mermaid' } });
    expect(doc.content[0].content?.[0].text).toBe('flowchart TD\n  A --> B');
    expect(f.bodyPlainText).toContain('A --> B');
  });
});

describe('codeNoteFields', () => {
  it('uses the language given', async () => {
    const { codeNoteFields } = await import('./sketchGraph');
    const doc = JSON.parse(codeNoteFields('html', '<p>x</p>').body) as { content: Array<{ attrs: { language: string } }> };
    expect(doc.content[0].attrs.language).toBe('html');
  });
});

describe('sceneToGraph with an element that has no id', () => {
  it('does not let an unbound arrow attach to it', () => {
    const g = sceneToGraph(scene([
      { type: 'text', x: -300, y: 0, width: 50, height: 20, text: 'Ghost', isDeleted: false },
      box('a', 0, 0, 'x'), label('a-t', 'a', 'Start'),
      box('b', 130, 0, 'x'), label('b-t', 'b', 'End'),
      arrow('r', { points: [[0, 0], [150, 0]] }),
    ]));
    expect(g.ok && g.value.edges).toEqual([{ from: 1, to: 2, label: undefined }]);
  });
});

describe('sceneToGraph when the shape limit cuts boxes off', () => {
  it('does not attach an arrow bound to a cut-off box to a different, nearby box', () => {
    const shapes = Array.from({ length: 41 }, (_, i) => [
      box(`b${i}`, i < 40 ? i * 150 : 0, i < 40 ? 0 : 5000, 'x'),
      label(`b${i}-t`, `b${i}`, `Box ${i}`),
    ]).flat();
    // The 41st box (b40) is last in reading order and is cut. The arrow ends at b40 but points at b1.
    const g = sceneToGraph(scene([
      ...shapes,
      arrow('r', { points: [[0, 0], [150, 0]], startBinding: { elementId: 'b0' }, endBinding: { elementId: 'b40' } }),
    ]));
    expect(g.ok && g.value.cut).toBe(true);
    expect(g.ok && g.value.edges).toEqual([]);
  });
});
