import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_PREFIX } from '../lib/appBranding';

const ui = vi.hoisted(() => ({
  confirm: vi.fn(async (_o: unknown) => true),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
  reload: vi.fn(async () => undefined),
  flush: vi.fn(async () => undefined),
}));
vi.mock('../components/ui/ConfirmProvider', () => ({ useConfirm: () => ({ confirm: ui.confirm }) }));
vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccess: ui.showSuccess,
    showError: ui.showError,
    showWarning: ui.showWarning,
    showInfo: ui.showInfo,
  }),
}));
vi.mock('../AppDataContext', () => ({
  useAppData: () => ({ data: { version: 3 }, reload: ui.reload, flushPendingSave: ui.flush }),
}));
vi.mock('../lib/syncApplyGuard', () => ({ prepareForRemoteApply: async () => undefined }));

import { BackupsRecoverySection } from './Settings';

const SNAP = {
  path: '/ud/backups/u1/data-pre-save-2026-10-25T10-00-00-000Z.json',
  name: 'data-pre-save-2026-10-25T10-00-00-000Z.json',
  bytes: 2048,
  mtime: new Date().toISOString(),
  encrypted: true,
  decryptable: true,
  parsedOk: true,
  counts: { teams: 1, todoItems: 4, notes: 7 },
};
const MIRROR_OFF = { ok: true, prefs: { mirrorDir: null } };
const MIRROR_ON = { ok: true, prefs: { mirrorDir: '/mirror', lastOkAt: undefined, lastDailyDate: undefined } };

type Cadence = Record<string, ReturnType<typeof vi.fn>>;
let cadence: Cadence;

function install(overrides: Partial<Cadence> = {}) {
  cadence = {
    saveData: vi.fn(),
    dataListSources: vi.fn(async () => ({ live: null, legacy: null, backups: [SNAP], otherUsers: [] })),
    backupMirrorGet: vi.fn(async () => MIRROR_OFF),
    backupMirrorChooseDir: vi.fn(),
    backupMirrorClearDir: vi.fn(),
    backupMirrorRunNow: vi.fn(),
    backupRetentionGet: vi.fn(async () => ({
      ok: true,
      state: {
        mirrorKeep: 2,
        mirrorKeepChoices: [2, 7],
        snapshotRoutineKeep: 20,
        snapshotRoutineKeepChoices: [10, 20, 50],
        snapshotLifecycleKeep: 50,
        mirrorDirConfigured: false,
        mirrorDirAvailable: true,
      },
    })),
    dataRestoreFromSource: vi.fn(),
    onSaveError: vi.fn(() => () => undefined),
    ...overrides,
  };
  window.cadence = cadence as unknown as typeof window.cadence;
}

function mount() {
  window.localStorage.setItem(`${STORAGE_PREFIX}:settings:section:backups`, '1');
  const noop = vi.fn();
  return render(
    <BackupsRecoverySection
      canExport
      onExportJson={noop}
      onExportPortableZip={noop}
      onExportFullBundle={noop}
      onImportBackup={noop}
      onMergeImport={noop}
      onImportFolder={noop}
      fileInput={null}
    />,
  );
}

const restoreButton = () => screen.findByRole('button', { name: 'Restore' });

