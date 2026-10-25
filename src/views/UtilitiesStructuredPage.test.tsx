import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UtilityStructuredTab } from '../core/model';

const state = vi.hoisted(() => ({
  tabs: [] as UtilityStructuredTab[],
  active: undefined as string | undefined,
  confirmResult: true,
  ai: undefined as undefined | Record<string, unknown>,
}));
const actions = vi.hoisted(() => ({
  addStructuredTab: vi.fn(() => 'new'),
  closeStructuredTab: vi.fn(),
  renameStructuredTab: vi.fn(),
  setActiveStructuredTab: vi.fn(),
  patchStructuredTab: vi.fn(),
  addStructuredTabWithContent: vi.fn(() => 'mock-tab'),
  confirm: vi.fn(async () => state.confirmResult),
  moveRequest: vi.fn(),
  fileSave: vi.fn(),
}));

vi.mock('../AppDataContext', () => ({
  useAppData: () => ({
    data: { utilityStructuredTabs: state.tabs, activeStructuredTabId: state.active, aiSettings: state.ai },
    flushPendingSave: vi.fn(async () => undefined),
    getLatestSnapshot: () => ({ utilityStructuredTabs: state.tabs, activeStructuredTabId: state.active }),
    addStructuredTab: actions.addStructuredTab,
    closeStructuredTab: actions.closeStructuredTab,
    renameStructuredTab: actions.renameStructuredTab,
    setActiveStructuredTab: actions.setActiveStructuredTab,
    patchStructuredTab: actions.patchStructuredTab,
    addStructuredTabWithContent: actions.addStructuredTabWithContent,
  }),
}));
vi.mock('../components/AIMockDataDialog', () => ({
  AIMockDataDialog: (props: { sampleText: string; tabTitle: string; onApply: (t: string, c: string) => unknown }) => (
    <div data-testid="mock-dialog" data-sample={props.sampleText} data-title={props.tabTitle}>
      <button type="button" onClick={() => props.onApply('Mock: x', '[{"a":1}]')}>apply</button>
    </div>
  ),
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
    state.ai = undefined;
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

  describe('Generate mock data', () => {
    const configured = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };

    it('is not offered without a connected provider', () => {
      render(<UtilitiesStructuredPage />);
      expect(screen.queryByRole('button', { name: /Mock data with AI/ })).toBeNull();
    });

    it('is offered for a JSON tab with content and opens the dialog on that JSON', async () => {
      state.ai = configured;
      render(<UtilitiesStructuredPage />);
      fireEvent.click(screen.getByRole('button', { name: /Mock data with AI/ }));
      const dialog = await screen.findByTestId('mock-dialog');
      expect(dialog.getAttribute('data-sample')).toBe('{"a":1}');
      expect(dialog.getAttribute('data-title')).toBe('a');
    });

    it('is not offered for a YAML tab or an empty JSON tab', () => {
      state.ai = configured;
      state.active = 'b';
      render(<UtilitiesStructuredPage />);
      expect(screen.queryByRole('button', { name: /Mock data with AI/ })).toBeNull();
      cleanup();
      state.active = 'a';
      state.tabs = [tab('a', { content: '{}' })];
      render(<UtilitiesStructuredPage />);
      expect(screen.queryByRole('button', { name: /Mock data with AI/ })).toBeNull();
    });

    it('adds the records as a new JSON tab through the provider', async () => {
      state.ai = configured;
      render(<UtilitiesStructuredPage />);
      fireEvent.click(screen.getByRole('button', { name: /Mock data with AI/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'apply' }));
      expect(actions.addStructuredTabWithContent).toHaveBeenCalledWith({ title: 'Mock: x', content: '[{"a":1}]', language: 'json' });
    });
  });
});
