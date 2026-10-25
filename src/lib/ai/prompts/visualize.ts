import type { AiTask, ParseResult, PromptContext, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock } from './shared';

/** `current` and `change` together ask for an updated version of an earlier diagram. */
export type VisualizeInput = { text: string; current?: string; change?: string };
export type VisualizeOut = { source: string };

type Kind = 'flowchart' | 'sequence' | 'state' | 'auto';

const MAX_TEXT_CHARS = 16_000;
const MAX_SOURCE_CHARS = 8_000;
const MAX_CURRENT_CHARS = 8_000;
const MAX_CHANGE_CHARS = 2_000;

const KIND_LABEL: Record<Kind, string> = {
  flowchart: 'flowchart',
  sequence: 'sequence diagram',
  state: 'state diagram',
  auto: 'choose the best fit',
};

function kindOf(ctx: PromptContext): Kind {
  const kind = ctx.options.kind;
  return kind === 'flowchart' || kind === 'sequence' || kind === 'state' ? kind : 'auto';
}

const SYSTEM = [
  'ROLE',
  'You turn a piece of text into one clear Mermaid diagram inside a notes app.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Reply with only the Mermaid source. No Markdown fences, no explanation, no title line outside the diagram.',
  '- The first line declares the diagram type and must be exactly one of: "flowchart TD" (or LR), "sequenceDiagram", "stateDiagram-v2". Use no other diagram type.',
  '- Show only what the text says. Do not invent steps, actors, states or decisions. If the text is too thin for a diagram, draw the few things it does state.',
  '- At most 40 nodes or messages. Merge details rather than exceed it.',
  '- Put labels in double quotes when they contain punctuation, parentheses or colons. Keep each label short.',
  '- Use the same language as the text for every label. Never translate.',
  '- No click, callback, link, style, init or HTML directives. Plain structure only.',
].join('\n');

const FOLLOW_UP_RULE =
  '- The data also holds a current diagram and a requested change. Reply with the whole updated diagram: keep what is there and change only what the change asks for. Do not drop existing nodes or steps unless the change says so.';

/** First line that is not blank and not a `%%` comment. */
function headerLine(source: string): string {
  for (const line of source.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('%%')) return t;
  }
  return '';
}

const HEADER = /^(?:(?:flowchart|graph)\s+(?:TD|TB|BT|LR|RL)\b|sequenceDiagram\b|stateDiagram(?:-v2)?\b)/;
const DANGEROUS = /<\s*(?:script|iframe|object|embed|img|svg|link|style|a)\b|javascript:/i;

function stripFences(reply: string): string {
  const fenced = reply.match(/```(?:mermaid)?[^\n]*\n([\s\S]*?)```/i);
  return (fenced ? fenced[1] : reply).trim();
}

export const visualizeTask: AiTask<VisualizeInput, VisualizeOut> = {
  id: 'ai.visualize',
  promptVersion: 2,
  dataClass: 'content',
  needsJson: false,
  allowsFocusNote: false,
  build(input, ctx): PromptParts {
    const followUp = !!input.current?.trim() && !!input.change?.trim();
    const data = followUp
      ? [
          clip(input.text.trim(), MAX_TEXT_CHARS),
          `Current diagram:\n${clip(input.current!.trim(), MAX_CURRENT_CHARS)}`,
          `Requested change:\n${clip(input.change!.trim(), MAX_CHANGE_CHARS)}`,
        ].join('\n\n')
      : clip(input.text.trim(), MAX_TEXT_CHARS);
    const user = [`Diagram type: ${KIND_LABEL[kindOf(ctx)]}`, dataBlock(data), 'Return the Mermaid source now.'].join('\n\n');
    return { system: followUp ? `${SYSTEM}\n${FOLLOW_UP_RULE}` : SYSTEM, user, json: false, maxOutputTokens: 1800 };
  },
  parse(reply): ParseResult<VisualizeOut> {
    // Bound the work before any pattern runs: a reply this long is refused anyway.
    if (reply.length > MAX_SOURCE_CHARS + 2_000) return { ok: false, error: 'The diagram was too long.' };
    const source = stripFences(reply);
    if (!source) return { ok: false, error: 'The reply was empty.' };
    if (source.length > MAX_SOURCE_CHARS) return { ok: false, error: 'The diagram was too long.' };
    if (!HEADER.test(headerLine(source))) {
      return {
        ok: false,
        error: 'The first line must declare "flowchart TD", "sequenceDiagram" or "stateDiagram-v2".',
      };
    }
    // Mermaid reads directives anywhere on a line, and statements may be joined with `;`.
    if (source.includes('%%{')) return { ok: false, error: 'Configuration directives are not allowed.' };
    if (/(?:^|;)\s*click\s/im.test(source)) return { ok: false, error: 'click callbacks and links are not allowed.' };
    if (DANGEROUS.test(source)) return { ok: false, error: 'HTML and script content are not allowed.' };
    return { ok: true, value: { source } };
  },
};