describe('Settings → Backup & recovery', () => {
  beforeEach(() => {
    install();
    Object.values(ui).forEach((f) => f.mockClear());
    ui.confirm.mockResolvedValue(true);
  });
  afterEach(() => {
    cleanup();
    window.cadence = undefined;
    window.localStorage.clear();
    vi.useRealTimers();
  });

  describe('snapshots', () => {
    it('says how many routine copies are kept using the number the user chose', async () => {
      mount();
      expect(await screen.findByText(/routine copies, newest 20 kept/)).toBeTruthy();
      expect(screen.queryByText(/newest 50 kept/)).toBeNull();
    });

    it('does not restore when the user cancels the confirmation', async () => {
      ui.confirm.mockResolvedValue(false);
      mount();
      fireEvent.click(await restoreButton());
      await waitFor(() => expect(ui.confirm).toHaveBeenCalled());
      expect(cadence.dataRestoreFromSource).not.toHaveBeenCalled();
      expect(ui.reload).not.toHaveBeenCalled();
    });

    it('restores the chosen snapshot, reloads, and reports what came back', async () => {
      cadence.dataRestoreFromSource!.mockResolvedValue({
        ok: true,
        restoredFrom: SNAP.name,
        attachmentsRestored: 3,
        attachmentsFailed: 0,
        historyIncomplete: false,
      });
      mount();
      fireEvent.click(await restoreButton());
      expect(await screen.findByText(/3 images restored/)).toBeTruthy();
      expect(cadence.dataRestoreFromSource).toHaveBeenCalledWith({ filePath: SNAP.path });
      expect(ui.flush).toHaveBeenCalled();
      expect(ui.reload).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Loaded: 1 team, 4 tasks, 7 notes/)).toBeTruthy();
    });

    it('still reloads, and says it is incomplete, when some images could not be copied', async () => {
      cadence.dataRestoreFromSource!.mockResolvedValue({ ok: true, restoredFrom: SNAP.name, attachmentsRestored: 1, attachmentsFailed: 2 });
      mount();
      fireEvent.click(await restoreButton());
      const text = await screen.findByText(/2 images could not be copied/);
      expect(text.textContent).toMatch(/notes and tasks were restored/i);
      expect(ui.reload).toHaveBeenCalledTimes(1);
    });

    it('shows the reason and does not reload when the restore is refused', async () => {
      cadence.dataRestoreFromSource!.mockResolvedValue({ ok: false, error: 'Could not save a safety copy of your current data first, so nothing was changed.' });
      mount();
      fireEvent.click(await restoreButton());
      expect(await screen.findByText(/nothing was changed/)).toBeTruthy();
      expect(ui.reload).not.toHaveBeenCalled();
    });

    it('does not offer to restore a snapshot that cannot be decrypted', async () => {
      cadence.dataListSources!.mockResolvedValue({
        live: null,
        legacy: null,
        backups: [{ ...SNAP, decryptable: false, counts: null }],
        otherUsers: [],
      });
      mount();
      expect(((await restoreButton()) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('daily backup folder', () => {
    it('keeps the setting untouched when the folder dialog is cancelled', async () => {
      cadence.backupMirrorChooseDir!.mockResolvedValue({ ok: false, canceled: true });
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Choose folder' }));
      await waitFor(() => expect(cadence.backupMirrorChooseDir).toHaveBeenCalled());
      expect(ui.showSuccess).not.toHaveBeenCalled();
      expect(ui.showError).not.toHaveBeenCalled();
      expect(screen.getByText(/No folder selected/)).toBeTruthy();
    });

    it('shows the chosen folder and says the first backup starts now', async () => {
      cadence.backupMirrorChooseDir!.mockResolvedValue({ ok: true, prefs: { mirrorDir: '/mirror' } });
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Choose folder' }));
      expect(await screen.findByText('/mirror')).toBeTruthy();
      expect(ui.showSuccess).toHaveBeenCalledWith('Daily backup folder set', expect.stringMatching(/first full backup is starting now/));
    });

    it('reports a failed manual backup as an error and not as written', async () => {
      cadence.backupMirrorGet!.mockResolvedValue(MIRROR_ON);
      cadence.backupMirrorRunNow!.mockResolvedValue({ ok: false, error: 'Disk is full', prefs: MIRROR_ON.prefs });
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Backup now' }));
      await waitFor(() => expect(ui.showError).toHaveBeenCalledWith('Daily backup', 'Disk is full'));
      expect(ui.showSuccess).not.toHaveBeenCalled();
    });

    it('clears the folder only after the user confirms', async () => {
      cadence.backupMirrorGet!.mockResolvedValue(MIRROR_ON);
      cadence.backupMirrorClearDir!.mockResolvedValue({ ok: true, prefs: { mirrorDir: null } });
      ui.confirm.mockResolvedValueOnce(false);
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
      await waitFor(() => expect(ui.confirm).toHaveBeenCalledTimes(1));
      expect(cadence.backupMirrorClearDir).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      await waitFor(() => expect(cadence.backupMirrorClearDir).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/No folder selected/)).toBeTruthy();
    });

    it('picks up a backup that finishes in the background while the page stays open', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      cadence.backupMirrorGet!.mockResolvedValue(MIRROR_ON);
      mount();
      await screen.findByText('/mirror');
      expect(screen.queryByText(/Last daily backup/)).toBeNull();

      cadence.backupMirrorGet!.mockResolvedValue({
        ok: true,
        prefs: { mirrorDir: '/mirror', lastOkAt: new Date().toISOString(), lastDailyDate: '2026-10-25' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(await screen.findByText(/Last daily backup/)).toBeTruthy();
    });
  });
});
