import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
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
    <AIAssistantDialog
      open
      onClose={onClose}
      onAppendToBody={onAppendToBody}
      task={{ title: 'Ship the release', body: 'Uses pnpm and Docker' }}
      {...props}
    />,
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

  it('shows Continue only when the reply was cut off', async () => {
    mount();
    await firstAnswer();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });
});

describe('saving', () => {
  it('"Save to task" hands over the latest answer', async () => {
    const { onAppendToBody } = mount();
    await firstAnswer('PLAN ANSWER');
    fireEvent.click(screen.getByRole('button', { name: 'Save to task' }));
    expect(onAppendToBody).toHaveBeenCalledWith('PLAN ANSWER');
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

it('names the connection quietly after an answer', async () => {
  mount();
  await firstAnswer();
  expect(screen.getByText(/via Company gateway/)).toBeTruthy();
});
