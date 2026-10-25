import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const appData = () => ({
  aiSettings,
  people: [{ id: 'p1', name: 'Ayşe Yılmaz' }],
  items: [
    { id: 'i1', personId: 'p1', kind: 'task', title: 'Fix deploy', body: '', done: false, createdAt: ago(3), updatedAt: ago(3) },
    { id: 'i2', personId: 'p2', kind: 'task', title: 'Other person task', body: '', done: false, createdAt: ago(3), updatedAt: ago(3) },
  ],
});

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('./ui/Toast', () => ({ useToast: () => toast }));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: appData() }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { AIPrepDialog } from './AIPrepDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const OUT = { followUps: ['Ask about the deploy'], openGoals: ['Finish the migration'], feedbackToGive: [], questions: ['How is the workload?'] };
const ok = { ok: true, value: OUT, connectionName: 'Company', model: 'team/x', fellBack: false, repaired: false, stopReason: 'stop' };

function mount(personId = 'p1', onAdd = vi.fn((_fields: unknown) => true)) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIPrepDialog open onClose={onClose} personId={personId} onAdd={onAdd} />
    </MemoryRouter>,
  );
  return { onClose, onAdd };
}
const prepare = async (result: unknown = ok) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Prepare$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  navigate.mockClear();
  writeText.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIPrepDialog', () => {
  it('shows the people chip and sends nothing until asked; absent when AI is off', () => {
    mount();
    expect(screen.getByText('People data')).toBeTruthy();
    expect(screen.getByText(/1 person · last 8 weeks/)).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
    cleanup();
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Prepare$/ })).toBeNull();
  });

  it("sends only this person's items, without their name", async () => {
    mount();
    await prepare();
    const call = runAiTask.mock.calls[0][0] as { input: { context: string }; task: { id: string } };
    expect(call.task.id).toBe('ai.prep');
    expect(call.input.context).toContain('Fix deploy');
    expect(call.input.context).not.toContain('Other person task');
    expect(call.input.context).not.toContain('Ayşe');
  });

  it('the period picker changes the window', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '4' } });
    expect(screen.getByText(/1 person · last 4 weeks/)).toBeTruthy();
    await prepare();
    expect((runAiTask.mock.calls[0][0] as { input: { context: string } }).input.context).toContain('Last 4 weeks');
  });

  it('shows the four lists and skips empty ones', async () => {
    mount();
    await prepare();
    expect(await screen.findByText('Ask about the deploy')).toBeTruthy();
    expect(screen.getByText('Finish the migration')).toBeTruthy();
    expect(screen.getByText('How is the workload?')).toBeTruthy();
    expect(screen.queryByText('Feedback to give')).toBeNull();
  });

  it('explains when there is nothing recorded and keeps Prepare disabled', () => {
    mount('nobody');
    expect(screen.getByText(/nothing recorded/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Prepare$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a connection not allowed for people data shows the Settings path', async () => {
    mount();
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'blocked-people', message: 'This connection is not allowed for people data.' });
    fireEvent.click(screen.getByRole('button', { name: /^Prepare$/ }));
    expect(await screen.findByText(/not allowed for people data/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });

  it('Add as a note adds ONE note item to the person, then closes', async () => {
    const { onAdd, onClose } = mount();
    await prepare();
    fireEvent.click(await screen.findByRole('button', { name: /Add as a note/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const fields = onAdd.mock.calls[0][0] as { title: string; body: string; bodyFormat: string; category: string; bodyPlainText: string };
    expect(fields.title).toMatch(/^1:1 prep · /);
    expect(fields.bodyFormat).toBe('markdown');
    expect(fields.category).toBe('1:1');
    expect(fields.body).toContain('## Follow-ups');
    expect(fields.body).toContain('- Ask about the deploy');
    expect(fields.body).not.toContain('Feedback to give');
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open with an error, and reports no success, when the item could not be saved', async () => {
    const { onClose } = mount('p1', vi.fn((_fields: unknown) => false));
    await prepare();
    fireEvent.click(await screen.findByRole('button', { name: /Add as a note/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Copy puts the Markdown on the clipboard', async () => {
    mount();
    await prepare();
    fireEvent.click(await screen.findByRole('button', { name: /^Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('## Open goals')));
  });

  it('does not offer Add when the reply was cut off', async () => {
    mount();
    await prepare({ ...ok, stopReason: 'length' });
    await screen.findByText('Ask about the deploy');
    expect((screen.getByRole('button', { name: /Add as a note/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
