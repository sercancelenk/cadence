import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../../model';
import { NotesDetailHeader } from './NotesDetailHeader';

const TS = '2026-01-01T00:00:00.000Z';
const note = (over: Partial<Note> = {}): Note => ({
  id: 'n',
  title: 'T',
  body: '',
  locked: false,
  createdAt: TS,
  updatedAt: TS,
  ...over,
});

function renderHeader(selected: Note, extra: { archivedViaList?: boolean } = {}) {
  const onToggleArchive = vi.fn();
  render(
    <NotesDetailHeader
      selected={selected}
      editorReady
      busy={false}
      aiEnabled={false}
      onBack={() => {}}
      onExtractTasks={() => {}}
      onTogglePinned={() => {}}
      onToggleArchive={onToggleArchive}
      onRequestAction={() => {}}
      onHideSelected={() => {}}
      onConfirmRemove={() => {}}
      {...extra}
    />,
  );
  return { onToggleArchive };
}

afterEach(cleanup);

describe('NotesDetailHeader archive control', () => {
  it('archives a normal note', () => {
    const { onToggleArchive } = renderHeader(note());
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onToggleArchive).toHaveBeenCalledTimes(1);
  });

  it('is disabled for a note that is archived only because its list is archived', () => {
    const { onToggleArchive } = renderHeader(note(), { archivedViaList: true });
    const button = screen.getByRole('button', { name: 'Archived with its list' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onToggleArchive).not.toHaveBeenCalled();
  });

  it('still unarchives a note that carries its own archived flag', () => {
    const { onToggleArchive } = renderHeader(note({ archived: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    expect(onToggleArchive).toHaveBeenCalledTimes(1);
  });
});
