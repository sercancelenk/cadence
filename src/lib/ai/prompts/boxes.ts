import type { SketchEdge, SketchNode } from '../sketchGraph';
import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText, readJson } from './shared';

/** `current` (numbered boxes and arrows) and `change` together ask for an updated version. */
export type BoxesInput = { text: string; current?: string; change?: string };
export type BoxesOut = { nodes: SketchNode[]; edges: SketchEdge[] };

const MAX_TEXT_CHARS = 16_000;
const MAX_CURRENT_CHARS = 8_000;
const MAX_CHANGE_CHARS = 2_000;
const MAX_NODES = 24;
const MAX_EDGES = 48;
const MAX_LABEL_CHARS = 60;

const SYSTEM = [
  'ROLE',
  'You turn a structured piece of text into a simple boxes-and-arrows diagram for a whiteboard: short labelled boxes and arrows between them.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Every box is a thing, step or actor that the text names. Every arrow is a relation or a step order that the text states. Never invent a box or an arrow.',
  '- Labels are short (at most 60 characters). Keep the author\'s wording where you can.',
  '- At most 24 boxes and 48 arrows. Each arrow goes from one box id to another; an arrow label is optional and short.',
  '- Use the same language as the text. Never translate.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "nodes": [ { "id": string, "label": string } ], "edges": [ { "from": string, "to": string, "label"?: string } ] }',
].join('\n');

const FOLLOW_UP_RULE =
  '- The data also holds the current diagram (numbered boxes and arrows) and a requested change. Reply with the whole updated diagram in the same JSON shape: keep every existing box and arrow, with the same labels, unless the change removes or renames it, and add only what the change asks for. Give every box an id, including the existing ones.';

const label = (v: unknown): string =>
  typeof v === 'string' && !isBlankText(v) ? clip(v.trim().replace(/\s+/g, ' '), MAX_LABEL_CHARS) : '';

/** "Also draw as Sketch": the structured text in, a small list of boxes and arrows out. */
export const boxesTask: AiTask<BoxesInput, BoxesOut> = {
  id: 'ai.boxes',
  promptVersion: 2,
  dataClass: 'content',
  needsJson: true,
  allowsFocusNote: false,
  build(input): PromptParts {
    const followUp = !!input.current?.trim() && !!input.change?.trim();
    const data = followUp
      ? [
          clip(input.text.trim(), MAX_TEXT_CHARS),
          `Current diagram:\n${clip(input.current!.trim(), MAX_CURRENT_CHARS)}`,
          `Requested change:\n${clip(input.change!.trim(), MAX_CHANGE_CHARS)}`,
        ].join('\n\n')
      : clip(input.text.trim(), MAX_TEXT_CHARS);
    const user = [dataBlock(data), 'Return the JSON object now.'].join('\n\n');
    return { system: followUp ? `${SYSTEM}\n${FOLLOW_UP_RULE}` : SYSTEM, user, json: true, maxOutputTokens: 2000 };
  },
  parse(reply): ParseResult<BoxesOut> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const v = read.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'The reply must be a JSON object.' };
    const o = v as Record<string, unknown>;

    const position = new Map<string, number>();
    const nodes: SketchNode[] = [];
    for (const raw of Array.isArray(o.nodes) ? o.nodes : []) {
      if (nodes.length === MAX_NODES) break;
      if (!raw || typeof raw !== 'object') continue;
      const n = raw as Record<string, unknown>;
      const id = typeof n.id === 'string' ? n.id.trim() : '';
      const text = label(n.label);
      if (!id || !text || position.has(id)) continue;
      position.set(id, nodes.length);
      nodes.push({ label: text });
    }
    if (nodes.length === 0) return { ok: false, error: 'The reply had no usable box.' };

    const seen = new Set<string>();
    const edges: SketchEdge[] = [];
    for (const raw of Array.isArray(o.edges) ? o.edges : []) {
      if (edges.length === MAX_EDGES) break;
      if (!raw || typeof raw !== 'object') continue;
      const e = raw as Record<string, unknown>;
      const from = typeof e.from === 'string' ? position.get(e.from.trim()) : undefined;
      const to = typeof e.to === 'string' ? position.get(e.to.trim()) : undefined;
      if (from === undefined || to === undefined || from === to) continue;
      const key = `${from}>${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const text = label(e.label);
      edges.push({ from, to, ...(text ? { label: text } : {}) });
    }
    return { ok: true, value: { nodes, edges } };
  },
};
