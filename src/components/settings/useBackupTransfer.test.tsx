import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeData, type AppData } from '../../model';

const TS = '2026-06-01T12:00:00.000Z';
const note = (id: string, title: string) => ({ id, title, body: '', createdAt: TS, updatedAt: TS });

const h = vi.hoisted(() => ({
  toast: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() },
  flush: vi.fn(async () => undefined),
  sync: vi.fn(async () => undefined),
  importWorkspace: vi.fn(async () => ({ ok: true as const })),
  latest: { current: null as unknown as AppData },
  exportZip: vi.fn(),
  openFile: vi.fn(),
}));
vi.mock('../ui/Toast', () => ({ useToast: () => h.toast }));
vi.mock('../../AccountContext', () => ({ useAccount: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../AppDataContext', () => ({
  useAppData: () => ({
    flushPendingSave: h.flush,
    syncFromDisk: h.sync,
    importWorkspace: h.importWorkspace,
    getLatestSnapshot: () => h.latest.current,
  }),
}));
vi.mock('../../lib/syncApplyGuard', () => ({ prepareForRemoteApply: async () => undefined }));
vi.mock('../../lib/backupBundle', () => ({
  exportPortableBackupZip: h.exportZip,
  openPortableBackupFile: h.openFile,
}));

import { useBackupTransfer } from './useBackupTransfer';

type Cad = Record<string, ReturnType<typeof vi.fn>>;
let cad: Cad;

const local = () => normalizeData({ notes: [note('mine', 'Mine')], aiSettings: { provider: 'openai', apiKey: 'sk-local-secret' } });
const backupWorkspace = () => JSON.parse(JSON.stringify(normalizeData({ notes: [note('theirs', 'Theirs'), note('mine', 'Mine')] })));

function openedOk(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    token: 'tok',
    kind: 'zip',
    fileName: 'b.zip',
    workspace: backupWorkspace(),
    counts: { notes: 2, todoItems: 0, teams: 0 },
    attachments: { count: 1, skippedAtExport: 0 },
    history: { notes: 0, revisions: 0 },
    ...over,
  };
}

beforeEach(() => {
  Object.values(h.toast).forEach((f) => f.mockClear());
  h.flush.mockClear();
  h.sync.mockClear();
  h.latest.current = local();
  h.flush.mockImplementation(async () => undefined);
  h.sync.mockImplementation(async () => undefined);
  cad = {
    loadDataResult: vi.fn(async () => ({ ok: true, data: JSON.parse(JSON.stringify(h.latest.current)), writeGeneration: 7 })),
    saveData: vi.fn(),
    backupArchiveOpen: vi.fn(),
    backupArchiveApply: vi.fn(async () => ({ ok: true, attachmentsRestored: 1, attachmentsFailed: 0, attachmentsSkipped: 0, historyIncomplete: false })),
    backupArchiveExport: vi.fn(),
  };
  window.cadence = cad as unknown as typeof window.cadence;
});
afterEach(() => {
  cleanup();
  window.cadence = undefined;
});

const setup = (onReplaced = vi.fn()) => ({ ...renderHook(() => useBackupTransfer({ onReplaced })), onReplaced });

