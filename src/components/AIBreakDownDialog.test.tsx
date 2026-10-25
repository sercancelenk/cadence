import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('./ui/Toast', () => ({ useToast: () => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }) }));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings } }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { AIBreakDownDialog } from './AIBreakDownDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const STEPS = [
  { title: 'Write the changelog' },
  { title: 'Tag the build', detail: 'v1.4.0' },
  { title: 'Publish the release' },
];
const ok = (steps = STEPS, over: Record<string, unknown> = {}) => ({
  ok: true,
  value: steps,
  connectionName: 'Company gateway',
  model: 'team/x',
  fellBack: false,
  repaired: false,
  stopReason: 'stop',
  ...over,
});

function mount() {
  const onClose = vi.fn();
  const onAppendChecklist = vi.fn();
  const onCreateTasks = vi.fn();
  render(
    <MemoryRouter>
      <AIBreakDownDialog
        open
        onClose={onClose}
        task={{ title: 'Ship the release', body: 'Uses pnpm' }}
        context={{ listName: 'Q4', dueAt: '2026-11-01', priority: 'high' }}
        onAppendChecklist={onAppendChecklist}
        onCreateTasks={onCreateTasks}
      />
    </MemoryRouter>,
  );
  return { onClose, onAppendChecklist, onCreateTasks };
}
const run = async (result: unknown = ok()) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Break down$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};
const titles = () => screen.getAllByLabelText('Step title').map((e) => (e as HTMLTextAreaElement).value);

