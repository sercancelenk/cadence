import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings } }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));

import { AIAssistantDialog } from './AIAssistantDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const answer = (text: string, stopReason: 'stop' | 'length' | 'other' = 'stop') => ({
  ok: true,
  value: text,
  connectionName: 'Company gateway',
  model: 'team/x',
  fellBack: false,
  repaired: false,
  stopReason,
});

function mount(props: Partial<React.ComponentProps<typeof AIAssistantDialog>> = {}) {
  const onClose = vi.fn();
  const onAppendToBody = vi.fn();
  render(
    <MemoryRouter>
      <AIAssistantDialog
        open
        onClose={onClose}
        onAppendToBody={onAppendToBody}
        task={{ title: 'Ship the release', body: 'Uses pnpm and Docker' }}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onClose, onAppendToBody };
}
const askButton = () => screen.getByRole('button', { name: 'Ask for recommendations' });
const firstAnswer = async (text = 'FIRST ANSWER', stop: 'stop' | 'length' = 'stop') => {
  runAiTask.mockResolvedValueOnce(answer(text, stop));
  fireEvent.click(askButton());
  await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
};
const followUp = (text: string) => {
  fireEvent.change(screen.getByLabelText('Follow-up question'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

beforeEach(() => {
  runAiTask.mockReset();
  navigate.mockClear();
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('opening', () => {
  it('sends nothing until the user asks, then shows only the assistant’s answer (no fake "You" message)', async () => {
    mount();
    expect(runAiTask).not.toHaveBeenCalled();
    await firstAnswer();
    expect(screen.queryByText('You')).toBeNull();
    expect(screen.getAllByText('Assistant')).toHaveLength(1);
    expect(screen.queryByText(/How should I approach this/)).toBeNull();
  });

  it('runs the coach task with the task, the lens and the stored legacy instructions', async () => {
    aiSettings = { ...cloud, systemPrompt: 'Always answer in Turkish' };
    mount({ context: { listName: 'Q4', dueAt: '2026-11-01', priority: 'high', linkedNoteTitle: 'Release plan' } });
    await firstAnswer();
    const args = runAiTask.mock.calls[0][0];
    expect(args.task.id).toBe('ai.coach');
    expect(args.input).toEqual({
      title: 'Ship the release',
      body: 'Uses pnpm and Docker',
      listName: 'Q4',
      dueAt: '2026-11-01',
      priority: 'high',
      linkedNoteTitle: 'Release plan',
    });
    expect(args.options).toEqual({ lens: 'plan' });
    expect(args.legacyFocusNote).toBe('Always answer in Turkish');
    expect(args.conversation ?? []).toEqual([]);
    expect(args.features).toEqual({ ai: true, aiPeople: true, aiFocusNote: true });
  });

  it('tells the runner when the task belongs to a person (people data), and says nothing otherwise', async () => {
    mount({ dataClass: 'people' });
    await firstAnswer();
    expect(runAiTask.mock.calls[0][0].dataClass).toBe('people');
    cleanup();
    runAiTask.mockReset();
    mount();
    await firstAnswer('OTHER');
    expect(runAiTask.mock.calls[0][0].dataClass).toBeUndefined();
  });

  it('shows the runner\'s block reason for people data inline, and no answer', async () => {
    mount({ dataClass: 'people' });
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'blocked-people', message: 'This uses 1:1 or feedback data, and “Cloud” is not allowed for it.' });
    fireEvent.click(askButton());
    await waitFor(() => expect(screen.getByText(/not allowed for it/)).toBeTruthy());
    expect(screen.queryByText('Assistant')).toBeNull();
  });

  it('says so when the connection set for this was unavailable and the default was used', async () => {
    mount();
    runAiTask.mockResolvedValueOnce({ ...answer('FIRST ANSWER'), fellBack: true });
    fireEvent.click(askButton());
    await waitFor(() => expect(screen.getByText('FIRST ANSWER')).toBeTruthy());
    expect(screen.getByText(/connection chosen for this was not available/i)).toBeTruthy();
  });

  it('works with extra connections alone, after the default was removed', async () => {
    aiSettings = { gatewayFormat: 'openai-chat', connections: [{ id: 'c1', name: 'Company gateway', provider: 'gateway', baseUrl: 'https://gw.example.com/v1', model: 'm' }] };
    mount();
    expect(screen.queryByText(/haven.t configured an AI provider/i)).toBeNull();
    await firstAnswer();
  });

  it('shows the one-time notice when a stored system instruction exists, and not otherwise', () => {
    window.localStorage.clear();
    aiSettings = { ...cloud, systemPrompt: 'Always answer in Turkish' };
    mount();
    expect(screen.getByText(/earlier instructions are still applied/i)).toBeTruthy();
    cleanup();
    aiSettings = cloud;
    mount();
    expect(screen.queryByText(/earlier instructions are still applied/i)).toBeNull();
  });

  it('shows what was read as chips, and "What was sent" is the task text, not an instruction', async () => {
    mount({ context: { listName: 'Q4', priority: 'high' } });
    const chips = within(screen.getByRole('list', { name: 'What the AI read' }));
    expect(chips.getByText('Task')).toBeTruthy();
    expect(chips.getByText(/details included \(20 characters\)/)).toBeTruthy();
    expect(chips.getByText('List')).toBeTruthy();
    expect(chips.getByText(/Q4/)).toBeTruthy();
    expect(chips.getByText('Priority')).toBeTruthy();
    const sent = chips.getByText(/Uses pnpm and Docker/);
    expect(sent.textContent).toContain('Ship the release');
    expect(sent.textContent).not.toMatch(/coach|approach|rules/i);
  });

  it('says "title only" when there are no details', () => {
    mount({ task: { title: 'Call Maria' } });
    expect(screen.getByText(/title only/)).toBeTruthy();
  });
});

describe('lens', () => {
  it('changing it after an answer starts over with the new lens', async () => {
    mount();
    await firstAnswer('PLAN ANSWER');
    runAiTask.mockResolvedValueOnce(answer('RISK ANSWER'));
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'risks' } });
    await waitFor(() => expect(screen.getByText('RISK ANSWER')).toBeTruthy());
    expect(screen.queryByText('PLAN ANSWER')).toBeNull();
    expect(runAiTask.mock.calls[1][0].options).toEqual({ lens: 'risks' });
    expect(runAiTask.mock.calls[1][0].conversation ?? []).toEqual([]);
  });

  it('changing it before asking sends nothing', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'first15' } });
    expect(runAiTask).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Focus') as HTMLSelectElement).value).toBe('first15');
  });
});

