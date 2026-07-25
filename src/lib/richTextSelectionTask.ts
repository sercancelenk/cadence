/**
 * Pure helpers for “Create task from selection” in the rich-text bubble.
 * No TipTap UI imports — callers pass a minimal selection/doc surface.
 */

/** Hard cap so a huge selection cannot become an unwieldy todo title. */
export const RICH_TEXT_TASK_TITLE_MAX = 200;

export type SelectionTextSource = {
  state: {
    selection: { from: number; to: number; empty: boolean };
    doc: {
      textBetween: (
        from: number,
        to: number,
        blockSeparator?: string,
        leafText?: string | null,
      ) => string;
    };
  };
};

/**
 * Derive a single-line todo title from the current non-empty selection.
 * Returns null when there is nothing usable (empty caret, whitespace-only).
 */
export function taskTitleFromEditorSelection(editor: SelectionTextSource): string | null {
  const { from, to, empty } = editor.state.selection;
  if (empty || from === to) return null;
  const raw = editor.state.doc.textBetween(from, to, ' ', ' ');
  // Drop C0 controls / DEL so a weird selection cannot become a noisy title.
  const collapsed = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return null;
  if (collapsed.length <= RICH_TEXT_TASK_TITLE_MAX) return collapsed;
  // Prefer a clean break at a word boundary when truncating.
  const sliced = collapsed.slice(0, RICH_TEXT_TASK_TITLE_MAX);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace >= Math.floor(RICH_TEXT_TASK_TITLE_MAX * 0.6)) {
    return sliced.slice(0, lastSpace).trimEnd();
  }
  return sliced.trimEnd();
}