describe('importing on the desktop app', () => {
  it('shows nothing when the file dialog is cancelled', async () => {
    cad.backupArchiveOpen!.mockResolvedValue({ ok: false, canceled: true });
    const { result } = setup();
    await act(() => result.current.startImport());
    expect(result.current.dialog).toBeNull();
    expect(h.toast.showError).not.toHaveBeenCalled();
  });

  it('explains a file that cannot be used and opens no dialog', async () => {
    cad.backupArchiveOpen!.mockResolvedValue({ ok: false, error: 'Backup is missing data.json.' });
    const { result } = setup();
    await act(() => result.current.startImport());
    expect(result.current.dialog).toBeNull();
    expect(h.toast.showError).toHaveBeenCalledWith('Import failed', 'Backup is missing data.json.');
  });

  it('opens the dialog with what is inside and what is here now', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result } = setup();
    await act(() => result.current.startImport());
    expect(result.current.dialog?.preview).toMatchObject({ fileName: 'b.zip', images: 1 });
    expect(result.current.dialog?.current).toEqual({ notes: 1, todoItems: 0 });
    expect(cad.backupArchiveApply).not.toHaveBeenCalled();
  });

  it('adds: applies this device\'s items plus the backup\'s, and says what was added', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result, onReplaced } = setup();
    await act(() => result.current.startImport());
    await act(() => result.current.confirmImport('merge'));

    expect(h.flush).toHaveBeenCalled();
    const sent = cad.backupArchiveApply!.mock.calls[0]![0] as { token: string; workspace: AppData; mode: string; expectedGeneration: number };
    expect(sent.token).toBe('tok');
    expect(sent.mode).toBe('merge');
    expect(sent.expectedGeneration).toBe(7);
    expect(sent.workspace.notes.map((n) => n.id).sort()).toEqual(['mine', 'theirs']);
    expect(sent.workspace.aiSettings?.apiKey).toBe('sk-local-secret');
    expect(h.sync).toHaveBeenCalled();
    expect(h.toast.showSuccess).toHaveBeenCalledWith('Backup imported', expect.stringMatching(/1 note.*1 image restored/s));
    expect(onReplaced).not.toHaveBeenCalled();
    expect(result.current.dialog).toBeNull();
  });

  it('replaces: applies the backup as it is, keeps this device\'s AI key, and checks the Notes recovery', async () => {
    // An export keeps the AI settings but not the key; the key this device has is put back.
    const exported = backupWorkspace();
    exported.aiSettings = { provider: 'openai', apiKey: '' };
    cad.backupArchiveOpen!.mockResolvedValue(openedOk({ workspace: exported }));
    const { result, onReplaced } = setup();
    await act(() => result.current.startImport());
    await act(() => result.current.confirmImport('replace'));

    const sent = cad.backupArchiveApply!.mock.calls[0]![0] as { workspace: AppData; mode: string; expectedGeneration: number };
    expect(sent.mode).toBe('replace');
    expect(sent.expectedGeneration).toBe(7);
    expect(sent.workspace.notes.map((n) => n.id).sort()).toEqual(['mine', 'theirs']);
    expect(sent.workspace.aiSettings?.apiKey).toBe('sk-local-secret');
    expect(onReplaced).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open and says why when the import is refused, so it can be tried again', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    cad.backupArchiveApply!.mockResolvedValueOnce({ ok: false, error: 'Could not save a safety copy of your current data first, so nothing was changed.' });
    const { result } = setup();
    await act(() => result.current.startImport());
    await act(() => result.current.confirmImport('replace'));

    expect(h.toast.showError).toHaveBeenCalledWith('Import failed', expect.stringMatching(/nothing was changed/));
    expect(result.current.dialog).not.toBeNull();
    expect(result.current.busy).toBe(false);
    expect(h.sync).not.toHaveBeenCalled();
  });

  it('shows the main process\'s reason when the workspace changed meanwhile, and lets the user try again', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    cad.backupArchiveApply!.mockResolvedValueOnce({ ok: false, reason: 'write-conflict', error: 'Your workspace changed while this import was open. Nothing was changed — try again.' });
    const { result } = setup();
    await act(() => result.current.startImport());
    await act(() => result.current.confirmImport('merge'));
    expect(h.toast.showError).toHaveBeenCalledWith('Import failed', expect.stringMatching(/workspace changed.*try again/));
    expect(result.current.dialog).not.toBeNull();
    // A second try builds the merge again from what is on disk now.
    await act(() => result.current.confirmImport('merge'));
    expect(cad.backupArchiveApply).toHaveBeenCalledTimes(2);
    expect(result.current.dialog).toBeNull();
  });

  it('opens only one file dialog when started twice in the same instant', async () => {
    let release: (v: unknown) => void = () => undefined;
    cad.backupArchiveOpen!.mockReturnValue(new Promise((r) => (release = r)));
    const { result } = setup();
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.startImport();
      void result.current.startImport();
      release({ ok: false, canceled: true });
      await first;
    });
    expect(cad.backupArchiveOpen).toHaveBeenCalledTimes(1);
  });

  it('confirms only once when clicked twice in the same instant', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result } = setup();
    await act(() => result.current.startImport());
    await act(async () => {
      void result.current.confirmImport('merge');
      await result.current.confirmImport('merge');
    });
    expect(cad.backupArchiveApply).toHaveBeenCalledTimes(1);
  });

  it('warns that the import is incomplete, and still reloads, when some images or history were missed', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    cad.backupArchiveApply!.mockResolvedValueOnce({ ok: true, attachmentsRestored: 0, attachmentsFailed: 2, attachmentsSkipped: 0, historyIncomplete: true });
    const { result } = setup();
    await act(() => result.current.startImport());
    await act(() => result.current.confirmImport('merge'));

    expect(h.sync).toHaveBeenCalled();
    expect(h.toast.showWarning).toHaveBeenCalledWith('Backup imported, but incomplete', expect.stringMatching(/2 images could not be copied/));
    expect(h.toast.showSuccess).not.toHaveBeenCalled();
  });

  it('adds to what is on disk, not to a view of it that may be behind', async () => {
    // Something reached the disk (a second window, a late autosave) that this window never saw.
    h.latest.current = local();
    const onDisk = normalizeData({ notes: [note('mine', 'Mine'), note('disk-only', 'Only on disk')], aiSettings: { provider: 'openai', apiKey: 'sk-local-secret' } });
    cad.loadDataResult!.mockResolvedValue({ ok: true, data: JSON.parse(JSON.stringify(onDisk)), writeGeneration: 12 });
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result } = setup();
    await act(() => result.current.startImport());
    await act(() => result.current.confirmImport('merge'));

    const sent = cad.backupArchiveApply!.mock.calls[0]![0] as { workspace: AppData; expectedGeneration: number };
    expect(sent.workspace.notes.map((n) => n.id).sort()).toEqual(['disk-only', 'mine', 'theirs']);
    expect(sent.expectedGeneration).toBe(12);
  });

  it('does not add to data that cannot be read, and says so', async () => {
    cad.loadDataResult!.mockResolvedValue({ ok: false, reason: 'bad-key', writeGeneration: 3 });
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result } = setup();
    await act(() => result.current.startImport());
    await act(() => result.current.confirmImport('merge'));

    expect(cad.backupArchiveApply).not.toHaveBeenCalled();
    expect(h.toast.showError).toHaveBeenCalledWith('Import failed', expect.stringMatching(/could not be read/));
    expect(result.current.dialog).not.toBeNull();
  });

  it('still lets unreadable data be replaced from a backup', async () => {
    cad.loadDataResult!.mockResolvedValue({ ok: false, reason: 'bad-key', writeGeneration: 3 });
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result } = setup();
    await act(() => result.current.startImport());
    await act(() => result.current.confirmImport('replace'));
    const sent = cad.backupArchiveApply!.mock.calls[0]![0] as { mode: string; expectedGeneration: number };
    expect(sent).toMatchObject({ mode: 'replace', expectedGeneration: 3 });
  });

  it('does not start when the latest edits could not be saved first', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result } = setup();
    await act(() => result.current.startImport());
    h.flush.mockRejectedValueOnce(new Error('disk full'));
    await act(() => result.current.confirmImport('merge'));

    expect(cad.backupArchiveApply).not.toHaveBeenCalled();
    expect(h.toast.showError).toHaveBeenCalledWith('Import failed', expect.stringMatching(/latest changes could not be saved/));
    expect(result.current.dialog).not.toBeNull();
  });

  it('closes the dialog and warns, instead of offering a retry, when the screen cannot refresh after the import went through', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result } = setup();
    await act(() => result.current.startImport());
    h.sync.mockRejectedValueOnce(new Error('reload failed'));
    await act(() => result.current.confirmImport('merge'));

    expect(h.toast.showWarning).toHaveBeenCalledWith('Backup imported', expect.stringMatching(/restart|reopen/i));
    expect(result.current.dialog).toBeNull();
    expect(h.toast.showError).not.toHaveBeenCalled();
  });

  it('closes without applying when cancelled', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk());
    const { result } = setup();
    await act(() => result.current.startImport());
    act(() => result.current.cancelImport());
    expect(result.current.dialog).toBeNull();
    expect(cad.backupArchiveApply).not.toHaveBeenCalled();
  });

  it('refuses a workspace file that is from a newer version of the app', async () => {
    cad.backupArchiveOpen!.mockResolvedValue(openedOk({ workspace: { version: 9999, notes: [] } }));
    const { result } = setup();
    await act(() => result.current.startImport());
    expect(result.current.dialog).toBeNull();
    expect(h.toast.showError).toHaveBeenCalledWith('Import failed', expect.any(String));
  });
});

