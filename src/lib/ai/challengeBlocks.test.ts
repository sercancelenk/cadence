import { describe, expect, it } from 'vitest';
import { challengeToBlocks } from './challengeBlocks';

describe('challengeToBlocks', () => {
  it('writes a heading, then a bold section label and a bullet list for each non-empty section, in order', () => {
    const blocks = challengeToBlocks({
      assumptions: ['A1', 'A2'],
      risks: [],
      alternatives: ['Alt'],
      questions: ['Q?'],
    });
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
      'paragraph',
      'bulletList',
      'paragraph',
      'bulletList',
    ]);
    expect(blocks[0]).toEqual({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Challenge my idea' }] });
    const labels = blocks.filter((b) => b.type === 'paragraph').map((b) => b.content?.[0]);
    expect(labels).toEqual([
      { type: 'text', text: 'Assumptions', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'Alternatives', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'Open questions', marks: [{ type: 'bold' }] },
    ]);
    expect(blocks[2]).toEqual({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A1' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A2' }] }] },
      ],
    });
  });

  it('keeps model text as plain text: no marks, links or HTML are created from it', () => {
    const blocks = challengeToBlocks({
      assumptions: ['<b>bold</b> [x](https://e.com) **y**'],
      risks: [],
      alternatives: [],
      questions: [],
    });
    const item = blocks[2].content?.[0].content?.[0].content?.[0];
    expect(item).toEqual({ type: 'text', text: '<b>bold</b> [x](https://e.com) **y**' });
  });

  it('returns nothing when every section is empty', () => {
    expect(challengeToBlocks({ assumptions: [], risks: [], alternatives: [], questions: [] })).toEqual([]);
  });
});
