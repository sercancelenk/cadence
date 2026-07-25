import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openQuickAdd,
  openQuickAddMenu,
  QUICK_ADD_MENU_EVENT,
  QUICK_ADD_OPEN_EVENT,
} from './quickAddEvents';

describe('quickAddEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches open with the requested mode', () => {
    const spy = vi.fn();
    window.addEventListener(QUICK_ADD_OPEN_EVENT, spy);
    openQuickAdd('task');
    expect(spy).toHaveBeenCalledOnce();
    const event = spy.mock.calls[0]![0] as CustomEvent<{ mode: string }>;
    expect(event.detail).toEqual({ mode: 'task' });
    window.removeEventListener(QUICK_ADD_OPEN_EVENT, spy);
  });

  it('dispatches the floating menu event', () => {
    const spy = vi.fn();
    window.addEventListener(QUICK_ADD_MENU_EVENT, spy);
    openQuickAddMenu();
    expect(spy).toHaveBeenCalledOnce();
    expect((spy.mock.calls[0]![0] as Event).type).toBe(QUICK_ADD_MENU_EVENT);
    window.removeEventListener(QUICK_ADD_MENU_EVENT, spy);
  });
});
