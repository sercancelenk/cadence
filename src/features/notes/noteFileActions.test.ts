import { describe, expect, it, vi } from 'vitest';
import type { Note } from '../../model';
import {
  isSaveNoteShortcut,
  saveNoteToDisk,
  type SaveNoteDeps,
  type SaveNotePayload,
} from './noteFileActions';

const doc = (text: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'Plan',
    body: doc('hello'),
    bodyFormat: 'prosemirror',
    locked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function deps(over: Partial<SaveNoteDeps> = {}) {
  const calls: string[] = [];
  const saveFile = vi.fn(async (_payload: SaveNotePayload) => {
    calls.push('save');
    return { ok: true, path: '/tmp/Plan.md' };
  });
  const base: SaveNoteDeps = {
    getNote: () => note(),
    getLockedBody: () => null,
    flush: vi.fn(async () => {
      calls.push('flush');
    }),
    saveFile,
    format: 'md',
    notify: { success: vi.fn(), error: vi.fn() },
    ...over,
  };
  return { base, calls, saveFile };
}

describe('saveNoteToDisk', () => {
  it('flushes pending edits first, then saves the converted note under a title-based name', async () => {
    const { base, calls, saveFile } = deps();
    await expect(saveNoteToDisk(base)).resolves.toBe('saved');
    expect(calls).toEqual(['flush', 'save']);
    expect(saveFile).toHaveBeenCalledWith({
      suggestedName: 'Plan.md',
      format: 'md',
      content: '# Plan\n\nhello\n',
    });
    expect(base.notify.success).toHaveBeenCalledTimes(1);
  });

  it('honours the chosen format', async () => {
    const { base, saveFile } = deps({ format: 'txt' });
    await saveNoteToDisk(base);
    expect(saveFile).toHaveBeenCalledWith({
      suggestedName: 'Plan.txt',
      format: 'txt',
      content: 'Plan\n\nhello\n',
    });
  });

  it('reads the note after the flush so the latest keystrokes are saved', async () => {
    let current = note({ body: doc('old') });
    const { base, saveFile } = deps({
      getNote: () => current,
      flush: async () => {
        current = note({ body: doc('new') });
      },
    });
    await saveNoteToDisk(base);
    expect(saveFile.mock.calls[0]![0].content).toContain('new');
  });

  it('refuses to write a locked note whose body is not unlocked', async () => {
    const { base, saveFile } = deps({ getNote: () => note({ locked: true, body: '' }) });
    await expect(saveNoteToDisk(base)).resolves.toBe('locked');
    expect(saveFile).not.toHaveBeenCalled();
    expect(base.notify.error).toHaveBeenCalledTimes(1);
  });

  it('saves the decrypted body of an unlocked-in-session locked note', async () => {
    const { base, saveFile } = deps({
      getNote: () => note({ locked: true, body: '' }),
      getLockedBody: () => ({ body: doc('secret'), bodyFormat: 'prosemirror' }),
    });
    await expect(saveNoteToDisk(base)).resolves.toBe('saved');
    expect(saveFile.mock.calls[0]![0].content).toContain('secret');
  });

  it('writes a valid file for an empty note', async () => {
    const { base, saveFile } = deps({ getNote: () => note({ title: '', body: '', bodyFormat: undefined }) });
    await expect(saveNoteToDisk(base)).resolves.toBe('saved');
    expect(saveFile.mock.calls[0]![0]).toMatchObject({ suggestedName: 'New note.md', content: '# New note\n' });
  });

  it('stays silent when the user cancels the dialog', async () => {
    const { base } = deps({ saveFile: vi.fn(async (_p: SaveNotePayload) => ({ ok: false, canceled: true })) });
    await expect(saveNoteToDisk(base)).resolves.toBe('canceled');
    expect(base.notify.success).not.toHaveBeenCalled();
    expect(base.notify.error).not.toHaveBeenCalled();
  });

  it('reports write failures', async () => {
    const { base } = deps({ saveFile: vi.fn(async (_p: SaveNotePayload) => ({ ok: false, error: 'disk full' })) });
    await expect(saveNoteToDisk(base)).resolves.toBe('error');
    expect(base.notify.error).toHaveBeenCalledWith('Could not save note', 'disk full');
  });

  it('explains when the desktop bridge is unavailable', async () => {
    const { base } = deps({ saveFile: undefined });
    await expect(saveNoteToDisk(base)).resolves.toBe('error');
    expect(base.notify.error).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a selected note', async () => {
    const { base, saveFile } = deps({ getNote: () => undefined });
    await expect(saveNoteToDisk(base)).resolves.toBe('none');
    expect(saveFile).not.toHaveBeenCalled();
  });
});

describe('isSaveNoteShortcut', () => {
  const ev = (o: Partial<KeyboardEvent>) => o as KeyboardEvent;
  it('matches Cmd+S and Ctrl+S, case-insensitively', () => {
    expect(isSaveNoteShortcut(ev({ key: 's', metaKey: true }))).toBe(true);
    expect(isSaveNoteShortcut(ev({ key: 'S', ctrlKey: true }))).toBe(true);
  });
  it('ignores plain s, Shift+Cmd+S and Alt+Cmd+S', () => {
    expect(isSaveNoteShortcut(ev({ key: 's' }))).toBe(false);
    expect(isSaveNoteShortcut(ev({ key: 's', metaKey: true, shiftKey: true }))).toBe(false);
    expect(isSaveNoteShortcut(ev({ key: 's', metaKey: true, altKey: true }))).toBe(false);
  });
});
