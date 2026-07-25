import { describe, expect, it, vi } from 'vitest';
import {
  filterSlashCommandItems,
  runSlashCommand,
  SLASH_COMMAND_ITEMS,
} from './richTextSlashItems';
import type { Editor, Range } from '@tiptap/core';

describe('richTextSlashItems', () => {
  it('returns all items for an empty query', () => {
    expect(filterSlashCommandItems('')).toHaveLength(SLASH_COMMAND_ITEMS.length);
  });

  it('filters by title and keywords', () => {
    const headings = filterSlashCommandItems('heading');
    expect(headings.some((i) => i.id === 'h1')).toBe(true);
    expect(headings.some((i) => i.id === 'table')).toBe(false);

    const tasks = filterSlashCommandItems('todo');
    expect(tasks.map((i) => i.id)).toContain('task');
  });

  it('runs deleteRange and the structural command in one chain', () => {
    const steps: string[] = [];
    const chain = {
      focus() {
        steps.push('focus');
        return chain;
      },
      deleteRange(_range: Range) {
        steps.push('deleteRange');
        return chain;
      },
      setParagraph() {
        steps.push('setParagraph');
        return chain;
      },
      run() {
        steps.push('run');
        return true;
      },
    };
    const editor = {
      chain: () => chain,
      isActive: () => false,
      isEditable: true,
    } as unknown as Editor;

    expect(runSlashCommand(editor, { from: 1, to: 3 }, (c) => c.setParagraph())).toBe(true);
    expect(steps).toEqual(['focus', 'deleteRange', 'setParagraph', 'run']);
  });

  it('no-ops when the editor is not editable', () => {
    const chain = vi.fn();
    const editor = {
      chain,
      isEditable: false,
    } as unknown as Editor;
    expect(runSlashCommand(editor, { from: 1, to: 2 }, (c) => c)).toBe(false);
    expect(chain).not.toHaveBeenCalled();
  });

  it('paragraph slash item uses the single-transaction helper', () => {
    const run = vi.fn().mockReturnValue(true);
    const chain = {
      focus: vi.fn(function focus(this: typeof chain) {
        return this;
      }),
      deleteRange: vi.fn(function deleteRange(this: typeof chain) {
        return this;
      }),
      setParagraph: vi.fn(function setParagraph(this: typeof chain) {
        return this;
      }),
      run,
    };
    const editor = {
      chain: () => chain,
      isActive: () => false,
      isEditable: true,
    } as unknown as Editor;

    const text = SLASH_COMMAND_ITEMS.find((i) => i.id === 'text');
    expect(text).toBeDefined();
    text!.run(editor, { from: 2, to: 5 });
    expect(chain.deleteRange).toHaveBeenCalledWith({ from: 2, to: 5 });
    expect(chain.setParagraph).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });
});
