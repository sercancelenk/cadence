import Table from '@tiptap/extension-table';
import { columnResizing, tableEditing } from '@tiptap/pm/tables';

/**
 * TipTap Table with column resize that works when the editor mounts in preview
 * (`editable: false`) and later becomes editable.
 *
 * Stock TipTap only registers `columnResizing` if `editor.isEditable` at init
 * (tiptap#6794 / #2041) — Notes/Todos open in preview first, so drag-resize
 * never appeared after Edit. We always register the plugin when `resizable`
 * is on; CSS hides handles while `contenteditable` is false.
 *
 * Row heights stay content-driven — `prosemirror-tables` has no row-drag API.
 */
export const RichTextTable = Table.extend({
  addProseMirrorPlugins() {
    const isResizable = this.options.resizable;

    return [
      ...(isResizable
        ? [
            columnResizing({
              handleWidth: this.options.handleWidth,
              cellMinWidth: this.options.cellMinWidth,
              defaultCellMinWidth: this.options.cellMinWidth,
              View: this.options.View,
              lastColumnResizable: this.options.lastColumnResizable,
            }),
          ]
        : []),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
    ];
  },
});
