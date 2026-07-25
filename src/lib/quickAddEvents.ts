/** Window events so ⌘K / menus can open QuickAdd without duplicating create logic. */

export const QUICK_ADD_OPEN_EVENT = 'quickadd:open';
export const QUICK_ADD_MENU_EVENT = 'quickadd:menu';

export type QuickAddMode = 'task' | 'note';

export type QuickAddOpenDetail = {
  mode: QuickAddMode;
};

export function openQuickAdd(mode: QuickAddMode): void {
  window.dispatchEvent(
    new CustomEvent<QuickAddOpenDetail>(QUICK_ADD_OPEN_EVENT, { detail: { mode } }),
  );
}

/** Open the floating + menu (same as clicking the FAB). */
export function openQuickAddMenu(): void {
  window.dispatchEvent(new Event(QUICK_ADD_MENU_EVENT));
}
