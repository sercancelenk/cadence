import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupPreview } from '../../lib/backupPreview';
import { BackupImportDialog } from './BackupImportDialog';

const PREVIEW: BackupPreview = {
  fileName: 'cadence-backup-2026-10-25.zip',
  kind: 'zip',
  exportedAt: '2026-10-25T10:00:00.000Z',
  counts: { notes: 7, todoItems: 4, teams: 1 },
  images: 12,
  imagesSkippedAtExport: 0,
  historyNotes: 3,
  historyVersions: 9,
};

function mount(over: Partial<React.ComponentProps<typeof BackupImportDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <BackupImportDialog
      preview={PREVIEW}
      current={{ notes: 2, todoItems: 0 }}
      hasSafetyCopy
      busy={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onConfirm, onCancel };
}

afterEach(cleanup);

describe('BackupImportDialog', () => {
  it('shows the file and what is inside it', () => {
    mount();
    expect(screen.getByText('cadence-backup-2026-10-25.zip')).toBeTruthy();
    expect(screen.getByText('7 notes, 4 tasks, 1 team')).toBeTruthy();
    expect(screen.getByText('12 images')).toBeTruthy();
    expect(screen.getByText('Version history for 3 notes (9 versions)')).toBeTruthy();
  });

  it('shows what is on this device now, so replacing is an informed choice', () => {
    mount();
    expect(screen.getByText(/On this device now: 2 notes, 0 tasks/)).toBeTruthy();
  });

  it('starts on the choice that cannot delete anything', () => {
    mount();
    expect((screen.getByLabelText(/Add to what's here/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Replace what's here/) as HTMLInputElement).checked).toBe(false);
  });

  it('adds when the first choice is kept', () => {
    const { onConfirm } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add to this device' }));
    expect(onConfirm).toHaveBeenCalledWith('merge');
  });

  it('replaces only after choosing it, and says a safety copy is made first', () => {
    const { onConfirm } = mount();
    fireEvent.click(screen.getByLabelText(/Replace what's here/));
    expect(screen.getByText(/safety copy of your current data/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Replace and import' }));
    expect(onConfirm).toHaveBeenCalledWith('replace');
  });

  it('does not promise a safety copy where none is made (a browser), and says to export first', () => {
    mount({ hasSafetyCopy: false });
    fireEvent.click(screen.getByLabelText(/Replace what's here/));
    expect(screen.queryByText(/safety copy of your current data/i)).toBeNull();
    expect(screen.queryByText(/Automatic snapshots/i)).toBeNull();
    expect(screen.getByText(/no automatic safety copy.*export a backup first/i)).toBeTruthy();
  });

  it('describes itself to assistive technology', () => {
    mount();
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBeTruthy();
  });

  it('warns about images that were already missing when the backup was made', () => {
    mount({ preview: { ...PREVIEW, imagesSkippedAtExport: 2 } });
    expect(screen.getByText(/2 images could not be read when this backup was made/)).toBeTruthy();
  });

  it('cancels without choosing anything', () => {
    const { onConfirm, onCancel } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cannot be confirmed twice while it works', () => {
    const { onConfirm } = mount({ busy: true });
    const button = screen.getByRole('button', { name: /Working/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
