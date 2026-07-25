import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRichTextExtensions } from './richTextEditorExtensions';
import {
  createSlashCommandExtension,
  createSlashSuggestionRender,
} from './richTextSlashCommand';
import { SLASH_COMMAND_ITEMS } from './richTextSlashItems';

const destroy = vi.fn();
const hide = vi.fn();
const setProps = vi.fn();

vi.mock('tippy.js', () => ({
  default: vi.fn((_ref: Element, props: { content?: HTMLElement }) => {
    if (props?.content && !props.content.isConnected) {
      document.body.appendChild(props.content);
    }
    return {
      destroy: () => {
        props?.content?.remove();
        destroy();
      },
      hide,
      setProps,
    };
  }),
}));

describe('createSlashSuggestionRender', () => {
  beforeEach(() => {
    destroy.mockClear();
    hide.mockClear();
    setProps.mockClear();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function startMenu(items = SLASH_COMMAND_ITEMS.slice(0, 3)) {
    const render = createSlashSuggestionRender();
    const command = vi.fn();
    const wrap = document.createElement('div');
    wrap.className = 'rich-editor';
    const dom = document.createElement('div');
    wrap.appendChild(dom);
    document.body.appendChild(wrap);
    const editor = {
      view: { dom },
    } as unknown as Editor;

    render.onStart({
      editor,
      items: [...items],
      command,
      clientRect: () => new DOMRect(10, 10, 20, 20),
    });
    return { render, command, editor };
  }

  it('paints items and runs the selected command on Enter', () => {
    const { render, command } = startMenu();
    const menu = document.querySelector('.rich-slash-menu');
    expect(menu?.querySelectorAll('button')).toHaveLength(3);

    expect(
      render.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) }),
    ).toBe(true);
    expect(
      render.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) }),
    ).toBe(true);
    expect(command).toHaveBeenCalledWith(SLASH_COMMAND_ITEMS[1]);
  });

  it('shows empty state and ignores Enter when there are no items', () => {
    const { render, command } = startMenu([]);
    expect(document.querySelector('.rich-slash-menu__empty')?.textContent).toBe(
      'No matching commands',
    );
    expect(
      render.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) }),
    ).toBe(true);
    expect(command).not.toHaveBeenCalled();
  });

  it('tears down on Escape and ignores later keys until a new session', () => {
    const { render, command } = startMenu();
    expect(
      render.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Escape' }) }),
    ).toBe(true);
    expect(destroy).toHaveBeenCalled();
    expect(document.querySelector('.rich-slash-menu')).toBeNull();
    expect(
      render.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) }),
    ).toBe(false);
    expect(command).not.toHaveBeenCalled();

    // Dismissed session: updates must not repaint a live menu.
    render.onUpdate({
      items: [SLASH_COMMAND_ITEMS[0]!],
      command,
      clientRect: () => null,
    });
    expect(document.querySelector('.rich-slash-menu')).toBeNull();
  });

  it('updates the menu and supports ArrowUp wrapping', () => {
    const { render, command } = startMenu();
    render.onUpdate({
      items: SLASH_COMMAND_ITEMS.slice(0, 2),
      command,
      clientRect: () => new DOMRect(1, 1, 1, 1),
    });
    expect(setProps).toHaveBeenCalled();
    expect(
      render.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowUp' }) }),
    ).toBe(true);
    expect(
      render.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) }),
    ).toBe(true);
    expect(command).toHaveBeenCalledWith(SLASH_COMMAND_ITEMS[1]);
  });

  it('clicking a row runs the command', () => {
    const { render, command } = startMenu();
    const btn = document.querySelector('.rich-slash-menu button') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(command).toHaveBeenCalledWith(SLASH_COMMAND_ITEMS[0]);
    render.onExit();
    expect(destroy).toHaveBeenCalled();
  });

  it('returns false for unrelated keys', () => {
    const { render } = startMenu();
    expect(
      render.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'a' }) }),
    ).toBe(false);
  });
});

describe('createSlashCommandExtension', () => {
  it('wires allow/items/command and registers as a TipTap extension', () => {
    const ext = createSlashCommandExtension();
    const editor = new Editor({
      extensions: [...createRichTextExtensions(), ext],
      content: '<p>hello</p>',
    });
    const slash = editor.extensionManager.extensions.find((e) => e.name === 'slashCommand');
    expect(slash).toBeTruthy();
    const suggestion = (
      slash!.options as {
        suggestion: {
          items: (args: { query: string }) => unknown[];
          allow: (args: {
            editor: Editor;
            state: Editor['state'];
            range: { from: number; to: number };
          }) => boolean;
          command: (args: {
            editor: Editor;
            range: { from: number; to: number };
            props: (typeof SLASH_COMMAND_ITEMS)[number];
          }) => void;
        };
      }
    ).suggestion;

    expect(suggestion.items({ query: 'heading' }).length).toBeGreaterThan(0);
    expect(
      suggestion.allow({
        editor,
        state: editor.state,
        range: { from: 1, to: 1 },
      }),
    ).toBe(true);

    editor.setEditable(false);
    expect(
      suggestion.allow({
        editor,
        state: editor.state,
        range: { from: 1, to: 1 },
      }),
    ).toBe(false);
    editor.setEditable(true);

    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'javascript' },
          content: [{ type: 'text', text: 'x' }],
        },
      ],
    });
    const codePos = 1;
    expect(
      suggestion.allow({
        editor,
        state: editor.state,
        range: { from: codePos, to: codePos },
      }),
    ).toBe(false);

    const run = vi.fn();
    suggestion.command({
      editor,
      range: { from: 1, to: 2 },
      props: { ...SLASH_COMMAND_ITEMS[0]!, run },
    });
    expect(run).toHaveBeenCalled();

    editor.destroy();
  });
});
