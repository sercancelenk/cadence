import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToolFileSave } from './useToolFileSave';

const file = { suggestedName: 'a.md', defaultExt: 'md', extensions: ['md'], variants: { md: '# a' } };
const press = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));
const shiftCmdS = { key: 'S', metaKey: true, shiftKey: true };

function setup(over: Partial<Parameters<typeof useToolFileSave>[0]> = {}) {
  const calls: string[] = [];
  const deps = {
    active: true,
    getFile: vi.fn(() => {
      calls.push('getFile');
      return file;
    }),
    flush: vi.fn(async () => {
      calls.push('flush');
    }),
    saveFile: vi.fn(async () => ({ ok: true, path: '/tmp/a.md' })),
    notify: { success: vi.fn(), error: vi.fn() },
    ...over,
  };
  renderHook(() => useToolFileSave(deps));
  return { deps, calls };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('useToolFileSave', () => {
  afterEach(cleanup);

  it('flushes first, then saves the current file on Shift+Cmd+S', async () => {
    const { deps, calls } = setup();
    press(shiftCmdS);
    await settle();
    expect(calls).toEqual(['flush', 'getFile']);
    expect(deps.saveFile).toHaveBeenCalledWith(file);
    expect(deps.notify.success).toHaveBeenCalledTimes(1);
  });

  it('also reacts to Ctrl+Shift+S and prevents the browser default', () => {
    setup();
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('ignores plain Cmd+S, which is the immediate save', async () => {
    const { deps } = setup();
    press({ key: 's', metaKey: true });
    await settle();
    expect(deps.flush).not.toHaveBeenCalled();
    expect(deps.saveFile).not.toHaveBeenCalled();
  });

  it('registers nothing while inactive', async () => {
    const { deps } = setup({ active: false });
    press(shiftCmdS);
    await settle();
    expect(deps.saveFile).not.toHaveBeenCalled();
  });

  it('ignores a second press while a save is still running', async () => {
    let release!: () => void;
    const saveFile = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => { release = () => resolve({ ok: true }); }));
    const { deps } = setup({ saveFile });
    press(shiftCmdS);
    await settle();
    press(shiftCmdS);
    await settle();
    expect(deps.saveFile).toHaveBeenCalledTimes(1);
    release();
    await settle();
  });

  it('says so when there is no desktop bridge', async () => {
    const { deps } = setup({ saveFile: undefined });
    press(shiftCmdS);
    await settle();
    expect(deps.notify.error).toHaveBeenCalledWith('Saving files needs the desktop app');
  });

  it('is silent when the dialog is cancelled and reports a failure', async () => {
    const cancelled = setup({ saveFile: vi.fn(async () => ({ ok: false, canceled: true })) });
    press(shiftCmdS);
    await settle();
    expect(cancelled.deps.notify.success).not.toHaveBeenCalled();
    expect(cancelled.deps.notify.error).not.toHaveBeenCalled();
    cleanup();

    const failed = setup({ saveFile: vi.fn(async () => ({ ok: false, error: 'disk full' })) });
    press(shiftCmdS);
    await settle();
    expect(failed.deps.notify.error).toHaveBeenCalledWith('Could not save file', 'disk full');
  });

  it('does nothing when there is no file to save', async () => {
    const { deps } = setup({ getFile: vi.fn(() => null) });
    press(shiftCmdS);
    await settle();
    expect(deps.saveFile).not.toHaveBeenCalled();
  });

  it('tells the user when the save call throws, and can be used again afterwards', async () => {
    const saveFile = vi.fn().mockRejectedValueOnce(new Error('ipc exploded')).mockResolvedValue({ ok: true, path: '/tmp/a.md' });
    const { deps } = setup({ saveFile });
    press(shiftCmdS);
    await settle();
    expect(deps.notify.error).toHaveBeenCalledWith('Could not save file', 'ipc exploded');
    press(shiftCmdS);
    await settle();
    expect(deps.notify.success).toHaveBeenCalledTimes(1);
  });

  it('tells the user when draining the editor throws', async () => {
    const { deps } = setup({ flush: vi.fn(async () => { throw new Error('flush failed'); }) });
    press(shiftCmdS);
    await settle();
    expect(deps.notify.error).toHaveBeenCalledWith('Could not save file', 'flush failed');
    expect(deps.saveFile).not.toHaveBeenCalled();
  });
});