beforeEach(() => {
  runAiTask.mockReset();
  navigate.mockClear();
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIBreakDownDialog', () => {
  it('shows what will be sent and sends nothing until asked', () => {
    mount();
    expect(screen.getByText('Task')).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('renders nothing when AI is off by policy and points to Settings when nothing is connected', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Break down$/ })).toBeNull();
    cleanup();
    flags = { ai: true, aiPeople: true, aiFocusNote: true };
    aiSettings = undefined;
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });

  it('runs the breakdown task with the task and its context, then lists the steps', async () => {
    mount();
    await run();
    expect(runAiTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({ id: 'ai.breakdown' }),
        input: { title: 'Ship the release', body: 'Uses pnpm', listName: 'Q4', dueAt: '2026-11-01', priority: 'high' },
      }),
    );
    await waitFor(() => expect(titles()).toEqual(['Write the changelog', 'Tag the build', 'Publish the release']));
    expect(screen.getByText('v1.4.0')).toBeTruthy();
  });

  it('adds the edited steps as a checklist in the details by default, then closes', async () => {
    const { onAppendChecklist, onCreateTasks, onClose } = mount();
    await run();
    await waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.change(screen.getAllByLabelText('Step title')[0], { target: { value: 'Draft the changelog' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Remove step/ })[1]);
    fireEvent.click(screen.getByRole('button', { name: /Add checklist to details/ }));
    expect(onAppendChecklist).toHaveBeenCalledTimes(1);
    expect(onAppendChecklist).toHaveBeenCalledWith(['Draft the changelog', 'Publish the release']);
    expect(onCreateTasks).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('can create separate tasks instead, keeping each step\'s detail', async () => {
    const { onAppendChecklist, onCreateTasks } = mount();
    await run();
    await waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.click(screen.getByLabelText(/Create separate tasks/));
    fireEvent.click(screen.getByRole('button', { name: /^Create 3 tasks$/ }));
    expect(onCreateTasks).toHaveBeenCalledWith(STEPS);
    expect(onAppendChecklist).not.toHaveBeenCalled();
  });

  it('stays open with an error when the host could not save the steps', async () => {
    const { onAppendChecklist, onClose } = mount();
    onAppendChecklist.mockReturnValueOnce(false);
    await run();
    await waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: /Add checklist to details/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i));
    expect(onClose).not.toHaveBeenCalled();
    expect(titles()).toHaveLength(3);
  });

  it('Copy puts the steps on the clipboard as a checklist', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { onAppendChecklist, onCreateTasks } = mount();
    await run();
    await waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('- [ ] Write the changelog\n- [ ] Tag the build\n- [ ] Publish the release'),
    );
    expect(onAppendChecklist).not.toHaveBeenCalled();
    expect(onCreateTasks).not.toHaveBeenCalled();
  });

  it('Regenerate asks again and replaces the steps', async () => {
    mount();
    await run();
    await waitFor(() => expect(titles()).toHaveLength(3));
    runAiTask.mockResolvedValueOnce(ok([{ title: 'A different plan' }]));
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    await waitFor(() => expect(titles()).toEqual(['A different plan']));
    expect(runAiTask).toHaveBeenCalledTimes(2);
  });

  it('says "1 task" for one step and "N tasks" otherwise', async () => {
    mount();
    await run(ok([{ title: 'Only step' }]));
    await waitFor(() => expect(titles()).toEqual(['Only step']));
    fireEvent.click(screen.getByLabelText(/Create separate tasks/));
    expect(screen.getByRole('button', { name: /^Create 1 task$/ })).toBeTruthy();
  });

  it('cannot be applied once every step was removed or emptied', async () => {
    mount();
    await run(ok([{ title: 'Only step' }]));
    await waitFor(() => expect(titles()).toEqual(['Only step']));
    fireEvent.change(screen.getByLabelText('Step title'), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: /Add checklist to details/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a reply cut off at the token limit can be read but not applied', async () => {
    mount();
    await run(ok(STEPS, { stopReason: 'length' }));
    await waitFor(() => expect(screen.getByText(/cut off/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Add checklist to details/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('notes a fallback connection, shows engine errors inline, and blocked runs with the Settings action', async () => {
    mount();
    await run(ok(STEPS, { fellBack: true }));
    await waitFor(() => expect(screen.getByText(/was not available/i)).toBeTruthy());
    cleanup();
    mount();
    await run({ ok: false, reason: 'engine', message: 'Provider returned 500', diagnostic: 'HTTP 500' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Provider returned 500'));
    cleanup();
    mount();
    await run({ ok: false, reason: 'not-configured', message: 'AI is not set up yet.' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy());
  });

  it('Discard applies nothing', async () => {
    const { onAppendChecklist, onCreateTasks, onClose } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Discard/ }));
    expect(onAppendChecklist).not.toHaveBeenCalled();
    expect(onCreateTasks).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('after a partial failure it says how many tasks were created and keeps only the rest, so a retry cannot duplicate', async () => {
    const { onCreateTasks, onClose } = mount();
    // New tasks are added last to first, so the two that got in are the last two steps.
    onCreateTasks.mockReturnValueOnce({ created: 2 });
    await run();
    await waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.click(screen.getByLabelText(/Create separate tasks/));
    fireEvent.click(screen.getByRole('button', { name: /Create 3 tasks/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/2 of 3/));
    expect(onClose).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Write the changelog']);
  });

  it('asks before Regenerate throws away steps the user edited, and keeps them on no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount();
    await run();
    await waitFor(() => expect(titles()).toHaveLength(3));
    fireEvent.change(screen.getAllByLabelText('Step title')[0]!, { target: { value: 'My own wording' } });
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(runAiTask).toHaveBeenCalledTimes(1);
    expect(titles()[0]).toBe('My own wording');
    confirm.mockReturnValue(true);
    runAiTask.mockResolvedValueOnce(ok([{ title: 'A different plan' }]));
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    await waitFor(() => expect(titles()).toEqual(['A different plan']));
    confirm.mockRestore();
  });

  it('keeps the steps on screen when a Regenerate request fails', async () => {
    mount();
    await run();
    await waitFor(() => expect(titles()).toHaveLength(3));
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'engine', message: 'Boom', diagnostic: '' });
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Boom/));
    expect(titles()).toHaveLength(3);
  });
});
