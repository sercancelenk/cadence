import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock } from './shared';
import { visualizeTask, type VisualizeOut } from './visualize';

export type SketchInput = { graph: string };
export type SketchOut = VisualizeOut;

const MAX_GRAPH_CHARS = 8_000;

const SYSTEM = [
  'ROLE',
  'You turn a hand-drawn sketch, already read into numbered nodes and arrows, into one clear Mermaid flowchart inside a notes app.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Reply with only the Mermaid source. No Markdown fences, no explanation.',
  '- The first line must be exactly "flowchart TD" or "flowchart LR". Use no other diagram type.',
  '- Draw every node and every arrow in the data, with the same labels. Do not add nodes, arrows or labels that are not there, and do not merge or drop any.',
  '- Give each node a short id (n1, n2, ...) from its number, and put its label in double quotes: n1["Label"]. An arrow with a label is written n1 -->|"label"| n2.',
  '- Use the same language as the labels. Never translate.',
  '- No click, callback, link, style, init or HTML directives. Plain structure only.',
].join('\n');

/** "Convert to Mermaid": the parsed sketch in, validated Mermaid source out. */
export const sketchTask: AiTask<SketchInput, SketchOut> = {
  id: 'ai.sketch',
  promptVersion: 1,
  dataClass: 'content',
  needsJson: false,
  allowsFocusNote: false,
  build(input): PromptParts {
    const user = [dataBlock(clip(input.graph.trim(), MAX_GRAPH_CHARS)), 'Return the Mermaid source now.'].join('\n\n');
    return { system: SYSTEM, user, json: false, maxOutputTokens: 1800 };
  },
  // Same checks as the Visualize task: one allowed header, no directives, no HTML.
  parse(reply: string): ParseResult<SketchOut> {
    return visualizeTask.parse(reply);
  },
};