describe('follow-ups', () => {
  it('shows the user’s own question as "You" and sends the conversation so far', async () => {
    mount();
    await firstAnswer('FIRST ANSWER');
    runAiTask.mockResolvedValueOnce(answer('SECOND ANSWER'));
    followUp('make it shorter');
    await waitFor(() => expect(screen.getByText('SECOND ANSWER')).toBeTruthy());
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('make it shorter')).toBeTruthy();
    expect(runAiTask.mock.calls[1][0].conversation).toEqual([
      { role: 'assistant', content: 'FIRST ANSWER' },
      { role: 'user', content: 'make it shorter' },
    ]);
  });

  it('Continue after a cut-off reply resumes without showing a fake "You" message', async () => {
    mount();
    await firstAnswer('PART ONE', 'length');
    runAiTask.mockResolvedValueOnce(answer('PART TWO'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByText('PART TWO')).toBeTruthy());
    const convo = runAiTask.mock.calls[1][0].conversation;
    expect(convo[0]).toEqual({ role: 'assistant', content: 'PART ONE' });
    expect(convo[1].role).toBe('user');
    expect(convo[1].content).toMatch(/continue from exactly where you left off/i);
    expect(screen.queryByText(/continue from exactly/i)).toBeNull();
    expect(screen.queryByText('You')).toBeNull();
  });

  it('a failed follow-up gives the question back, and the retry sends no two user turns in a row', async () => {
    mount();
    await firstAnswer('FIRST ANSWER');
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'engine', message: 'Boom', diagnostic: '' });
    followUp('make it shorter');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Boom/));
    expect((screen.getByLabelText('Follow-up question') as HTMLTextAreaElement).value).toBe('make it shorter');
    expect(screen.queryByText('You')).toBeNull();
    runAiTask.mockResolvedValueOnce(answer('SECOND ANSWER'));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('SECOND ANSWER')).toBeTruthy());
    expect(runAiTask.mock.calls[2][0].conversation).toEqual([
      { role: 'assistant', content: 'FIRST ANSWER' },
      { role: 'user', content: 'make it shorter' },
    ]);
  });

  it('shows Continue only when the reply was cut off', async () => {
    mount();
    await firstAnswer();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });
});

