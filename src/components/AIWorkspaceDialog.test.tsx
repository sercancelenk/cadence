import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const embedTexts = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };
const appData = () => ({
  aiSettings,
  notes: [
    { id: 'n1', title: 'Roadmap', body: '', bodyPlainText: 'The launch is planned for March.', locked: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'n2', title: 'Secret', body: '', bodyPlainText: 'launch secret', locked: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ],
  todoItems: [{ id: 't1', groupId: 'g', title: 'Prepare launch brief', status: 'todo', done: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
  items: [{ id: 'i1', personId: 'p1', kind: 'feedback', title: 'Launch feedback', body: 'launch went well', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
  people: [{ id: 'p1', teamId: 'tm1', name: 'Ayşe' }],
});

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('../lib/ai/embeddings', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/ai/embeddings')>()), embedTexts }));
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

import { AIWorkspaceDialog } from './AIWorkspaceDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const ok = (value = 'The launch is in March [1].') => ({ ok: true, value, connectionName: 'Company', model: 'team/x', fellBack: false, repaired: false, stopReason: 'stop' });

function mount() {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIWorkspaceDialog open onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}
const ask = async (question = 'When is the launch?', result: unknown = ok()) => {
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: question } });
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Ask$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  embedTexts.mockReset();
  navigate.mockClear();
  writeText.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIWorkspaceDialog', () => {
  it('sends nothing until a question is asked, and is absent when AI is off', () => {
    mount();
    expect((screen.getByRole('button', { name: /^Ask$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(runAiTask).not.toHaveBeenCalled();
    cleanup();
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Ask$/ })).toBeNull();
  });

  it('sends the question with matching notes and tasks, never locked notes or people records', async () => {
    mount();
    await ask();
    const call = runAiTask.mock.calls[0][0] as { input: { question: string; sources: Array<{ id: string }> }; task: { id: string }; dataClass?: string };
    expect(call.task.id).toBe('ai.workspace');
    expect(call.input.sources.map((s) => s.id).sort()).toEqual(['n1', 't1']);
    expect(call.dataClass).toBeUndefined();
  });

  it('lists the sources as links and the chip shows what was sent', async () => {
    const { onClose } = mount();
    await ask();
    const link = await screen.findByRole('link', { name: /Roadmap/ });
    expect(link.getAttribute('href')).toBe('/notes?id=n1');
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText(/2 items/)).toBeTruthy();
  });

  it('including people records raises the data class and adds them as sources', async () => {
    mount();
    fireEvent.click(screen.getByLabelText(/Include people records/));
    await ask();
    const call = runAiTask.mock.calls[0][0] as { input: { sources: Array<{ id: string }> }; dataClass?: string };
    expect(call.dataClass).toBe('people');
    expect(call.input.sources.map((s) => s.id)).toContain('i1');
    expect((await screen.findByRole('link', { name: /Launch feedback/ })).getAttribute('href')).toBe('/teams/tm1/people/p1');
  });

  it('the people option is not offered when the organization turned it off', () => {
    flags = { ai: true, aiPeople: false, aiFocusNote: true };
    mount();
    expect(screen.queryByLabelText(/Include people records/)).toBeNull();
  });

  it('says so, without asking the model, when nothing in the workspace matches', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'zzzqqq' } });
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/ }));
    expect(await screen.findByText(/nothing in your notes and tasks matches/i)).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('flags a citation that is not one of the sources', async () => {
    mount();
    await ask('When is the launch?', ok('March [1] and maybe [9].'));
    expect(await screen.findByText(/cites a source that was not given: \[9\]/i)).toBeTruthy();
  });

  it('re-ranks by meaning only when an embedding model is set, and still answers if that fails', async () => {
    aiSettings = { ...cloud, embeddingModel: 'text-embedding-3-small' };
    embedTexts.mockResolvedValueOnce([[1, 0], [0, 1], [1, 0]]);
    mount();
    await ask();
    expect(embedTexts).toHaveBeenCalledTimes(1);
    const first = runAiTask.mock.calls[0][0] as { input: { sources: Array<{ id: string }> } };
    expect(first.input.sources[0].id).toBe('t1');
    cleanup();
    runAiTask.mockReset();
    embedTexts.mockRejectedValueOnce(new Error('offline'));
    mount();
    await ask();
    expect(runAiTask).toHaveBeenCalledTimes(1);
  });

  it('does not send people records to an embeddings endpoint on a connection not allowed for people data', async () => {
    aiSettings = { ...cloud, embeddingModel: 'text-embedding-3-small' };
    mount();
    fireEvent.click(screen.getByLabelText(/Include people records/));
    await ask();
    expect(embedTexts).not.toHaveBeenCalled();
    expect(runAiTask).toHaveBeenCalledTimes(1);
  });

  it('a blocked run shows the Settings path', async () => {
    mount();
    await ask('When is the launch?', { ok: false, reason: 'not-configured', message: 'AI is not set up yet.' });
    fireEvent.click(await screen.findByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });

  it('shows the text as it streams in, and Copy copies the answer', async () => {
    let push: (t: string) => void = () => {};
    runAiTask.mockImplementationOnce(async (args: { onText?: (t: string) => void }) => {
      push = args.onText ?? (() => {});
      await new Promise((r) => setTimeout(r, 30));
      return ok();
    });
    mount();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'When is the launch?' } });
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/ }));
    await waitFor(() => expect(runAiTask).toHaveBeenCalled());
    act(() => push('The launch is'));
    expect(await screen.findByText('The launch is')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /^Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('The launch is in March [1].'));
  });

  it('cancelling while the meaning search runs aborts the embeddings request', async () => {
    aiSettings = { ...cloud, embeddingModel: 'text-embedding-3-small' };
    let seen: AbortSignal | undefined;
    embedTexts.mockImplementation((args: { signal?: AbortSignal }) => {
      seen = args.signal;
      return new Promise(() => {});
    });
    mount();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'When is the launch?' } });
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/ }));
    await waitFor(() => expect(embedTexts).toHaveBeenCalled());
    expect(seen).toBeDefined();
    cleanup();
    expect(seen?.aborted).toBe(true);
  });
});
