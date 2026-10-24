import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: { showSuccess: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn(), showError: vi.fn() },
  moveDoc: vi.fn(),
  moveStructured: vi.fn(),
  tabStillThere: true,
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => h.toast }));
vi.mock('../../AppDataContext', () => ({
  useAppData: () => ({
    data: {
      noteGroups: [{ id: 'g1', name: 'Work', sortOrder: 0, createdAt: 'x' }],
      utilityDocumentTabs: [{ id: 'd1', title: 'Plan', body: '', updatedAt: 'x' }],
      utilityStructuredTabs: [{ id: 's1', title: 'config', content: '{}', language: 'json', mode: 'edit', updatedAt: 'x' }],
    },
    getLatestSnapshot: () => ({
      utilityDocumentTabs: h.tabStillThere ? [{ id: 'd1' }] : [],
      utilityStructuredTabs: h.tabStillThere ? [{ id: 's1' }] : [],
    }),
    moveDocumentTabToNote: h.moveDoc,
    moveStructuredTabToNote: h.moveStructured,
  }),
}));

import { useMoveTabToNote } from './useMoveTabToNote';

function Harness({ kind, tabId }: { kind: 'document' | 'structured'; tabId: string }) {
  const { request, dialog } = useMoveTabToNote(kind);
  return (
    <>
      <button onClick={() => request(tabId)}>open</button>
      {dialog}
    </>
  );
}

const openAndConfirm = async (listName?: string) => {
  fireEvent.click(screen.getByText('open'));
  if (listName) fireEvent.click(await screen.findByRole('radio', { name: listName }));
  fireEvent.click(await screen.findByRole('button', { name: 'Move to Notes' }));
};

describe('useMoveTabToNote', () => {
  beforeEach(() => {
    Object.values(h.toast).forEach((f) => f.mockClear());
    h.navigate.mockClear();
    h.moveDoc.mockReset();
    h.moveStructured.mockReset();
    h.tabStillThere = true;
  });
  afterEach(cleanup);

  it('shows nothing until a move is requested', () => {
    render(<Harness kind="document" tabId="d1" />);
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('moves a document tab into the chosen list, tells the user and opens the new note', async () => {
    h.moveDoc.mockResolvedValue('note-1');
    render(<Harness kind="document" tabId="d1" />);
    await openAndConfirm('Work');
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/notes?id=note-1'));
    expect(h.moveDoc).toHaveBeenCalledWith('d1', 'g1');
    expect(h.toast.showSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('moves a JSON / YAML tab to the top level', async () => {
    h.moveStructured.mockResolvedValue('note-2');
    render(<Harness kind="structured" tabId="s1" />);
    await openAndConfirm();
    await waitFor(() => expect(h.moveStructured).toHaveBeenCalledWith('s1', undefined));
    expect(h.navigate).toHaveBeenCalledWith('/notes?id=note-2');
  });

  it('warns and does not navigate when nothing was moved', async () => {
    h.moveDoc.mockResolvedValue(null);
    render(<Harness kind="document" tabId="d1" />);
    await openAndConfirm();
    await waitFor(() => expect(h.toast.showWarning).toHaveBeenCalledWith('Could not move', 'Saving is temporarily blocked.'));
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('says the document was already moved when it is no longer there, instead of blaming saving', async () => {
    h.moveDoc.mockImplementation(async () => {
      h.tabStillThere = false;
      return null;
    });
    render(<Harness kind="document" tabId="d1" />);
    await openAndConfirm();
    await waitFor(() => expect(h.toast.showInfo).toHaveBeenCalledWith('Already moved', 'Plan'));
    expect(h.toast.showWarning).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('ignores a second confirm while the first move is still running', async () => {
    let release!: (id: string) => void;
    h.moveDoc.mockImplementation(() => new Promise<string>((resolve) => { release = resolve; }));
    render(<Harness kind="document" tabId="d1" />);
    fireEvent.click(screen.getByText('open'));
    const confirmBtn = await screen.findByRole('button', { name: 'Move to Notes' });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    expect(h.moveDoc).toHaveBeenCalledTimes(1);
    await act(async () => release('note-3'));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledTimes(1));
  });
});
