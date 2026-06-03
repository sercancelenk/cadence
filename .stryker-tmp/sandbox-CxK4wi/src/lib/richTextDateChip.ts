// @ts-nocheck
import { mergeAttributes, Node } from '@tiptap/core';

export type DateChipAttrs = {
  iso: string;
  label: string;
};

/** Display label for a YYYY-MM-DD (or full ISO) value. */
export function formatDateChipLabel(iso: string): string {
  const day = iso.slice(0, 10);
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dateChip: {
      insertDateChip: (attrs?: Partial<DateChipAttrs>) => ReturnType;
    };
  }
}

/**
 * Inline, atomic date pill — stored as structured JSON (not HTML).
 * `iso` is the source of truth; `label` is denormalised for display/search.
 */
export const DateChip = Node.create({
  name: 'dateChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      iso: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-iso'),
        renderHTML: (attrs) => ({ 'data-iso': attrs.iso }),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-label') ?? el.textContent,
        renderHTML: (attrs) => ({ 'data-label': attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'time[data-date-chip]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const iso = node.attrs.iso as string | null;
    const label = (node.attrs.label as string | null) ?? (iso ? formatDateChipLabel(iso) : 'Date');
    return [
      'time',
      mergeAttributes(HTMLAttributes, {
        'data-date-chip': '',
        datetime: iso ?? undefined,
        class: 'rich-editor-date-chip',
      }),
      label,
    ];
  },

  addCommands() {
    return {
      insertDateChip:
        (attrs) =>
        ({ commands }) => {
          const iso = attrs?.iso?.slice(0, 10) ?? todayIsoDate();
          const label = attrs?.label ?? formatDateChipLabel(iso);
          return commands.insertContent({
            type: this.name,
            attrs: { iso, label },
          });
        },
    };
  },
});