describe('blocked runs offer the way out', () => {
  it.each([
    ['not-configured', 'AI is not set up yet. Connect a provider in Settings.'],
    ['capability', '“Local” did not return reliable JSON when tested.'],
    ['blocked-people', 'This uses 1:1 or feedback data, and “Cloud” is not allowed for it.'],
  ])('%s shows the message and an Open AI settings button', async (reason, message) => {
    mount({ dataClass: 'people' });
    runAiTask.mockResolvedValueOnce({ ok: false, reason, message });
    fireEvent.click(askButton());
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });

  it('a policy block says so and offers no settings button (the user cannot change it)', async () => {
    mount({ dataClass: 'people' });
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'policy', message: 'Your organization does not allow AI on 1:1 notes and feedback.' });
    fireEvent.click(askButton());
    await waitFor(() => expect(screen.getByText(/does not allow AI/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Open AI settings/ })).toBeNull();
  });

  it('with no provider connected there is a button to Settings', () => {
    aiSettings = undefined;
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });
});

describe('while it works', () => {
  it('announces the wait to assistive technology and offers Stop from the first request', async () => {
    mount();
    let release: (v: unknown) => void = () => {};
    runAiTask.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    fireEvent.click(askButton());
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(screen.getByRole('status').textContent).toMatch(/Thinking/);
    const stop = screen.getByRole('button', { name: 'Stop' });
    const signal = (runAiTask.mock.calls[0][0] as { signal: AbortSignal }).signal;
    expect(signal.aborted).toBe(false);
    fireEvent.click(stop);
    expect(signal.aborted).toBe(true);
    release(answer('late'));
  });
});

describe('people data is visible as people data', () => {
  it('adds a chip when the task belongs to a person, and none otherwise', () => {
    mount({ dataClass: 'people' });
    expect(screen.getByText('People data')).toBeTruthy();
    cleanup();
    mount();
    expect(screen.queryByText('People data')).toBeNull();
  });
});

describe('saving', () => {
  it('"Save to task" hands over the latest answer', async () => {
    const { onAppendToBody } = mount();
    await firstAnswer('PLAN ANSWER');
    fireEvent.click(screen.getByRole('button', { name: 'Save to task' }));
    expect(onAppendToBody).toHaveBeenCalledWith('PLAN ANSWER');
  });

  it('when the task could not be saved, the dialog stays open and says so', async () => {
    const { onClose, onAppendToBody } = mount();
    onAppendToBody.mockReturnValueOnce(false);
    await firstAnswer('PLAN ANSWER');
    fireEvent.click(screen.getByRole('button', { name: 'Save to task' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('PLAN ANSWER')).toBeTruthy();
  });

  it('there is no Save button without a handler', async () => {
    mount({ onAppendToBody: undefined });
    await firstAnswer();
    expect(screen.queryByRole('button', { name: 'Save to task' })).toBeNull();
  });
});

describe('when it does not work', () => {
  it('shows the runner’s message inline and no assistant turn', async () => {
    mount();
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'engine', message: 'The gateway answered HTTP 405', diagnostic: 'POST https://x' });
    fireEvent.click(askButton());
    await waitFor(() => expect(screen.getByText('The gateway answered HTTP 405')).toBeTruthy());
    expect(screen.queryByText('Assistant')).toBeNull();
    expect(screen.getByText('Diagnostic details')).toBeTruthy();
  });

  it('a cancelled run shows nothing', async () => {
    mount();
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'cancelled', message: 'Cancelled.' });
    fireEvent.click(askButton());
    await waitFor(() => expect(runAiTask).toHaveBeenCalled());
    expect(screen.queryByText('Cancelled.')).toBeNull();
  });

  it('without a configured provider it explains how to connect one and never runs', () => {
    aiSettings = undefined;
    mount();
    expect(screen.getByText(/haven.t configured an AI provider/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask for recommendations' })).toBeNull();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('renders nothing when the organization turned AI off', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByText('AI Assistant')).toBeNull();
  });
});

it('names the connection and the model quietly after an answer', async () => {
  mount();
  await firstAnswer();
  expect(screen.getByText(/via Company gateway · team\/x/)).toBeTruthy();
});
