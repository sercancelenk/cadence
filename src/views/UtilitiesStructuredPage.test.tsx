import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UtilityStructuredTab } from '../core/model';

const state = vi.hoisted(() => ({
  tabs: [] as UtilityStructuredTab[],
  active: undefined as string | undefined,
  confirmResult: true,
}));
const actions = vi.hoisted(() => ({
  addStructuredTab: vi.fn(() => 'new'),
  closeStructuredTab: vi.fn(),
  renameStructuredTab: vi.fn(),
  setActiveStructuredTab: vi.fn(),
  patchStructuredTab: vi.fn(),
  confirm: vi.fn(async () => state.confirmResult),
  moveRequest: vi.fn(),
  fileSave: vi.fn(),
}));

vi.mock('../AppDataContext', () => ({
  useAppData: () => ({
    data: { utilityStructuredTabs: state.tabs, activeStructuredTabId: state.active },
    flushPendingSave: vi.fn(async () => undefined),
    getLatestSnapshot: () => ({ utilityStructuredTabs: state.tabs, activeStructuredTabId: state.active }),
    addStructuredTab: actions.addStructuredTab,
    closeStructuredTab: actions.closeStructuredTab,
    renameStructuredTab: actions.renameStructuredTab,
    setActiveStructuredTab: actions.setActiveStructuredTab,
    patchStructuredTab: actions.patchStructuredTab,
  }),
}));
vi.mock('../components/ui/ConfirmProvider', () => ({ useConfirm: () => ({ confirm: actions.confirm }) }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }));
vi.mock('../features/tools/useMoveTabToNote', () => ({ useMoveTabToNote: () => ({ request: actions.moveRequest, dialog: null }) }));
vi.mock('../features/tools/useToolFileSave', () => ({ useToolFileSave: actions.fileSave }));
vi.mock('../components/ui/StructuredTextHelpDialog', () => ({ StructuredTextHelpDialog: () => null }));
vi.mock('../components/ui/StructuredTextEditor', () => ({
  StructuredTextEditor: (p: { value: string }) => <div data-testid="edit" data-value={p.value} />,
}));
vi.mock('../components/ui/StructuredTextDiffPane', () => ({
  StructuredTextDiffPane: () => <div data-testid="diff" />,
}));

import { UtilitiesStructuredPage } from './UtilitiesStructuredPage';

const T = '2026-01-01T00:00:00.000Z';
const tab = (id: string, over: Partial<UtilityStructuredTab> = {}): UtilityStructuredTab => ({
  id,
  title: id,
  content: '{}',
  language: 'json',
  mode: 'edit',
  updatedAt: T,
  ...over,
});
const lastFileSaveArgs = () =>
  actions.fileSave.mock.calls[actions.fileSave.mock.calls.length - 1]![0] as {
    active: boolean;
    getFile: () => { suggestedName: string; defaultExt: string; variants: Record<string, string> } | null;
  };

describe('UtilitiesStructuredPage', () => {
  beforeEach(() => {
    state.tabs = [tab('a', { content: '{"a":1}' }), tab('b', { language: 'yaml', content: 'k: v' })];
    state.active = 'a';
    state.confirmResult = true;
    Object.values(actions).forEach((f) => f.mockClear());
  });
  afterEach(cleanup);

  it('shows a tab per document with its language badge', () => {
    render(<UtilitiesStructuredPage />);
    const strip = screen.getByRole('tablist', { name: 'JSON / YAML documents' });
    expect(within(strip).getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByText('YAML')).toBeTruthy();
  });

  it('seeds one tab when none exist, and again after the last one is moved away', async () => {
    state.tabs = [];
    state.active = undefined;
    const { rerender } = render(<UtilitiesStructuredPage />);
    await waitFor(() => expect(actions.addStructuredTab).toHaveBeenCalledTimes(1));

    state.tabs = [tab('a')];
    state.active = 'a';
    rerender(<UtilitiesStructuredPage />);
    state.tabs = [];
    state.active = undefined;
    rerender(<UtilitiesStructuredPage />);
    await waitFor(() => expect(actions.addStructuredTab).toHaveBeenCalledTimes(2));
  });

  it('asks to move the active tab to Notes', () => {
    render(<UtilitiesStructuredPage />);
    fireEvent.click(screen.getByRole('button', { name: /Move to Notes/ }));
    expect(actions.moveRequest).toHaveBeenCalledWith('a');
  });

  it('saves the edit buffer to a file with the tab language as extension', () => {
    render(<UtilitiesStructuredPage />);
    const args = lastFileSaveArgs();
    expect(args.active).toBe(true);
    expect(args.getFile()).toMatchObject({ suggestedName: 'a.json', defaultExt: 'json', variants: { '*': '{"a":1}' } });
  });

  it('still saves the edit buffer, not a diff pane, while Diff is showing', () => {
    state.tabs = [tab('a', { content: '{"edit":true}', mode: 'diff', diffContentLeft: '{"left":1}', diffContent: '{"right":1}' })];
    render(<UtilitiesStructuredPage />);
    expect(screen.getByTestId('diff')).toBeTruthy();
    expect(lastFileSaveArgs().getFile()!.variants['*']).toBe('{"edit":true}');
  });

  it('asks before closing a tab with content and closes a blank one silently', async () => {
    state.tabs = [tab('a', { content: '{"a":1}' }), tab('blank', { content: '{}' })];
    render(<UtilitiesStructuredPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Close blank' }));
    expect(actions.confirm).not.toHaveBeenCalled();
    expect(actions.closeStructuredTab).toHaveBeenCalledWith('blank');

    state.confirmResult = false;
    fireEvent.click(screen.getByRole('button', { name: 'Close a' }));
    await waitFor(() => expect(actions.confirm).toHaveBeenCalledTimes(1));
    expect(actions.closeStructuredTab).toHaveBeenCalledTimes(1);
  });
});
