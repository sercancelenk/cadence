import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import type { Extensions } from '@tiptap/core';
import { DateChip } from './richTextDateChip';

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
});

/**
 * Single extension list shared by RichTextEditor and markdown import so
 * `generateJSON(html)` produces the same node types the live editor uses.
 */
export function createRichTextExtensions(placeholder = 'Write here…'): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: {},
      blockquote: {},
    }),
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
        loading: 'lazy',
      },
    }),
    Table.configure({
      resizable: true,
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
    Placeholder.configure({ placeholder }),
  ];
}
