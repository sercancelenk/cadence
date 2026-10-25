import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings, TodoGroup, TodoItem } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings } }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { AIEisenhowerDialog } from './AIEisenhowerDialog';

const AT = '2026-10-24T10:00:00.000Z';
const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const groups: TodoGroup[] = [{ id: 'g1', name: 'Work', sortOrder: 1, createdAt: AT }];
const task = (id: string, title: string, over: Partial<TodoItem> = {}): TodoItem =>
  ({ id, groupId: 'g1', title, status: 'todo', done: false, sortOrder: 1, createdAt: AT, updatedAt: AT, ...over }) as TodoItem;
const tasks = [task('t1', 'Send the brief', { dueAt: '2026-10-27T12:00:00.000Z', priority: 'high' }), task('t2', 'Tidy the desk')];
const ok = (items: unknown[], over: Record<string, unknown> = {}) => ({
  ok: true,
  value: items,
  connectionName: 'Company',
  model: 'team/x',
  fellBack: false,
  repaired: false,
  stopReason: 'stop',
  ...over,
});

function mount(list = tasks, onApply = vi.fn(() => true), extra: Partial<React.ComponentProps<typeof AIEisenhowerDialog>> = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIEisenhowerDialog open onClose={onClose} tasks={list} groups={groups} onApply={onApply} {...extra} />
    </MemoryRouter>,
  );
  return { onClose, onApply };
}
const run = async (result: unknown) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Classify \d+ tasks?$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  navigate.mockClear();
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIEisenhowerDialog', () => {
  it('shows what will be sent and sends nothing until asked', () => {
    mount();
    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.getByText(/2 tasks: titles/)).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('renders nothing when AI is off, and points to Settings when nothing is connected', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Classify/ })).toBeNull();
    cleanup();
    flags = { ai: true, aiPeople: true, aiFocusNote: true };
    aiSettings = undefined;
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });

  it('sends the tasks with their date, priority and list, as the task input', async () => {
    mount();
    await run(ok([{ id: 't1', important: true, urgent: true }]));
    const input = runAiTask.mock.calls[0][0].input as { tasks: Array<Record<string, unknown>> };
    expect(input.tasks[0]).toMatchObject({ id: 't1', title: 'Send the brief', priority: 'high', list: 'Work' });
    expect(String(input.tasks[0].due)).toMatch(/^2026-10-2[67]$/);
    expect(input.tasks[1]).toMatchObject({ id: 't2', title: 'Tidy the desk' });
  });

  it('shows a row per suggestion for known tasks only, with the quadrant, and ignores ids it never sent', async () => {
    mount();
    await run(ok([{ id: 't1', important: true, urgent: true, reason: 'Due soon' }, { id: 'ghost', important: true, urgent: true }]));
    await waitFor(() => expect(screen.getByText('Send the brief')).toBeTruthy());
    const row = screen.getByText('Send the brief').closest('li') as HTMLElement;
    expect(within(row).getByText('Do first')).toBeTruthy();
    expect(within(row).getByText('Due soon')).toBeTruthy();
    expect(screen.queryByText('ghost')).toBeNull();
    expect(screen.getByText(/No suggestion/)).toBeTruthy();
  });

  it('Apply sends the accepted rows with any edits, and nothing before that', async () => {
    const { onApply, onClose } = mount();
    await run(ok([{ id: 't1', important: true, urgent: true }, { id: 't2', important: false, urgent: false }]));
    await waitFor(() => expect(screen.getByText('Tidy the desk')).toBeTruthy());
    expect(onApply).not.toHaveBeenCalled();
    const second = screen.getByText('Tidy the desk').closest('li') as HTMLElement;
    fireEvent.click(within(second).getByLabelText('Important'));
    fireEvent.click(within(screen.getByText('Send the brief').closest('li') as HTMLElement).getByLabelText(/Include/));
    fireEvent.click(screen.getByRole('button', { name: /^Apply to 1 task$/ }));
    expect(onApply).toHaveBeenCalledWith([{ id: 't2', important: true, urgent: false }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('asks before Regenerate drops edited or unticked suggestions, and keeps them on no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount();
    await run(ok([{ id: 't1', important: true, urgent: true }, { id: 't2', important: false, urgent: false }]));
    await waitFor(() => expect(screen.getByText('Tidy the desk')).toBeTruthy());
    // Untouched suggestions regenerate without asking.
    runAiTask.mockResolvedValueOnce(ok([{ id: 't1', important: true, urgent: true }, { id: 't2', important: false, urgent: false }]));
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
    expect(confirm).not.toHaveBeenCalled();
    const second = await screen.findByText('Tidy the desk');
    fireEvent.click(within(second.closest('li') as HTMLElement).getByLabelText('Important'));
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(runAiTask).toHaveBeenCalledTimes(2);
    expect((within(screen.getByText('Tidy the desk').closest('li') as HTMLElement).getByLabelText('Important') as HTMLInputElement).checked).toBe(true);
    confirm.mockRestore();
  });

  it('stays open with an error when the tasks could not be updated', async () => {
    const onApply = vi.fn(() => false);
    const { onClose } = mount(tasks, onApply);
    await run(ok([{ id: 't1', important: true, urgent: true }]));
    fireEvent.click(await screen.findByRole('button', { name: /^Apply to 1 task$/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a reply cut off at the token limit cannot be applied', async () => {
    mount();
    await run(ok([{ id: 't1', important: true, urgent: true }], { stopReason: 'length' }));
    await waitFor(() => expect(screen.getByText(/cut off/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /^Apply to/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('classifies at most 40 at a time and says so', () => {
    const many = Array.from({ length: 55 }, (_, i) => task(`m${i}`, `Task ${i}`));
    mount(many);
    expect(screen.getByRole('button', { name: /^Classify 40 tasks$/ })).toBeTruthy();
    expect(screen.getByText(/first 40/i)).toBeTruthy();
  });

  it('shows engine errors inline and blocked runs with the Settings action; Discard changes nothing', async () => {
    const { onApply } = mount();
    await run({ ok: false, reason: 'engine', message: 'Provider returned 500', diagnostic: 'HTTP 500' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Provider returned 500'));
    cleanup();
    mount();
    await run({ ok: false, reason: 'not-configured', message: 'AI is not set up yet.' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy());
    expect(onApply).not.toHaveBeenCalled();
  });

  describe('delegating', () => {
    const people = [
      { id: 'p1', name: 'Ana', teamName: 'Platform' },
      { id: 'p2', name: 'Bo', teamName: 'Platform' },
    ];
    const rows = [
      { id: 't1', important: false, urgent: true, reason: 'Someone else can send it.' },
      { id: 't2', important: false, urgent: false },
    ];
    const withDelegates = (onDelegate = vi.fn((_personId: string, _title: string) => true)) => {
      const view = mount(tasks, undefined, { delegates: people, onDelegate });
      return { ...view, onDelegate };
    };

    it('offers a person picker only on rows that landed in Delegate', async () => {
      withDelegates();
      await run(ok(rows));
      expect(await screen.findByLabelText('Delegate Send the brief to')).toBeTruthy();
      expect(screen.queryByLabelText('Delegate Tidy the desk to')).toBeNull();
      const picker = screen.getByLabelText('Delegate Send the brief to') as HTMLSelectElement;
      expect(Array.from(picker.options).map((o) => o.textContent)).toEqual(['Choose a person…', 'Ana (Platform)', 'Bo (Platform)']);
    });

    it('offers nothing without people or without a way to save', async () => {
      mount();
      await run(ok(rows));
      await screen.findByText('Send the brief');
      expect(screen.queryByLabelText('Delegate Send the brief to')).toBeNull();
      cleanup();
      runAiTask.mockReset();
      mount(tasks, undefined, { delegates: [], onDelegate: vi.fn(() => true) });
      await run(ok(rows));
      await screen.findByText('Send the brief');
      expect(screen.queryByLabelText('Delegate Send the brief to')).toBeNull();
    });

    it('adds one task for the chosen person with the title only, once, and leaves the classification alone', async () => {
      const { onDelegate, onApply } = withDelegates();
      await run(ok(rows));
      const add = await screen.findByRole('button', { name: /Add as a task for/ });
      expect((add as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(screen.getByLabelText('Delegate Send the brief to'), { target: { value: 'p1' } });
      fireEvent.click(screen.getByRole('button', { name: /Add as a task for Ana/ }));
      expect(onDelegate).toHaveBeenCalledTimes(1);
      expect(onDelegate).toHaveBeenCalledWith('p1', 'Send the brief');
      expect(await screen.findByText(/Added to Ana/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Add as a task for/ })).toBeNull();
      expect(onApply).not.toHaveBeenCalled();
    });

    it('says so and adds nothing when the task could not be saved', async () => {
      const { onDelegate } = withDelegates(vi.fn(() => false));
      await run(ok(rows));
      fireEvent.change(await screen.findByLabelText('Delegate Send the brief to'), { target: { value: 'p2' } });
      fireEvent.click(screen.getByRole('button', { name: /Add as a task for Bo/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i));
      expect(onDelegate).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/Added to/)).toBeNull();
      expect(screen.getByRole('button', { name: /Add as a task for Bo/ })).toBeTruthy();
    });
  });

  describe('delegating: final review fixes', () => {
    const people = [{ id: 'p1', name: 'Ana', teamName: 'Platform' }];
    const rows = [{ id: 't1', important: false, urgent: true }];

    it('does not offer to delegate a task whose list is archived', async () => {
      const archived = [{ ...groups[0], archived: true } as TodoGroup];
      const onClose = vi.fn();
      render(
        <MemoryRouter>
          <AIEisenhowerDialog open onClose={onClose} tasks={tasks} groups={archived} onApply={vi.fn(() => true)} delegates={people} onDelegate={vi.fn(() => true)} />
        </MemoryRouter>,
      );
      await run(ok(rows));
      await screen.findByText('Send the brief');
      expect(screen.queryByLabelText('Delegate Send the brief to')).toBeNull();
    });

    it('remembers a delegated task when the suggestions are regenerated', async () => {
      const onDelegate = vi.fn((_p: string, _t: string) => true);
      mount(tasks, undefined, { delegates: people, onDelegate });
      await run(ok(rows));
      fireEvent.change(await screen.findByLabelText('Delegate Send the brief to'), { target: { value: 'p1' } });
      fireEvent.click(screen.getByRole('button', { name: /Add as a task for Ana/ }));
      await screen.findByText(/Added to Ana/);
      runAiTask.mockResolvedValueOnce(ok(rows));
      fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
      await screen.findByText(/Added to Ana/);
      expect(screen.queryByRole('button', { name: /Add as a task for/ })).toBeNull();
      expect(onDelegate).toHaveBeenCalledTimes(1);
    });
  });
});

describe('AIEisenhowerDialog: linked notes', () => {
  it('sends the notes a task is linked to along with it, and says so', async () => {
    const notesFor = vi.fn((id: string) => (id === 't1' ? [{ title: 'Vendor call', text: 'Cut-off is Friday' }] : []));
    mount(tasks, vi.fn(() => true), { notesFor });
    expect(screen.getByText(/linked notes/)).toBeTruthy();
    await run(ok([{ id: 't1', important: true, urgent: true }]));
    const input = (runAiTask.mock.calls[0]![0] as { input: { tasks: Array<{ id: string; notes?: unknown[] }> } }).input;
    expect(input.tasks.find((t) => t.id === 't1')?.notes).toEqual([{ title: 'Vendor call', text: 'Cut-off is Friday' }]);
    expect(input.tasks.find((t) => t.id === 't2')?.notes).toBeUndefined();
  });

  it('sends no notes when the page offers none', async () => {
    mount();
    expect(screen.queryByText(/linked notes/)).toBeNull();
    await run(ok([{ id: 't1', important: true, urgent: true }]));
    const input = (runAiTask.mock.calls[0]![0] as { input: { tasks: Array<{ notes?: unknown[] }> } }).input;
    expect(input.tasks.every((t) => t.notes === undefined)).toBe(true);
  });
});
