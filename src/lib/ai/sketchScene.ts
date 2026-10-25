import { validateSketchSceneForSave } from '../utilityDiagrams';
import type { SketchEdge, SketchNode } from './sketchGraph';

export type BoxRect = {
  type: 'rectangle';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: { text: string; fontFamily: number };
};
export type BoxArrow = {
  type: 'arrow';
  x: number;
  y: number;
  /** Vector from the start point to the end point; without it the converter draws a 100 px stub. */
  width: number;
  height: number;
  /** The same vector as points, because the converter treats a width of 0 as not given. */
  points: [[number, number], [number, number]];
  start: { id: string };
  end: { id: string };
};
/** An arrow's label, drawn beside it as free text: a label bound to a short arrow gets cut off. */
export type BoxText = {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: number;
};

const WIDTH = 180;
const HEIGHT = 64;
const GAP_X = 60;
const GAP_Y = 90;
/**
 * Excalidraw's "Helvetica" family. It is a system font, so its width is known the moment a label is
 * created; the hand-drawn fonts load later, and a label sized before then comes out too narrow and is cut off.
 */
const SYSTEM_FONT = 2;
const LABEL_FONT = 16;
const LABEL_CHAR_WIDTH = 8.5;

/** How many steps each node is from a start, reading the arrows; safe on cycles and loose nodes. */
function depths(count: number, edges: SketchEdge[]): number[] {
  const out: number[][] = Array.from({ length: count }, () => []);
  const hasIncoming = new Set<number>();
  for (const e of edges) {
    out[e.from].push(e.to);
    hasIncoming.add(e.to);
  }
  const depth: number[] = Array.from({ length: count }, () => -1);
  const spreadFrom = (root: number) => {
    depth[root] = 0;
    const queue = [root];
    for (let head = 0; head < queue.length; head += 1) {
      const at = queue[head]!;
      for (const next of out[at]!) {
        if (depth[next] === -1) {
          depth[next] = depth[at]! + 1;
          queue.push(next);
        }
      }
    }
  };
  // Every box nothing points to is a start; a graph that is one big cycle starts at the first box.
  const starts = Array.from({ length: count }, (_, i) => i).filter((i) => !hasIncoming.has(i));
  for (const i of starts.length > 0 ? starts : [0]) if (depth[i] === -1) spreadFrom(i);
  // Anything left sits in a cycle cut off from every start.
  for (let i = 0; i < count; i += 1) if (depth[i] === -1) spreadFrom(i);
  return depth;
}

/**
 * Boxes in rows by how far they are from a start (top to bottom, each row centred), and one arrow
 * per edge. The result is Excalidraw's "skeleton" form: `convertToExcalidrawElements` fills in the rest.
 */
export function layoutBoxes(graph: { nodes: SketchNode[]; edges: SketchEdge[] }): Array<BoxRect | BoxArrow | BoxText> {
  const { nodes, edges } = graph;
  if (nodes.length === 0) return [];
  const depth = depths(nodes.length, edges);
  const rows = new Map<number, number[]>();
  nodes.forEach((_, i) => rows.set(depth[i]!, [...(rows.get(depth[i]!) ?? []), i]));
  const widest = Math.max(...Array.from(rows.values(), (r) => r.length));

  const rects: BoxRect[] = nodes.map((n, i) => ({
    type: 'rectangle',
    id: `n${i}`,
    x: 0,
    y: depth[i]! * (HEIGHT + GAP_Y),
    width: WIDTH,
    height: HEIGHT,
    label: { text: n.label, fontFamily: SYSTEM_FONT },
  }));
  for (const row of rows.values()) {
    const offset = ((widest - row.length) * (WIDTH + GAP_X)) / 2;
    row.forEach((nodeIndex, k) => {
      rects[nodeIndex]!.x = offset + k * (WIDTH + GAP_X);
    });
  }
  const arrows: BoxArrow[] = [];
  const labels: BoxText[] = [];
  for (const e of edges) {
    const from = rects[e.from]!;
    const to = rects[e.to]!;
    // The converter binds an arrow but does not stretch it to its target, so the line is laid out
    // here: bottom to top for a box further down, top to bottom for one further up, side to side in a row.
    let sx: number;
    let sy: number;
    let ex: number;
    let ey: number;
    if (to.y > from.y) {
      [sx, sy, ex, ey] = [from.x + WIDTH / 2, from.y + HEIGHT, to.x + WIDTH / 2, to.y];
    } else if (to.y < from.y) {
      [sx, sy, ex, ey] = [from.x + WIDTH / 2, from.y, to.x + WIDTH / 2, to.y + HEIGHT];
    } else if (to.x >= from.x) {
      [sx, sy, ex, ey] = [from.x + WIDTH, from.y + HEIGHT / 2, to.x, to.y + HEIGHT / 2];
    } else {
      [sx, sy, ex, ey] = [from.x, from.y + HEIGHT / 2, to.x + WIDTH, to.y + HEIGHT / 2];
    }
    arrows.push({
      type: 'arrow',
      x: sx,
      y: sy,
      width: ex - sx,
      height: ey - sy,
      points: [[0, 0], [ex - sx, ey - sy]],
      start: { id: from.id },
      end: { id: to.id },
    });
    if (e.label) {
      const midX = (sx + ex) / 2;
      const midY = (sy + ey) / 2;
      const textWidth = e.label.length * LABEL_CHAR_WIDTH;
      const dx = ex - sx;
      const dy = ey - sy;
      let x: number;
      let y: number;
      if (Math.abs(dx) < 1) {
        // Straight up or down: beside the line, at its middle.
        x = midX + 10;
        y = midY - LABEL_FONT / 2;
      } else if (Math.abs(dy) < 1) {
        // Side by side: above the line, centred.
        x = midX - textWidth / 2;
        y = midY - LABEL_FONT - 10;
      } else {
        // Sloping: above the middle, on the side the line leans away from, so it never crosses the text.
        x = dx * dy > 0 ? midX + 10 : midX - textWidth - 10;
        y = midY - LABEL_FONT * 1.25 - 6;
      }
      labels.push({ type: 'text', x, y, text: e.label, fontSize: LABEL_FONT, fontFamily: SYSTEM_FONT });
    }
  }
  return [...rects, ...arrows, ...labels];
}

/** The scene file Utilities → Sketch saves and opens. */
export function buildSceneJson(elements: readonly unknown[]): string {
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'cadence',
    elements,
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  });
}

export type SceneResult = { ok: true; json: string } | { ok: false; error: string };

/**
 * Boxes and arrows in, a scene Utilities → Sketch can save out. Excalidraw is loaded only now, and a
 * failure to convert or a scene the save check refuses comes back as an error, never as a throw.
 */
export async function graphToSceneJson(graph: { nodes: SketchNode[]; edges: SketchEdge[] }): Promise<SceneResult> {
  const elements = layoutBoxes(graph);
  if (elements.length === 0) return { ok: false, error: 'There is nothing to draw.' };
  let json: string;
  try {
    const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
    json = buildSceneJson(convertToExcalidrawElements(elements));
  } catch {
    return { ok: false, error: 'The sketch could not build from this result. Try again.' };
  }
  const check = validateSketchSceneForSave(json);
  return check.ok ? { ok: true, json } : { ok: false, error: check.error };
}
