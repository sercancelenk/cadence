import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErdDocument } from '../../lib/erd/erdModel';

const state = vi.hoisted(() => ({ ai: undefined as undefined | Record<string, unknown>, doc: { version: 1, tables: [], relations: [] } as unknown }));
const canvas = vi.hoisted(() => ({ applyDocument: vi.fn(), getDocument: vi.fn() }));

vi.mock('../../AppDataContext', () => ({
  useAppData: () => ({
    data: { aiSettings: state.ai, utilityErdDocuments: [] },
    upsertUtilityErdDocument: vi.fn(),
    renameUtilityErdDocument: vi.fn(),
    removeUtilityErdDocument: vi.fn(),
  }),
}));
vi.mock('../../components/ui/ConfirmProvider', () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true), prompt: vi.fn() }) }));
vi.mock('../../features/utilities/UtilitySavedDocsPanel', () => ({ UtilitySavedDocsPanel: () => null }));
vi.mock('../../features/erd/ErdCanvas', () => ({
  ErdCanvas: forwardRef(function FakeCanvas(_props: unknown, ref) {
    useImperativeHandle(ref, () => ({ getDocument: canvas.getDocument, loadDocument: vi.fn(), newBlank: vi.fn(), applyDocument: canvas.applyDocument }));
    return <div data-testid="canvas" />;
  }),
}));
vi.mock('../../components/AIErdDialog', () => ({
  AIErdDialog: (props: { current: ErdDocument; onApply: (d: ErdDocument) => void; onClose: () => void }) => (
    <div data-testid="erd-dialog" data-tables={props.current.tables.length}>
      <button type="button" onClick={() => props.onApply({ version: 1, tables: [], relations: [] })}>apply</button>
    </div>
  ),
}));

import { UtilitiesToolsErdPage } from './UtilitiesToolsErdPage';

beforeEach(() => {
  state.ai = undefined;
  canvas.applyDocument.mockClear();
  canvas.getDocument.mockReset().mockReturnValue({ version: 1, tables: [{ id: 't' }], relations: [] });
});
afterEach(cleanup);

describe('UtilitiesToolsErdPage AI entry', () => {
  it('is not offered without a connected provider', () => {
    render(<UtilitiesToolsErdPage />);
    expect(screen.queryByRole('button', { name: /Design with AI/ })).toBeNull();
  });

  it('opens the dialog on the diagram as it is on the canvas now', async () => {
    state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
    render(<UtilitiesToolsErdPage />);
    fireEvent.click(screen.getByRole('button', { name: /Design with AI/ }));
    const dialog = await screen.findByTestId('erd-dialog');
    expect(dialog.getAttribute('data-tables')).toBe('1');
  });

  it('shows an accepted suggestion on the canvas through applyDocument', async () => {
    state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
    render(<UtilitiesToolsErdPage />);
    fireEvent.click(screen.getByRole('button', { name: /Design with AI/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'apply' }));
    expect(canvas.applyDocument).toHaveBeenCalledTimes(1);
  });
});