describe('exporting on the desktop app', () => {
  it('saves one file and reminds that it is not encrypted', async () => {
    cad.backupArchiveExport!.mockResolvedValue({ ok: true, path: '/x/b.zip', attachmentCount: 3, attachmentsSkipped: 0, noteHistoryRevisionCount: 5 });
    const { result } = setup();
    await act(() => result.current.exportBackup());
    expect(h.toast.showSuccess).toHaveBeenCalledWith('Backup saved', expect.stringMatching(/\/x\/b\.zip.*3 images.*5 versions.*not encrypted/s));
  });

  it('sends the workspace without any AI key', async () => {
    cad.backupArchiveExport!.mockResolvedValue({ ok: true, path: '/x/b.zip' });
    const { result } = setup();
    await act(() => result.current.exportBackup());
    expect(JSON.stringify(cad.backupArchiveExport!.mock.calls[0]![0])).not.toContain('sk-local-secret');
  });

  it('warns, instead of reporting success, when images could not be included', async () => {
    cad.backupArchiveExport!.mockResolvedValue({ ok: true, path: '/x/b.zip', attachmentCount: 3, attachmentsSkipped: 2 });
    const { result } = setup();
    await act(() => result.current.exportBackup());
    expect(h.toast.showWarning).toHaveBeenCalledWith('Backup saved, but incomplete', expect.stringMatching(/2 images could not be read/));
    expect(h.toast.showSuccess).not.toHaveBeenCalled();
  });

  it('stays quiet when the save dialog is cancelled', async () => {
    cad.backupArchiveExport!.mockResolvedValue({ ok: false, canceled: true });
    const { result } = setup();
    await act(() => result.current.exportBackup());
    expect(h.toast.showError).not.toHaveBeenCalled();
    expect(h.toast.showSuccess).not.toHaveBeenCalled();
  });

  it('points to the folder export when the library is too big for one file', async () => {
    cad.backupArchiveExport!.mockResolvedValue({ ok: false, error: 'This library has too many files for a single ZIP.' });
    const { result } = setup();
    await act(() => result.current.exportBackup());
    expect(h.toast.showError).toHaveBeenCalledWith('Export failed', expect.stringMatching(/too many files.*Advanced/s));
  });
});

