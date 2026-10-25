import type { JSONContent } from '@tiptap/core';
import type { ChallengeOut } from './prompts/challenge';

const SECTIONS: Array<{ key: keyof ChallengeOut; label: string }> = [
  { key: 'assumptions', label: 'Assumptions' },
  { key: 'risks', label: 'Risks' },
  { key: 'alternatives', label: 'Alternatives' },
  { key: 'questions', label: 'Open questions' },
];

/** The same result as plain text (for the clipboard): a label and a `- ` list per non-empty section. */
export function challengeToText(out: ChallengeOut): string {
  return SECTIONS.filter(({ key }) => out[key].length > 0)
    .map(({ key, label }) => `${label}\n${out[key].map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n');
}

/**
 * The note blocks for a challenge result: a heading, then a bold label and a bullet list per
 * non-empty section. Model text is always plain text nodes, never marks, links or HTML.
 */
export function challengeToBlocks(out: ChallengeOut): JSONContent[] {
  const blocks: JSONContent[] = [];
  for (const { key, label } of SECTIONS) {
    const items = out[key];
    if (items.length === 0) continue;
    blocks.push(
      { type: 'paragraph', content: [{ type: 'text', text: label, marks: [{ type: 'bold' }] }] },
      {
        type: 'bulletList',
        content: items.map((text) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })),
      },
    );
  }
  if (blocks.length === 0) return [];
  return [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Challenge my idea' }] }, ...blocks];
}
