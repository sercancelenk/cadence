import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UtilityDocumentTab } from '../core/model';

const state = vi.hoisted(() => ({
  tabs: [] as UtilityDocumentTab[],
  active: undefined as string | undefined,
  confirmResult: true,
  paneProps: null as null | Record<string, unknown>,
}));
const actions = vi.hoisted(() => ({
  addDocumentTab: vi.fn(() => 'new-tab'),
  closeDocumentTab: vi.fn(),
  renameDocumentTab: vi.fn(),
  setActiveDocumentTab: vi.fn(),
  patchDocumentTab: vi.fn(),
  confirm: vi.fn(async () => state.confirmResult),
  moveRequest: vi.fn(),
  fileSave: vi.fn(),
}));

vi.mock('../AppDataContext', () => ({
  useAppData: () => ({
    data: { utilityDocumentTabs: state.tabs, activeDocumentTabId: state.active },
    flushPendingSave: vi.fn(async () => undefined),
    getLatestSnapshot: () => ({ utilityDocumentTabs: state.tabs, activeDocumentTabId: state.active }),
    ...actions,
  }),
}));
vi.mock('../AccountContext', () => ({ useAccount: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../components/ui/ConfirmProvider', () => ({ useConfirm: () => ({ confirm: actions.confirm }) }));
vi.mock('../features/tools/useToolFileSave', () => ({ useToolFileSave: actions.fileSave }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }));
vi.mock('../features/tools/useMoveTabToNote', () => ({
  useMoveTabToNote: () => ({ request: actions.moveRequest, dialog: null }),
}));
vi.mock('../features/notes/prefetchRichTextEditor', () => ({ prefetchRichTextEditor: () => undefined }));
vi.mock('../components/ui/RichTextDocumentPane', () => ({
  RichTextDocumentPane: (props: Record<string, unknown>) => {
    state.paneProps = props;
    return <div data-testid="pane" data-key={String(props.editorKey)} data-value={String(props.value)} />;
  },
}));

import { UtilitiesDocumentPage } from './UtilitiesDocumentPage';

const T = '2026-01-01T00:00:00.000Z';
const tab = (id: string, over: Partial<UtilityDocumentTab> = {}): UtilityDocumentTab => ({ id, title: id, body: '', updatedAt: T, ...over });

describe('UtilitiesDocumentPage', () => {
  beforeEach(() => {
    state.tabs = [tab('a', { body: 'alpha text' }), tab('b')];
    state.active = 'a';
    state.confirmResult = true;
    Object.values(actions).forEach((f) => f.mockClear());
  });
  afterEach(cleanup);

  it('seeds exactly one tab for a workspace that has none', async () => {
    state.tabs = [];
    state.active = undefined;
    render(<UtilitiesDocumentPage />);
    await waitFor(() => expect(actions.addDocumentTab).toHaveBeenCalledTimes(1));
  });

  it('does not seed a tab when tabs already exist', () => {
    render(<UtilitiesDocumentPage />);
    expect(actions.addDocumentTab).not.toHaveBeenCalled();
  });

  it('shows one tab per document and gives the editor the active tab', () => {
    render(<UtilitiesDocumentPage />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    const pane = screen.getByTestId('pane');
    expect(pane.getAttribute('data-key')).toBe('a');
    expect(pane.getAttribute('data-value')).toBe('alpha text');
    expect(state.paneProps!.attachmentScope).toEqual({ documentKind: 'utility', documentId: 'a' });
  });

  it('switches the active tab', () => {
    render(<UtilitiesDocumentPage />);
    fireEvent.click(screen.getByText('b'));
    expect(actions.setActiveDocumentTab).toHaveBeenCalledWith('b');
  });

  it('gives the editor a new key and attachment scope when another tab becomes active', () => {
    const { rerender } = render(<UtilitiesDocumentPage />);
    expect(screen.getByTestId('pane').getAttribute('data-key')).toBe('a');
    state.active = 'b';
    rerender(<UtilitiesDocumentPage />);
    expect(screen.getByTestId('pane').getAttribute('data-key')).toBe('b');
    expect(state.paneProps!.attachmentScope).toEqual({ documentKind: 'utility', documentId: 'b' });
    expect(screen.getByTestId('pane').getAttribute('data-value')).toBe('');
  });

  it('patches only the active tab when the editor reports a change', () => {
    render(<UtilitiesDocumentPage />);
    const onChange = state.paneProps!.onChange as (p: unknown) => void;
    onChange({ doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'changed' }] }] }, plainText: 'changed' });
    expect(actions.patchDocumentTab).toHaveBeenCalledTimes(1);
    expect(actions.patchDocumentTab.mock.calls[0]![0]).toBe('a');
  });

  it('asks before closing a tab that has content, and keeps it when declined', async () => {
    state.confirmResult = false;
    render(<UtilitiesDocumentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Close a' }));
    await waitFor(() => expect(actions.confirm).toHaveBeenCalledTimes(1));
    expect(actions.closeDocumentTab).not.toHaveBeenCalled();
  });

  it('closes a tab with content after confirmation', async () => {
    render(<UtilitiesDocumentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Close a' }));
    await waitFor(() => expect(actions.closeDocumentTab).toHaveBeenCalledWith('a'));
  });

  it('closes an empty tab without asking', () => {
    render(<UtilitiesDocumentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Close b' }));
    expect(actions.confirm).not.toHaveBeenCalled();
    expect(actions.closeDocumentTab).toHaveBeenCalledWith('b');
  });

  it('asks to move the active document to Notes', () => {
    render(<UtilitiesDocumentPage />);
    fireEvent.click(screen.getByRole('button', { name: /Move to Notes/ }));
    expect(actions.moveRequest).toHaveBeenCalledWith('a');
  });

  it('hands the latest active tab to the save-to-file shortcut as Markdown by default', () => {
    render(<UtilitiesDocumentPage />);
    const args = actions.fileSave.mock.calls[actions.fileSave.mock.calls.length - 1]![0] as { active: boolean; getFile: () => { suggestedName: string; defaultExt: string } | null };
    expect(args.active).toBe(true);
    expect(args.getFile()).toMatchObject({ suggestedName: 'a.md', defaultExt: 'md' });
  });
});

