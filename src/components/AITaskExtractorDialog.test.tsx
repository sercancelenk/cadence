import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const addTodoItem = vi.fn();
const updateAISettings = vi.fn();
const navigate = vi.hoisted(() => vi.fn());
let aiSettings: AISettings | undefined;
let groups: Array<{ id: string; name: string; sortOrder: number; createdAt: string; archived?: boolean; pinned?: boolean }>;
let notes: Array<{ id: string; title: string; body: string; createdAt: string; updatedAt: string }>;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('../AppDataContext', () => ({
  useAppData: () => ({ data: { aiSettings, todoGroups: groups, notes }, addTodoItem, updateAISettings }),
}));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { AITaskExtractorDialog } from './AITaskExtractorDialog';

const AT = '2026-10-24T10:00:00.000Z';
const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };

function mount(props: Partial<React.ComponentProps<typeof AITaskExtractorDialog>> = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AITaskExtractorDialog open onClose={onClose} initialNotes="Send the brief to Maria by Friday." {...props} />
    </MemoryRouter>,
  );
  return { onClose };
}
const ok = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  ok: true,
  value: rows,
  connectionName: 'Company gateway',
  model: 'team/x',
  fellBack: false,
  repaired: false,
  ...over,
});
const extractBtn = () => screen.getByRole('button', { name: /^(Extract tasks|Re-extract)$/ }) as HTMLButtonElement;
const run = async (rows: unknown[]) => {
  runAiTask.mockResolvedValueOnce(ok(rows));
  fireEvent.click(extractBtn());
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  addTodoItem.mockClear();
  updateAISettings.mockClear();
  navigate.mockClear();
  aiSettings = cloud;
  groups = [
    { id: 'g1', name: 'Inbox', sortOrder: 1, createdAt: AT },
    { id: 'g2', name: 'Work', sortOrder: 2, createdAt: AT },
    { id: 'g3', name: 'Home', sortOrder: 3, createdAt: AT, archived: true },
  ];
  notes = [{ id: 'n1', title: 'Weekly sync', body: '', createdAt: AT, updatedAt: AT }];
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('input', () => {
  it('has no free-text guidance box any more', () => {
    mount();
    expect(screen.queryByLabelText(/guidance/i)).toBeNull();
    expect(screen.queryByText(/Custom guidance/i)).toBeNull();
  });

  it('cannot run on empty input', () => {
    mount({ initialNotes: '   ' });
    expect(extractBtn().disabled).toBe(true);
  });

  it('shows what will be read as chips: the notes, the lists, the source note', () => {
    mount({ sourceNoteId: 'n1' });
    const chips = within(screen.getByRole('list', { name: 'What the AI read' }));
    expect(chips.getByText('Notes')).toBeTruthy();
    expect(chips.getByText(/34 characters/)).toBeTruthy();
    expect(chips.getByText('Lists')).toBeTruthy();
    expect(chips.getByText(/Inbox, Work/)).toBeTruthy();
    expect(chips.getByText('From note')).toBeTruthy();
    expect(chips.getByText(/Weekly sync/)).toBeTruthy();
  });
});

describe('running', () => {
  it('sends the task, the notes, the lists and the stored legacy guidance as a focus note', async () => {
    aiSettings = { ...cloud, extractionGuidance: 'Only this week' };
    mount();
    await run([{ title: 'Send the brief' }]);
    const args = runAiTask.mock.calls[0][0];
    expect(args.task.id).toBe('ai.extract');
    expect(args.input.notes).toBe('Send the brief to Maria by Friday.');
    // Archived lists are not offered to the model as a place to put tasks.
    expect(args.input.lists).toEqual([{ id: 'g1', name: 'Inbox' }, { id: 'g2', name: 'Work' }]);
    expect(args.legacyFocusNote).toBe('Only this week');
    expect(args.settings).toBe(aiSettings);
    expect(args.features).toEqual({ ai: true, aiPeople: true, aiFocusNote: true });
    expect(updateAISettings).not.toHaveBeenCalled(); // running never rewrites stored settings
  });

  it('turns the model’s rows into editable rows: list by name, priority, due date', async () => {
    mount();
    await run([
      { title: 'Send the brief', priority: 'high', list: 'work', due: '2026-10-30' },
      { title: 'Book a table', list: 'Nonexistent list' },
    ]);
    const lists = screen.getAllByLabelText('Target list') as HTMLSelectElement[];
    expect(lists.map((s) => s.value)).toEqual(['g2', 'g1']); // matched, then the default list
    expect((screen.getAllByLabelText('Priority')[0] as HTMLSelectElement).value).toBe('high');
    const due = screen.getAllByLabelText('Due date') as HTMLInputElement[];
    expect(due.map((d) => d.value)).toEqual(['2026-10-30', '']);
  });

  it('uses the host-provided default list as the fallback', async () => {
    mount({ defaultGroupId: 'g2' });
    await run([{ title: 'x', list: 'Unknown' }]);
    expect((screen.getByLabelText('Target list') as HTMLSelectElement).value).toBe('g2');
  });

  it('adds nothing until Add or Add all, then writes through addTodoItem with the source note and due date', async () => {
    mount({ sourceNoteId: 'n1' });
    await run([
      { title: 'Send the brief', priority: 'high', list: 'Work', due: '2026-10-30' },
      { title: 'Book a table' },
    ]);
    expect(addTodoItem).not.toHaveBeenCalled();
    const rowsList = within(document.querySelector('.ai-extract-list') as HTMLElement);
    fireEvent.click(within(rowsList.getAllByRole('listitem')[0]).getByRole('button', { name: 'Add' }));
    expect(addTodoItem).toHaveBeenCalledTimes(1);
    expect(addTodoItem).toHaveBeenCalledWith('g2', 'Send the brief', {
      priority: 'high',
      sourceNoteId: 'n1',
      dueAt: new Date('2026-10-30T12:00').toISOString(),
    });
    fireEvent.click(screen.getByRole('button', { name: /Add all \(1\)/ }));
    expect(addTodoItem).toHaveBeenCalledTimes(2);
    expect(addTodoItem).toHaveBeenLastCalledWith('g1', 'Book a table', { sourceNoteId: 'n1' });
    expect(screen.getAllByText('Added')).toHaveLength(2);
  });

  it('adds the edited title, not the model’s', async () => {
    mount();
    await run([{ title: 'Send the brief' }]);
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Send the Q4 brief' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addTodoItem).toHaveBeenCalledWith('g1', 'Send the Q4 brief', undefined);
  });

  describe('running again after adding some tasks', () => {
    it('keeps what was already added and shows only new tasks, so Add all cannot create duplicates', async () => {
      mount();
      await run([{ title: 'Send the brief' }, { title: 'Book a table' }]);
      const rowsList = () => within(document.querySelector('.ai-extract-list') as HTMLElement);
      fireEvent.click(within(rowsList().getAllByRole('listitem')[0]).getByRole('button', { name: 'Add' }));
      expect(addTodoItem).toHaveBeenCalledTimes(1);
      // The model now returns the same first task (different case/spacing) and a new one.
      runAiTask.mockResolvedValueOnce(ok([{ title: '  send the BRIEF ' }, { title: 'Book a table' }, { title: 'Call Maria' }]));
      fireEvent.click(extractBtn());
      await waitFor(() => expect(rowsList().getAllByRole('listitem')).toHaveLength(3));
      const titles = (rowsList().getAllByLabelText('Task title') as HTMLTextAreaElement[]).map((t) => t.value);
      expect(titles).toEqual(['Send the brief', 'Book a table', 'Call Maria']);
      expect(screen.getAllByText('Added')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: /Add all \(2\)/ }));
      expect(addTodoItem).toHaveBeenCalledTimes(3);
      expect(addTodoItem.mock.calls.map((c) => c[1])).toEqual(['Send the brief', 'Book a table', 'Call Maria']);
    });

    it('says so when the new run has nothing beyond what was added', async () => {
      mount();
      await run([{ title: 'Send the brief' }]);
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      runAiTask.mockResolvedValueOnce(ok([{ title: 'Send the brief' }]));
      fireEvent.click(extractBtn());
      await waitFor(() => expect(screen.getByText(/No new tasks beyond the ones you already added/)).toBeTruthy());
      expect(screen.getAllByText('Added')).toHaveLength(1);
      expect(addTodoItem).toHaveBeenCalledTimes(1);
    });
  });

  it('writes the model\'s note for a task into the task, so a relative deadline is not lost', async () => {
    mount();
    await run([{ title: 'Send the brief', notes: 'by Friday, to Maria' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addTodoItem).toHaveBeenCalledWith('g1', 'Send the brief', {
      body: 'by Friday, to Maria',
      bodyFormat: 'markdown',
      bodyPlainText: 'by Friday, to Maria',
    });
  });

  it('says so when the connection set for this was unavailable and the default was used', async () => {
    mount();
    runAiTask.mockResolvedValueOnce(ok([{ title: 'x' }], { fellBack: true }));
    fireEvent.click(extractBtn());
    await waitFor(() => expect(screen.getByText(/connection chosen for this was not available/i)).toBeTruthy());
    expect(screen.getByText(/Company gateway/, { selector: '.ai-dialog__fallback' })).toBeTruthy();
  });

  it('works with extra connections alone, after the default was removed', async () => {
    aiSettings = { gatewayFormat: 'openai-chat', connections: [{ id: 'c1', name: 'Company gateway', provider: 'gateway', baseUrl: 'https://gw.example.com/v1', model: 'm' }] };
    mount();
    expect(screen.queryByText(/haven.t configured an AI provider/i)).toBeNull();
    await run([{ title: 'x' }]);
    expect(runAiTask).toHaveBeenCalledTimes(1);
  });

  it('shows the one-time notice when a stored extraction instruction exists, and not otherwise', () => {
    window.localStorage.clear();
    aiSettings = { ...cloud, extractionGuidance: 'Only this week' };
    mount();
    expect(screen.getByText(/earlier instructions are still applied/i)).toBeTruthy();
    cleanup();
    aiSettings = cloud;
    mount();
    expect(screen.queryByText(/earlier instructions are still applied/i)).toBeNull();
  });

  it('does not show the notice when the organization turned focus notes off (they are not applied)', () => {
    window.localStorage.clear();
    flags = { ai: true, aiPeople: true, aiFocusNote: false };
    aiSettings = { ...cloud, extractionGuidance: 'Only this week' };
    mount();
    expect(screen.queryByText(/earlier instructions are still applied/i)).toBeNull();
  });

  it('names the connection quietly after a run', async () => {
    mount();
    await run([{ title: 'x' }]);
    expect(screen.getByText(/via Company gateway/)).toBeTruthy();
  });
});

describe('when it does not work', () => {
  it('shows an engine error inline with its diagnostic, and the pasted notes stay editable', async () => {
    mount();
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'engine', message: 'The gateway answered HTTP 405', diagnostic: 'POST https://x\n-> HTTP 405' });
    fireEvent.click(extractBtn());
    await waitFor(() => expect(screen.getByText('The gateway answered HTTP 405')).toBeTruthy());
    expect(screen.getByText('Diagnostic details')).toBeTruthy();
    const notesBox = screen.getByLabelText('Notes to extract tasks from') as HTMLTextAreaElement;
    expect(notesBox.disabled).toBe(false);
    expect(notesBox.value).toContain('Send the brief');
  });

  it('an unusable reply is an inline error too', async () => {
    mount();
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'invalid-output', message: 'The AI did not return a usable result.' });
    fireEvent.click(extractBtn());
    await waitFor(() => expect(screen.getByText(/did not return a usable result/)).toBeTruthy());
  });

  it('a reply with no tasks says so instead of showing an empty list', async () => {
    mount();
    await run([]);
    expect(screen.getByText(/did not find any actionable tasks/i)).toBeTruthy();
  });

  it('a cancelled run shows nothing', async () => {
    mount();
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'cancelled', message: 'Cancelled.' });
    fireEvent.click(extractBtn());
    await waitFor(() => expect(runAiTask).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Cancelled.')).toBeNull();
  });

  it.each([
    ['capability', true],
    ['not-configured', true],
    ['policy', false],
  ])('%s blocks the run with the reason (settings action: %s)', async (reason, hasAction) => {
    mount();
    runAiTask.mockResolvedValueOnce({ ok: false, reason, message: `Reason: ${reason}` });
    fireEvent.click(extractBtn());
    await waitFor(() => expect(screen.getByText(`Reason: ${reason}`)).toBeTruthy());
    const action = screen.queryByRole('button', { name: 'Open AI settings' });
    expect(!!action).toBe(hasAction);
    if (action) {
      fireEvent.click(action);
      expect(navigate).toHaveBeenCalledWith('/settings#ai');
    }
  });

  it('without a configured provider it is blocked at once and never calls the runner', () => {
    aiSettings = undefined;
    mount();
    expect(screen.getByText(/haven.t configured an AI provider/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open AI settings' })).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('with no lists it asks for one first', () => {
    groups = [];
    mount();
    expect(screen.getByText(/don.t have any to-do lists/i)).toBeTruthy();
  });

  it('renders nothing when the organization turned AI off', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByText('Extract tasks from notes')).toBeNull();
  });
});
