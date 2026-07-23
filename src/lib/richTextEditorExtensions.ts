import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import type { Extensions } from '@tiptap/core';
import { RichTextCodeBlock } from './richTextCodeBlock';
import { DateChip } from './richTextDateChip';
import { RichTextSearchExtension } from './richTextSearch';
import { RichTextTable } from './richTextTable';

const IMAGE_MIN_WIDTH = 48;

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Only http(s) and mailto links may be stored/auto-linked/pasted in the editor.
 * This blocks `javascript:`, `data:`, `vbscript:`, `file:` and similar hostile
 * hrefs from being persisted in note JSON and rendered as live anchors. Mirrors
 * the preview-side policy in `richTextPreviewLinks.isSafeRichTextPreviewHref`.
 */
export function isSafeEditorLinkUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

function applyImageNodeAttrs(
  img: HTMLImageElement,
  wrapper: HTMLDivElement,
  attrs: Record<string, unknown>,
) {
  const src = typeof attrs.src === 'string' ? attrs.src : '';
  img.src = src;
  if (typeof attrs.alt === 'string' && attrs.alt) img.alt = attrs.alt;
  else img.removeAttribute('alt');
  if (typeof attrs.title === 'string' && attrs.title) img.title = attrs.title;
  else img.removeAttribute('title');
  if (typeof attrs.attachmentId === 'string' && attrs.attachmentId) {
    img.dataset.attachmentId = attrs.attachmentId;
  } else {
    delete img.dataset.attachmentId;
  }
  const width = typeof attrs.width === 'number' ? attrs.width : null;
  if (width && width > 0) {
    wrapper.style.width = `${width}px`;
    wrapper.dataset.hasWidth = 'true';
  } else {
    wrapper.style.width = '';
    delete wrapper.dataset.hasWidth;
  }
}

/** Image node with optional sidecar attachment id (stable across blob URL hydration). */
export const RichTextImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-attachment-id'),
        renderHTML: (attrs) =>
          attrs.attachmentId ? { 'data-attachment-id': attrs.attachmentId } : {},
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width') ?? el.getAttribute('data-width');
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) =>
          attrs.width ? { width: attrs.width, 'data-width': attrs.width } : {},
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const h = el.getAttribute('height') ?? el.getAttribute('data-height');
          return h ? Number(h) : null;
        },
        renderHTML: (attrs) =>
          attrs.height ? { height: attrs.height, 'data-height': attrs.height } : {},
      },
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let isSelected = false;
      const wrapper = document.createElement('div');
      wrapper.className = 'rich-editor-image-wrap';
      wrapper.contentEditable = 'false';

      const img = document.createElement('img');
      img.className = 'rich-editor-image';
      img.draggable = false;

      applyImageNodeAttrs(img, wrapper, node.attrs);

      let handle: HTMLSpanElement | null = null;
      let resizeCleanup: (() => void) | null = null;

      const removeHandle = () => {
        if (resizeCleanup) {
          resizeCleanup();
          resizeCleanup = null;
        }
        if (handle) {
          handle.remove();
          handle = null;
        }
      };

      const maxEditorWidth = () => {
        const surface = wrapper.closest('.rich-editor__surface');
        return surface?.clientWidth ?? 720;
      };

      const onResizeStart = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = wrapper.getBoundingClientRect().width;
        const naturalW = img.naturalWidth || startW;
        const naturalH = img.naturalHeight || startW;
        const aspect = naturalH / naturalW;

        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX;
          const maxW = maxEditorWidth();
          const newW = Math.round(Math.min(maxW, Math.max(IMAGE_MIN_WIDTH, startW + dx)));
          wrapper.style.width = `${newW}px`;
          wrapper.dataset.hasWidth = 'true';
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          resizeCleanup = null;
          const w = Math.round(wrapper.getBoundingClientRect().width);
          const h = Math.round(w * aspect);
          const pos = typeof getPos === 'function' ? getPos() : undefined;
          if (typeof pos === 'number') {
            editor
              .chain()
              .focus()
              .setNodeSelection(pos)
              .updateAttributes('image', { width: w, height: h })
              .run();
          }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        resizeCleanup = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
      };

      const ensureHandle = () => {
        if (!editor.isEditable || !isSelected) {
          removeHandle();
          return;
        }
        if (!handle) {
          handle = document.createElement('span');
          handle.className = 'rich-editor-image__resize-handle';
          handle.title = 'Drag to resize';
          handle.addEventListener('mousedown', onResizeStart);
          wrapper.appendChild(handle);
        }
      };

      wrapper.appendChild(img);

      return {
        dom: wrapper,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'image') return false;
          applyImageNodeAttrs(img, wrapper, updatedNode.attrs);
          return true;
        },
        selectNode: () => {
          isSelected = true;
          wrapper.classList.add('is-selected');
          ensureHandle();
        },
        deselectNode: () => {
          isSelected = false;
          wrapper.classList.remove('is-selected');
          removeHandle();
        },
        destroy: () => {
          removeHandle();
        },
      };
    };
  },
});

/**
 * Single extension list shared by RichTextEditor and markdown import so
 * `generateJSON(html)` produces the same node types the live editor uses.
 */
export function createRichTextExtensions(placeholder = 'Write here…'): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Replaced by RichTextCodeBlock (lowlight + Mermaid chrome).
      codeBlock: false,
      blockquote: {},
    }),
    RichTextCodeBlock,
    Underline,
    Highlight.configure({
      multicolor: false,
      HTMLAttributes: {
        class: 'rich-editor-highlight',
      },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      // Reject unsafe protocols (javascript:, data:, vbscript:, file:, …) from
      // autolink AND from pasted/imported HTML so they can never be stored in
      // note JSON or rendered as a live href. `isAllowedUri` is the XSS gate for
      // parsed HTML; `shouldAutoLink` restricts auto-detected links. Programmatic
      // `setLink` bypasses both, so the toolbar validates separately (see
      // RichTextEditor.applyLink).
      shouldAutoLink: isSafeEditorLinkUrl,
      isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && isSafeEditorLinkUrl(url),
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    RichTextImage.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: {
        class: 'rich-editor-image',
      },
    }),
    RichTextTable.configure({
      resizable: true,
      cellMinWidth: 48,
      HTMLAttributes: {
        class: 'rich-editor-table',
      },
    }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    DateChip,
    // In-editor find & replace (⌘F). Inert until a query is set; adds no
    // nodes/marks so it's safe in the shared markdown-import extension list too.
    RichTextSearchExtension,
    Placeholder.configure({ placeholder }),
  ];
}
