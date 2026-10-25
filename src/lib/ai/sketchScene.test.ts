import { beforeEach, describe, expect, it, vi } from 'vitest';

const convert = vi.hoisted(() => vi.fn((els: Array<Record<string, unknown>>) => els.map((e, i) => ({ ...e, id: (e.id as string | undefined) ?? `a${i}`, isDeleted: false }))));
vi.mock('@excalidraw/excalidraw', () => ({ convertToExcalidrawElements: convert }));

import { validateSketchSceneForSave } from '../utilityDiagrams';
import { buildSceneJson, graphToSceneJson, layoutBoxes, type BoxArrow, type BoxRect } from './sketchScene';

const g = (labels: string[], edges: Array<[number, number, string?]>) => ({
  nodes: labels.map((label) => ({ label })),
  edges: edges.map(([from, to, label]) => ({ from, to, ...(label ? { label } : {}) })),
});
const rects = (els: ReturnType<typeof layoutBoxes>) => els.filter((e): e is BoxRect => e.type === 'rectangle');
const arrows = (els: ReturnType<typeof layoutBoxes>) => els.filter((e): e is BoxArrow => e.type === 'arrow');

describe('layoutBoxes', () => {
  it('stacks a chain top to bottom in one column', () => {
    const r = rects(layoutBoxes(g(['A', 'B', 'C'], [[0, 1], [1, 2]])));
    expect(r.map((x) => x.label.text)).toEqual(['A', 'B', 'C']);
    expect(r[0].y).toBeLessThan(r[1].y);
    expect(r[1].y).toBeLessThan(r[2].y);
    expect(new Set(r.map((x) => x.x)).size).toBe(1);
  });

  it('puts the children of one node side by side on the same row', () => {
    const r = rects(layoutBoxes(g(['A', 'B', 'C'], [[0, 1], [0, 2]])));
    expect(r[1].y).toBe(r[2].y);
    expect(r[1].x).toBeLessThan(r[2].x);
    expect(r[0].y).toBeLessThan(r[1].y);
  });

  it('places every node of a cycle and of an unconnected pair without looping forever', () => {
    const cyc = rects(layoutBoxes(g(['A', 'B'], [[0, 1], [1, 0]])));
    expect(cyc).toHaveLength(2);
    const loose = rects(layoutBoxes(g(['A', 'B', 'C'], [])));
    expect(loose).toHaveLength(3);
    expect(new Set(loose.map((x) => `${x.x},${x.y}`)).size).toBe(3);
  });

  it('draws one arrow per edge, bound to existing boxes, with its label', () => {
    const els = layoutBoxes(g(['A', 'B'], [[0, 1, 'calls']]));
    const ids = new Set(rects(els).map((x) => x.id));
    const a = arrows(els);
    expect(a).toHaveLength(1);
    expect(ids.has(a[0].start.id)).toBe(true);
    expect(ids.has(a[0].end.id)).toBe(true);
    expect(a[0].start.id).not.toBe(a[0].end.id);
    expect(a[0].label?.text).toBe('calls');
  });

  it('gives every arrow the size that reaches its target box, so it is drawn between the boxes', () => {
    const els = layoutBoxes({
      nodes: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }],
      edges: [{ from: 0, to: 1 }, { from: 0, to: 2 }, { from: 3, to: 0 }],
    });
    const rect = (id: string) => els.find((e) => e.type === 'rectangle' && e.id === id) as Extract<(typeof els)[number], { type: 'rectangle' }>;
    for (const a of arrows(els)) {
      const to = rect(a.end.id);
      const endX = a.x + (a.width ?? 0);
      const endY = a.y + (a.height ?? 0);
      // The arrow ends on the target's outline: inside its horizontal span and on its top, bottom or side edge.
      expect(endX).toBeGreaterThanOrEqual(to.x - 1);
      expect(endX).toBeLessThanOrEqual(to.x + to.width + 1);
      expect(endY).toBeGreaterThanOrEqual(to.y - 1);
      expect(endY).toBeLessThanOrEqual(to.y + to.height + 1);
      expect(Math.abs(a.width ?? 0) + Math.abs(a.height ?? 0)).toBeGreaterThan(20);
    }
  });

  it('gives an empty graph no elements', () => {
    expect(layoutBoxes(g([], []))).toEqual([]);
  });
});

describe('buildSceneJson', () => {
  it('wraps elements in an Excalidraw scene that the save check accepts', () => {
    const json = buildSceneJson([{ id: 'x', type: 'rectangle' }]);
    const parsed = JSON.parse(json) as { type: string; elements: unknown[]; files: unknown };
    expect(parsed.type).toBe('excalidraw');
    expect(parsed.elements).toHaveLength(1);
    expect(parsed.files).toEqual({});
    expect(validateSketchSceneForSave(json).ok).toBe(true);
  });

  it('is refused by the save check when there are no elements', () => {
    expect(validateSketchSceneForSave(buildSceneJson([])).ok).toBe(false);
  });
});

describe('graphToSceneJson', () => {
  beforeEach(() => {
    convert.mockClear();
  });

  it('lays the graph out, converts it and returns a scene the save check accepts', async () => {
    const r = await graphToSceneJson(g(['A', 'B'], [[0, 1]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const scene = JSON.parse(r.json) as { type: string; elements: Array<{ type: string }> };
    expect(scene.type).toBe('excalidraw');
    expect(scene.elements.map((e) => e.type)).toEqual(['rectangle', 'rectangle', 'arrow']);
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it('says so, and converts nothing, for an empty graph', async () => {
    const r = await graphToSceneJson(g([], []));
    expect(r).toEqual({ ok: false, error: 'There is nothing to draw.' });
    expect(convert).not.toHaveBeenCalled();
  });

  it('reports a converter failure instead of throwing', async () => {
    convert.mockImplementationOnce(() => {
      throw new Error('canvas missing');
    });
    const r = await graphToSceneJson(g(['A'], []));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/could not build/i);
  });

  it('refuses a result the save check would refuse', async () => {
    convert.mockReturnValueOnce([]);
    const r = await graphToSceneJson(g(['A'], []));
    expect(r.ok).toBe(false);
  });
});
