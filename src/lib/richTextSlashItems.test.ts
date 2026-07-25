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

  it('invokes every slash item command against a mock chain', () => {
    const calls: string[] = [];
    const chain: Record<string, unknown> = {
      focus() {
        return chain;
      },
      deleteRange() {
        return chain;
      },
      setParagraph() {
        calls.push('setParagraph');
        return chain;
      },
      toggleHeading(opts: { level: number }) {
        calls.push(`heading:${opts.level}`);
        return chain;
      },
      toggleBulletList() {
        calls.push('bullet');
        return chain;
      },
      toggleOrderedList() {
        calls.push('numbered');
        return chain;
      },
      toggleTaskList() {
        calls.push('task');
        return chain;
      },
      toggleBlockquote() {
        calls.push('quote');
        return chain;
      },
      toggleCodeBlock(opts: { language: string }) {
        calls.push(`code:${opts.language}`);
        return chain;
      },
      updateAttributes(type: string, attrs: { language: string }) {
        calls.push(`update:${type}:${attrs.language}`);
        return chain;
      },
      insertTable() {
        calls.push('table');
        return chain;
      },
      setHorizontalRule() {
        calls.push('divider');
        return chain;
      },
      run() {
        return true;
      },
    };
    const editor = {
      chain: () => chain,
      isActive: (name: string) => name === 'codeBlock' && calls.includes('code:javascript'),
      isEditable: true,
    } as unknown as Editor;

    for (const item of SLASH_COMMAND_ITEMS) {
      item.run(editor, { from: 1, to: 2 });
    }

    // After `code` toggles a block, `mermaid` hits the updateAttributes branch.
    expect(calls).toEqual(
      expect.arrayContaining([
        'setParagraph',
        'heading:1',
        'heading:2',
        'heading:3',
        'bullet',
        'numbered',
        'task',
        'quote',
        'code:javascript',
        'update:codeBlock:mermaid',
        'table',
        'divider',
      ]),
    );
  });

  it('updates language when a code block is already active', () => {
    const updateAttributes = vi.fn(function updateAttributes(this: unknown) {
      return this;
    });
    const toggleCodeBlock = vi.fn(function toggleCodeBlock(this: unknown) {
      return this;
    });
    const chain = {
      focus() {
        return chain;
      },
      deleteRange() {
        return chain;
      },
      updateAttributes,
      toggleCodeBlock,
      run: () => true,
    };
    const editor = {
      chain: () => chain,
      isActive: (name: string) => name === 'codeBlock',
      isEditable: true,
    } as unknown as Editor;

    SLASH_COMMAND_ITEMS.find((i) => i.id === 'mermaid')!.run(editor, { from: 0, to: 1 });
    expect(updateAttributes).toHaveBeenCalledWith('codeBlock', { language: 'mermaid' });
    expect(toggleCodeBlock).not.toHaveBeenCalled();
  });
});
