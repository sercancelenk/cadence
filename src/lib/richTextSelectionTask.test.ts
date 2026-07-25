import { describe, expect, it } from 'vitest';
import {
  RICH_TEXT_TASK_TITLE_MAX,
  taskTitleFromEditorSelection,
  type SelectionTextSource,
} from './richTextSelectionTask';

function fakeEditor(text: string, empty = false): SelectionTextSource {
  return {
    state: {
      selection: { from: 0, to: empty ? 0 : text.length, empty },
      doc: {
        textBetween: () => text,
      },
    },
  };
}

describe('taskTitleFromEditorSelection', () => {
  it('returns null for empty selection', () => {
    expect(taskTitleFromEditorSelection(fakeEditor('Ship invoice', true))).toBeNull();
  });

  it('returns null for whitespace-only selection', () => {
    expect(taskTitleFromEditorSelection(fakeEditor('  \n\t  '))).toBeNull();
  });

  it('collapses internal whitespace to a single-line title', () => {
    expect(taskTitleFromEditorSelection(fakeEditor('Ship\n  invoice'))).toBe('Ship invoice');
  });

  it('truncates very long selections near a word boundary', () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const title = taskTitleFromEditorSelection(fakeEditor(words));
    expect(title).toBeTruthy();
    expect(title!.length).toBeLessThanOrEqual(RICH_TEXT_TASK_TITLE_MAX);
    expect(title).not.toMatch(/\s$/);
  });

  it('strips control characters from the title', () => {
    expect(taskTitleFromEditorSelection(fakeEditor('Ship\u0000 invoice\u0007'))).toBe(
      'Ship invoice',
    );
  });

  it('hard-truncates when there is no usable word boundary', () => {
    const solid = 'x'.repeat(RICH_TEXT_TASK_TITLE_MAX + 40);
    const title = taskTitleFromEditorSelection(fakeEditor(solid));
    expect(title).toBe('x'.repeat(RICH_TEXT_TASK_TITLE_MAX));
  });

  it('returns null when from === to even if empty flag is false', () => {
    const editor: SelectionTextSource = {
      state: {
        selection: { from: 3, to: 3, empty: false },
        doc: { textBetween: () => 'should-not-read' },
      },
    };
    expect(taskTitleFromEditorSelection(editor)).toBeNull();
  });
});
