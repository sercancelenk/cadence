import { extractPlainText, serializeRichDoc, type RichTextDoc } from '../richText';
import type { RichTextBodyFields } from '../richTextBody';
import { parseSketchSceneJson } from '../sketch/sketchExport';
import { clip, isBlankText } from './prompts/shared';

export type SketchNode = { label: string };
export type SketchEdge = { from: number; to: number; label?: string };
export type SketchGraph = { nodes: SketchNode[]; edges: SketchEdge[]; cut: boolean };
export type SketchGraphResult = { ok: true; value: SketchGraph } | { ok: false; error: string };

const MAX_NODES = 40;
const MAX_EDGES = 80;
const MAX_LABEL = 80;
/** How far from a shape an unbound arrow end may be and still count as touching it. */
const REACH = 24;
const ROW = 40;
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);

type El = Record<string, unknown>;
type Box = { id: string; x: number; y: number; w: number; h: number; label: string };

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const tidy = (s: string): string => clip(s.replace(/\s+/g, ' ').trim(), MAX_LABEL);

function boundId(binding: unknown): string {
  return binding && typeof binding === 'object' ? str((binding as El).elementId) : '';
}

function gap(p: { x: number; y: number }, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * Reads a sketch (Excalidraw scene JSON) as a graph: labelled shapes and free text become nodes,
 * arrows become edges. Deterministic and local; nothing here is sent anywhere.
 */
export function sceneToGraph(sceneJson: string): SketchGraphResult {
  let raw: unknown;
  try {
    raw = JSON.parse(sceneJson);
  } catch {
    return { ok: false, error: 'The sketch could not be read.' };
  }
  const checked = parseSketchSceneJson(raw);
  if (!checked.ok) return checked;
  const elements = (raw as { elements: unknown[] }).elements.filter(
    (e): e is El => !!e && typeof e === 'object' && (e as El).isDeleted !== true,
  );

  const textOf = new Map<string, string>();
  for (const e of elements) {
    if (e.type === 'text' && str(e.containerId)) {
      const prev = textOf.get(str(e.containerId));
      textOf.set(str(e.containerId), prev ? `${prev} ${str(e.text)}` : str(e.text));
    }
  }

  const found: Box[] = [];
  for (const e of elements) {
    const id = str(e.id);
    let text = '';
    if (SHAPES.has(str(e.type))) text = textOf.get(id) ?? '';
    else if (e.type === 'text' && !str(e.containerId)) text = str(e.text);
    else continue;
    const label = tidy(text);
    if (isBlankText(label)) continue;
    found.push({ id, x: num(e.x), y: num(e.y), w: num(e.width), h: num(e.height), label });
  }
  if (found.length === 0) return { ok: false, error: 'The sketch has no shapes with text to turn into a diagram.' };

  found.sort((a, b) => Math.round(a.y / ROW) - Math.round(b.y / ROW) || a.x - b.x);
  const cut = found.length > MAX_NODES;
  const boxes = found.slice(0, MAX_NODES);
  const cutIds = new Set(found.slice(MAX_NODES).map((b) => b.id));
  // An element without an id cannot be the target of a binding; '' must never match an unbound arrow.
  const index = new Map(boxes.flatMap((b, i) => (b.id === '' ? [] : [[b.id, i] as const])));

  const nearest = (p: { x: number; y: number }): number | undefined => {
    let best: number | undefined;
    let bestGap = REACH;
    boxes.forEach((b, i) => {
      const g = gap(p, b);
      if (g <= bestGap) {
        bestGap = g;
        best = i;
      }
    });
    return best;
  };

  const edges: SketchEdge[] = [];
  for (const e of elements) {
    if (e.type !== 'arrow') continue;
    const pts = Array.isArray(e.points) ? (e.points as unknown[]) : [];
    const first = (pts[0] as number[] | undefined) ?? [0, 0];
    const last = (pts[pts.length - 1] as number[] | undefined) ?? [0, 0];
    const start = { x: num(e.x) + num(first[0]), y: num(e.y) + num(first[1]) };
    const end = { x: num(e.x) + num(last[0]), y: num(e.y) + num(last[1]) };
    const startId = boundId(e.startBinding);
    const endId = boundId(e.endBinding);
    // An arrow bound to a box that was cut off has no end in the diagram; it must not latch onto a neighbour.
    if (cutIds.has(startId) || cutIds.has(endId)) continue;
    const from = index.get(startId) ?? nearest(start);
    const to = index.get(endId) ?? nearest(end);
    if (from === undefined || to === undefined || from === to) continue;
    const name = tidy(textOf.get(str(e.id)) ?? '');
    edges.push({ from, to, label: name && !isBlankText(name) ? name : undefined });
    if (edges.length >= MAX_EDGES) break;
  }

  return { ok: true, value: { nodes: boxes.map((b) => ({ label: b.label })), edges, cut } };
}

/** The graph as numbered lines, for the prompt. */
export function describeGraph(g: SketchGraph): string {
  const nodes = g.nodes.map((n, i) => `${i + 1}: ${n.label}`);
  const edges = g.edges.map((e) => `${e.from + 1} -> ${e.to + 1}${e.label ? ` (${e.label})` : ''}`);
  return ['NODES', ...nodes, '', 'ARROWS', ...(edges.length ? edges : ['(none)'])].join('\n');
}

/** A note body that is one code block in `language`. */
export function codeNoteFields(language: string, source: string): RichTextBodyFields {
  const doc: RichTextDoc = {
    type: 'doc',
    content: [{ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text: source }] }],
  };
  return { body: serializeRichDoc(doc), bodyFormat: 'prosemirror', bodyPlainText: extractPlainText(doc) || undefined };
}

/** A note body that is one Mermaid code block. */
export const mermaidNoteFields = (source: string): RichTextBodyFields => codeNoteFields('mermaid', source);
