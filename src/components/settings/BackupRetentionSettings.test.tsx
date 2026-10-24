import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupRetentionRequest, BackupRetentionSetResult, BackupRetentionState } from '../../vite-env';

const ui = vi.hoisted(() => ({
  confirm: vi.fn(async (_options: { description?: unknown }) => true),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));
vi.mock('../ui/ConfirmProvider', () => ({ useConfirm: () => ({ confirm: ui.confirm }) }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ showSuccess: ui.showSuccess, showError: ui.showError }) }));

import { BackupRetentionSettings } from './BackupRetentionSettings';

const STATE: BackupRetentionState = {
  mirrorKeep: 30,
  mirrorKeepChoices: [3, 7, 14, 30],
  snapshotRoutineKeep: 50,
  snapshotRoutineKeepChoices: [10, 20, 30, 50],
  snapshotLifecycleKeep: 50,
  mirrorDirConfigured: true,
  mirrorDirAvailable: true,
};

let set: ReturnType<typeof vi.fn<(r: BackupRetentionRequest) => Promise<BackupRetentionSetResult>>>;
/** What the main process would report next; the component reloads it after every change. */
let stored: BackupRetentionState;

function install(state: BackupRetentionState = STATE) {
  stored = state;
  set = vi.fn();
  window.cadence = {
    backupRetentionGet: vi.fn(async () => ({ ok: true as const, state: stored })),
    backupRetentionSet: set,
  } as unknown as typeof window.cadence;
}

const mirrorSelect = () => screen.findByLabelText('Daily backup folders to keep');
const snapshotSelect = () => screen.findByLabelText('Routine in-app snapshots to keep');

describe('BackupRetentionSettings', () => {
  beforeEach(() => {
    install();
    Object.values(ui).forEach((f) => f.mockClear());
    ui.confirm.mockResolvedValue(true);
  });
  afterEach(() => {
    cleanup();
    window.cadence = undefined;
  });

  it('renders nothing outside the desktop app', () => {
    window.cadence = undefined;
    const { container } = render(<BackupRetentionSettings />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the current choices with the long-standing sizes marked as default', async () => {
    render(<BackupRetentionSettings />);
    expect(((await mirrorSelect()) as HTMLSelectElement).value).toBe('30');
    expect(((await snapshotSelect()) as HTMLSelectElement).value).toBe('50');
    expect(screen.getByRole('option', { name: 'Newest 30 daily folders (default)' })).toBeTruthy();
  });

  it('a change that deletes nothing is applied without asking', async () => {
    set.mockResolvedValue({
      ok: true,
      state: { ...STATE, mirrorKeep: 30 },
      deleted: { mirrorFolders: 0, snapshotSets: 0 },
      mirrorDeferred: false,
    });
    render(<BackupRetentionSettings />);
    fireEvent.change(await snapshotSelect(), { target: { value: '30' } });

    await waitFor(() => expect(ui.showSuccess).toHaveBeenCalled());
    expect(ui.confirm).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ snapshotRoutineKeep: 30 });
  });

  it('lowering asks with the exact counts and applies only after confirming', async () => {
    set.mockResolvedValueOnce({ ok: false, needsConfirm: true, willDelete: { mirrorFolders: 23, snapshotSets: 0 } });
    set.mockImplementationOnce(async () => {
      stored = { ...STATE, mirrorKeep: 7 };
      return { ok: true, state: stored, deleted: { mirrorFolders: 23, snapshotSets: 0 }, mirrorDeferred: false };
    });
    render(<BackupRetentionSettings />);
    fireEvent.change(await mirrorSelect(), { target: { value: '7' } });

    await waitFor(() => expect(ui.showSuccess).toHaveBeenCalled());
    expect(String(ui.confirm.mock.calls[0][0].description)).toContain('23 older daily backup folders');
    expect(set).toHaveBeenNthCalledWith(1, { mirrorKeep: 7 });
    expect(set).toHaveBeenNthCalledWith(2, {
      mirrorKeep: 7,
      confirmed: true,
      expectedWillDelete: { mirrorFolders: 23, snapshotSets: 0 },
    });
    expect(((await mirrorSelect()) as HTMLSelectElement).value).toBe('7');
  });

  it('asks again when more would be deleted than the user agreed to', async () => {
    set.mockResolvedValueOnce({ ok: false, needsConfirm: true, willDelete: { mirrorFolders: 0, snapshotSets: 9 } });
    set.mockResolvedValueOnce({ ok: false, needsConfirm: true, willDelete: { mirrorFolders: 0, snapshotSets: 10 } });
    set.mockResolvedValueOnce({
      ok: true,
      state: STATE,
      deleted: { mirrorFolders: 0, snapshotSets: 10 },
      mirrorDeferred: false,
    });
    render(<BackupRetentionSettings />);
    fireEvent.change(await snapshotSelect(), { target: { value: '10' } });

    await waitFor(() => expect(ui.showSuccess).toHaveBeenCalled());
    expect(ui.confirm).toHaveBeenCalledTimes(2);
    expect(String(ui.confirm.mock.calls[1][0].description)).toContain('10 older in-app snapshots');
    expect(set).toHaveBeenLastCalledWith({
      snapshotRoutineKeep: 10,
      confirmed: true,
      expectedWillDelete: { mirrorFolders: 0, snapshotSets: 10 },
    });
  });

  it('cancelling leaves the setting alone and never sends a confirmed request', async () => {
    ui.confirm.mockResolvedValue(false);
    set.mockResolvedValue({ ok: false, needsConfirm: true, willDelete: { mirrorFolders: 0, snapshotSets: 9 } });
    render(<BackupRetentionSettings />);
    fireEvent.change(await snapshotSelect(), { target: { value: '10' } });

    await waitFor(() => expect(ui.confirm).toHaveBeenCalled());
    await waitFor(() => expect(((screen.getByLabelText('Routine in-app snapshots to keep')) as HTMLSelectElement).disabled).toBe(false));
    expect(set).toHaveBeenCalledTimes(1);
    expect(((await snapshotSelect()) as HTMLSelectElement).value).toBe('50');
    expect(ui.showSuccess).not.toHaveBeenCalled();
  });

  it('reports a failure and keeps showing the stored value', async () => {
    set.mockResolvedValue({ ok: false, error: 'disk full' });
    render(<BackupRetentionSettings />);
    fireEvent.change(await mirrorSelect(), { target: { value: '14' } });

    await waitFor(() => expect(ui.showError).toHaveBeenCalledWith('Backup retention', 'disk full'));
    expect(((await mirrorSelect()) as HTMLSelectElement).value).toBe('30');
  });

  it('says so when the daily folder is on a drive that is not there', async () => {
    install({ ...STATE, mirrorDirAvailable: false });
    render(<BackupRetentionSettings />);
    await mirrorSelect();
    expect(screen.getByText(/not available right now/)).toBeTruthy();
  });
});