describe('in a browser', () => {
  beforeEach(() => {
    window.cadence = undefined;
  });

  it('exports the portable ZIP and warns when referenced images were missing', async () => {
    h.exportZip.mockResolvedValue({ filename: 'b.zip', attachmentCount: 2, attachmentMissing: 1 });
    const { result } = setup();
    await act(() => result.current.exportBackup());
    expect(h.toast.showWarning).toHaveBeenCalledWith('Backup saved, but incomplete', expect.stringMatching(/1 image/));
  });

  it('opens a chosen file, then imports through the app data layer', async () => {
    const ws = normalizeData({ notes: [note('theirs', 'Theirs')] });
    const apply = vi.fn(async (w: AppData, imp: (x: AppData) => Promise<{ ok: true }>) => {
      await imp(w);
      return { ok: true as const, attachmentsImported: 2, attachmentsSkipped: 0 };
    });
    h.openFile.mockResolvedValue({
      ok: true,
      workspace: ws,
      preview: { fileName: 'b.zip', kind: 'zip', counts: { notes: 1, todoItems: 0, teams: 0 }, images: 2, imagesSkippedAtExport: 0, historyNotes: 0, historyVersions: 0 },
      apply,
    });
    const { result } = setup();
    await act(() => result.current.startImport(new File(['x'], 'b.zip')));
    expect(result.current.dialog?.preview.fileName).toBe('b.zip');
    await act(() => result.current.confirmImport('merge'));

    expect(h.importWorkspace).toHaveBeenCalled();
    expect(h.sync).toHaveBeenCalled();
    expect(h.toast.showSuccess).toHaveBeenCalledWith('Backup imported', expect.stringMatching(/2 images restored/));
    await waitFor(() => expect(result.current.dialog).toBeNull());
  });

  it('adds the backup to this browser\'s workspace and hands the merged result to the app', async () => {
    const backupWs = normalizeData({ notes: [note('theirs', 'Theirs')] });
    h.latest.current = normalizeData({ notes: [note('mine', 'Mine')], aiSettings: { provider: 'openai', apiKey: 'sk-local-secret' } });
    let handedOver: AppData | null = null;
    h.openFile.mockResolvedValue({
      ok: true,
      workspace: backupWs,
      preview: { fileName: 'b.zip', kind: 'zip', counts: { notes: 1, todoItems: 0, teams: 0 }, images: 0, imagesSkippedAtExport: 0, historyNotes: 0, historyVersions: 0 },
      apply: async (w: AppData, imp: (x: AppData) => Promise<{ ok: true }>) => {
        handedOver = w;
        await imp(w);
        return { ok: true as const, attachmentsImported: 0, attachmentsSkipped: 0 };
      },
    });
    const { result } = setup();
    await act(() => result.current.startImport(new File(['x'], 'b.zip')));
    await act(() => result.current.confirmImport('merge'));
    expect((handedOver as AppData | null)?.notes.map((n) => n.id).sort()).toEqual(['mine', 'theirs']);
    expect((handedOver as AppData | null)?.aiSettings?.apiKey).toBe('sk-local-secret');
    expect(h.importWorkspace).toHaveBeenCalledWith(handedOver);
  });

  it('replaces this browser\'s workspace with the backup and keeps its own AI key', async () => {
    const backupWs = normalizeData({ notes: [note('theirs', 'Theirs')], aiSettings: { provider: 'openai', apiKey: '' } });
    h.latest.current = normalizeData({ notes: [note('mine', 'Mine')], aiSettings: { provider: 'openai', apiKey: 'sk-local-secret' } });
    let handedOver: AppData | null = null;
    h.openFile.mockResolvedValue({
      ok: true,
      workspace: backupWs,
      preview: { fileName: 'b.zip', kind: 'zip', counts: null, images: 0, imagesSkippedAtExport: 0, historyNotes: 0, historyVersions: 0 },
      apply: async (w: AppData) => {
        handedOver = w;
        return { ok: true as const, attachmentsImported: 0, attachmentsSkipped: 0 };
      },
    });
    const { result, onReplaced } = setup();
    await act(() => result.current.startImport(new File(['x'], 'b.zip')));
    await act(() => result.current.confirmImport('replace'));
    expect((handedOver as AppData | null)?.notes.map((n) => n.id)).toEqual(['theirs']);
    expect((handedOver as AppData | null)?.aiSettings?.apiKey).toBe('sk-local-secret');
    expect(onReplaced).toHaveBeenCalledTimes(1);
  });

  it('says which images need the desktop app instead of asking for a re-export', async () => {
    h.openFile.mockResolvedValue({
      ok: true,
      workspace: normalizeData({ notes: [note('theirs', 'Theirs')] }),
      preview: { fileName: 'b.zip', kind: 'zip', counts: null, images: 2, imagesSkippedAtExport: 0, historyNotes: 0, historyVersions: 0 },
      apply: async () => ({ ok: true as const, attachmentsImported: 0, attachmentsSkipped: 0, attachmentsEncryptedSkipped: 2 }),
    });
    const { result } = setup();
    await act(() => result.current.startImport(new File(['x'], 'b.zip')));
    await act(() => result.current.confirmImport('merge'));
    expect(h.toast.showWarning).toHaveBeenCalledWith('Backup imported, but incomplete', expect.stringMatching(/2 encrypted images need the desktop app/));
  });

  it('explains a file the browser cannot read', async () => {
    h.openFile.mockResolvedValue({ ok: false, error: 'Choose a .zip backup or a .json workspace file.' });
    const { result } = setup();
    await act(() => result.current.startImport(new File(['x'], 'notes.txt')));
    expect(h.toast.showError).toHaveBeenCalledWith('Import failed', 'Choose a .zip backup or a .json workspace file.');
    expect(result.current.dialog).toBeNull();
  });
});
