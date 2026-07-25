import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance, type Props as TippyProps } from 'tippy.js';
import { filterSlashCommandItems, type SlashCommandItem } from './richTextSlashItems';

const ZERO_RECT = () =>
  new DOMRect(0, 0, 0, 0);

function tippyRect(clientRect?: (() => DOMRect | null) | null): () => DOMRect {
  return () => clientRect?.() ?? ZERO_RECT();
}

/**
 * TipTap `/` command palette. Editor-only — do not add to markdown-import
 * extension lists (Suggestion needs a live view).
 */
export function createSlashCommandExtension(): Extension {
  return Extension.create({
    name: 'slashCommand',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          allowSpaces: false,
          startOfLine: false,
          items: ({ query }: { query: string }) => filterSlashCommandItems(query),
          allow: ({
            editor,
            state,
            range,
          }: {
            editor: import('@tiptap/core').Editor;
            state: import('@tiptap/pm/state').EditorState;
            range: import('@tiptap/core').Range;
          }) => {
            if (!editor.isEditable) return false;
            const parent = state.doc.resolve(range.from).parent;
            // Don't steal `/` inside fenced code / Mermaid source.
            if (parent.type.name === 'codeBlock') return false;
            return true;
          },
          render: () => {
            let root: HTMLDivElement | null = null;
            let popup: TippyInstance | null = null;
            let selected = 0;
            /** After Escape, ignore keys until the Suggestion session fully exits. */
            let dismissed = false;
            let latest: {
              items: SlashCommandItem[];
              command: (item: SlashCommandItem) => void;
            } | null = null;

            const paint = () => {
              if (!root || !latest) return;
              root.replaceChildren();
              root.className = 'rich-slash-menu';
              if (latest.items.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'rich-slash-menu__empty';
                empty.textContent = 'No matching commands';
                root.appendChild(empty);
                return;
              }
              latest.items.forEach((item, index) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `rich-slash-menu__item${index === selected ? ' is-active' : ''}`;
                btn.innerHTML = `<span class="rich-slash-menu__title"></span><span class="rich-slash-menu__hint"></span>`;
                const title = btn.querySelector('.rich-slash-menu__title');
                const hint = btn.querySelector('.rich-slash-menu__hint');
                if (title) title.textContent = item.title;
                if (hint) hint.textContent = item.hint;
                btn.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  if (dismissed) return;
                  latest?.command(item);
                });
                root!.appendChild(btn);
              });
            };

            const teardownPopup = () => {
              popup?.destroy();
              popup = null;
              root = null;
              latest = null;
            };

            return {
              onStart: (props: {
                editor: import('@tiptap/core').Editor;
                items: SlashCommandItem[];
                command: (item: SlashCommandItem) => void;
                clientRect?: (() => DOMRect | null) | null;
              }) => {
                dismissed = false;
                selected = 0;
                latest = { items: props.items, command: props.command };
                root = document.createElement('div');
                paint();
                // Body + fixed strategy: CSS `zoom` on `.main` breaks Popper math when
                // the tippy is a descendant of the zoomed tree (menus land off-caret).
                // Scale is applied on `.rich-slash-menu` via `--ui-scale` instead.
                const reference =
                  props.editor.view.dom.closest('.rich-editor') ?? props.editor.view.dom;
                const tippyProps: Partial<TippyProps> = {
                  getReferenceClientRect: tippyRect(props.clientRect),
                  appendTo: () => document.body,
                  content: root,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                  theme: 'cadence-slash',
                  maxWidth: 320,
                  popperOptions: { strategy: 'fixed' },
                };
                const instances = tippy(reference, tippyProps);
                popup = Array.isArray(instances) ? instances[0]! : instances;
              },

              onUpdate: (props: {
                items: SlashCommandItem[];
                command: (item: SlashCommandItem) => void;
                clientRect?: (() => DOMRect | null) | null;
              }) => {
                if (dismissed) {
                  popup?.hide();
                  return;
                }
                selected = 0;
                latest = { items: props.items, command: props.command };
                paint();
                popup?.setProps({
                  getReferenceClientRect: tippyRect(props.clientRect),
                });
              },

              onKeyDown: (props: { event: KeyboardEvent }) => {
                if (props.event.key === 'Escape') {
                  // Hide alone leaves the Suggestion session active — Enter would
                  // still run the selected command invisibly. Tear down and ignore
                  // keys until onExit/onStart for the next `/` session.
                  dismissed = true;
                  latest = null;
                  teardownPopup();
                  return true;
                }
                if (dismissed || !latest) return false;
                if (props.event.key === 'ArrowUp') {
                  props.event.preventDefault();
                  selected = (selected + latest.items.length - 1) % Math.max(latest.items.length, 1);
                  paint();
                  return true;
                }
                if (props.event.key === 'ArrowDown') {
                  props.event.preventDefault();
                  selected = (selected + 1) % Math.max(latest.items.length, 1);
                  paint();
                  return true;
                }
                if (props.event.key === 'Enter') {
                  props.event.preventDefault();
                  const item = latest.items[selected];
                  if (item) latest.command(item);
                  return true;
                }
                return false;
              },

              onExit: () => {
                dismissed = false;
                teardownPopup();
              },
            };
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: import('@tiptap/core').Editor;
            range: import('@tiptap/core').Range;
            props: SlashCommandItem;
          }) => {
            props.run(editor, range);
          },
        } satisfies Partial<SuggestionOptions<SlashCommandItem>>,
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}
