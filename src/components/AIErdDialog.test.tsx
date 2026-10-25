import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';
import { createColumn, createTable, type ErdDocument } from '../lib/erd/erdModel';

const runAiTask = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('./ui/Toast', () => ({ useToast: () => toast }));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings } }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { AIErdDialog } from './AIErdDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const current: ErdDocument = {
  version: 1,
  tables: [
    createTable({ id: 'tu', name: 'users', x: 80, y: 100, columns: [createColumn({ id: 'cu1', name: 'id', type: 'uuid', pk: true }), createColumn({ id: 'cu2', name: 'email', type: 'string' })] }),
  ],
  relations: [],
};
const col = (name: string, type = 'string', pk?: boolean) => ({ name, type, ...(pk ? { pk: true } : {}) });
const proposal = {
  tables: [
    { name: 'users', columns: [col('id', 'uuid', true), col('email'), col('display_name')] },
    { name: 'posts', columns: [col('id', 'uuid', true), col('user_id', 'uuid'), col('title')] },
  ],
  relations: [{ fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id' }],
};
const ok = (value: unknown, over: Record<string, unknown> = {}) => ({ ok: true, value, connectionName: 'Company', model: 'team/x', fellBack: false, repaired: false, stopReason: 'stop', ...over });

function mount(onApply = vi.fn()) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIErdDialog open onClose={onClose} current={current} onApply={onApply} />
    </MemoryRouter>,
  );
  return { onClose, onApply };
}
const run = async (result: unknown, request = 'Add posts that belong to users') => {
  fireEvent.change(screen.getByLabelText(/Describe/), { target: { value: request } });
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Suggest$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  navigate.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIErdDialog', () => {
  it('needs a request, shows what is sent, and sends nothing until asked', () => {
    mount();
    expect((screen.getByRole('button', { name: /^Suggest$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Diagram')).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('sends the request and the current diagram as text', async () => {
    mount();
    await run(ok(proposal));
    expect(runAiTask.mock.calls[0][0].input).toEqual({
      request: 'Add posts that belong to users',
      current: 'users(id uuid pk, email string)',
    });
  });

  it('lists new tables, new columns on existing tables and new relations, all ticked', async () => {
    mount();
    await run(ok(proposal));
    await waitFor(() => expect(screen.getByLabelText('Add table posts')).toBeTruthy());
    expect((screen.getByLabelText('Add table posts') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Add columns to users') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/display_name/)).toBeTruthy();
    expect(screen.getByText(/posts\.user_id/)).toBeTruthy();
    expect(screen.getByText(/never changes or removes/i)).toBeTruthy();
  });

  it('Apply merges only what stayed ticked into the diagram and hands it over', async () => {
    const { onApply, onClose } = mount();
    await run(ok(proposal));
    fireEvent.click(await screen.findByLabelText('Add columns to users'));
    fireEvent.click(screen.getByRole('button', { name: /^Add to the diagram/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0][0] as ErdDocument;
    expect(next.tables.map((t) => t.name)).toEqual(['users', 'posts']);
    expect(next.tables[0].columns.map((c) => c.name)).toEqual(['id', 'email']); // users untouched
    expect(next.tables[1].columns.map((c) => c.name)).toEqual(['id', 'user_id', 'title']);
    expect(next.relations).toHaveLength(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('says when the suggestion adds nothing, and offers no Apply', async () => {
    mount();
    await run(ok({ tables: [{ name: 'users', columns: [col('id', 'uuid', true), col('email')] }], relations: [] }));
    await waitFor(() => expect(screen.getByText(/adds nothing/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^Add to the diagram/ })).toBeNull();
  });

  it('a cut-off reply cannot be applied; blocked and error runs are shown; Discard changes nothing', async () => {
    const { onApply } = mount();
    await run(ok(proposal, { stopReason: 'length' }));
    await waitFor(() => expect(screen.getByText(/cut off/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /^Add to the diagram/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    mount();
    await run({ ok: false, reason: 'engine', message: 'Provider returned 500', diagnostic: 'HTTP 500' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Provider returned 500'));
    cleanup();
    mount();
    await run({ ok: false, reason: 'not-configured', message: 'AI is not set up yet.' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy());
    expect(onApply).not.toHaveBeenCalled();
  });

  it('renders nothing when AI is off', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByLabelText(/Describe/)).toBeNull();
  });
});
