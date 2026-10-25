import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';
import type { AiEditorTarget } from '../lib/ai/editorTarget';
import { challengeToBlocks } from '../lib/ai/challengeBlocks';

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

import { AIChallengeDialog } from './AIChallengeDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const OUT = {
  assumptions: ['The team knows the billing code'],
  risks: ['Month-end close is missed'],
  alternatives: [],
  questions: ['Who signs off the cutover?'],
};
const ok = (over: Record<string, unknown> = {}) => ({
  ok: true,
  value: OUT,
  connectionName: 'Company gateway',
  model: 'team/x',
  fellBack: false,
  repaired: false,
  stopReason: 'stop',
  ...over,
});
const makeTarget = (over: Partial<AiEditorTarget> = {}): AiEditorTarget => ({
  selectedText: '',
  isCurrent: () => true,
  insertBlocks: vi.fn(() => 'end' as const),
  replaceSelection: vi.fn(() => true),
  ...over,
});

function mount(target = makeTarget(), text = 'We rewrite billing in one weekend.', beforeApply?: () => void | (() => void)) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIChallengeDialog open onClose={onClose} text={text} target={target} beforeApply={beforeApply} />
    </MemoryRouter>,
  );
  return { onClose, target };
}
const run = async (result: unknown = ok()) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Challenge this$/ }));
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

describe('nothing to work on', () => {
  it('cannot be started without text, and sends nothing', () => {
    mount(makeTarget(), '  ');
    expect((screen.getByRole('button', { name: /^Challenge this$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(runAiTask).not.toHaveBeenCalled();
  });
});

describe('AIChallengeDialog', () => {
  it('shows what will be sent and sends nothing until asked', () => {
    mount();
    expect(screen.getByText('Text')).toBeTruthy();
    expect(screen.getByText(/34 characters/)).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('renders nothing when AI is off by policy, and points to Settings when nothing is connected', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Challenge this$/ })).toBeNull();
    cleanup();
    flags = { ai: true, aiPeople: true, aiFocusNote: true };
    aiSettings = undefined;
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });

  it('runs the challenge task and shows only the sections that have points', async () => {
    mount();
    await run();
    expect(runAiTask).toHaveBeenCalledWith(
      expect.objectContaining({ input: { text: 'We rewrite billing in one weekend.' }, task: expect.objectContaining({ id: 'ai.challenge' }) }),
    );
    await waitFor(() => expect(screen.getByText('The team knows the billing code')).toBeTruthy());
    expect(screen.getByText('Month-end close is missed')).toBeTruthy();
    expect(screen.getByText('Who signs off the cutover?')).toBeTruthy();
    expect(screen.queryByText('Alternatives')).toBeNull();
  });

  it('Add to note appends the blocks at the end of the note once, then closes', async () => {
    const { onClose, target } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Add to note/ }));
    expect(target.insertBlocks).toHaveBeenCalledTimes(1);
    expect(target.insertBlocks).toHaveBeenCalledWith(challengeToBlocks(OUT), 'end');
    expect(toast.showSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('saves a restore point of the note just before it adds the result', async () => {
    const order: string[] = [];
    const target = makeTarget({ insertBlocks: vi.fn(() => (order.push('insert'), 'end' as const)) });
    mount(target, 'We rewrite billing in one weekend.', () => {
      order.push('restore point');
    });
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Add to note/ }));
    expect(order).toEqual(['restore point', 'insert']);
  });

  it('Copy puts the points on the clipboard as plain text without touching the note', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { target } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain('Assumptions');
    expect(text).toContain('- The team knows the billing code');
    expect(text).not.toContain('Alternatives');
    expect(target.insertBlocks).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with an error when the editor cannot take the blocks', async () => {
    const { onClose } = mount(makeTarget({ insertBlocks: vi.fn(() => null) }));
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Add to note/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be added/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a reply cut off at the token limit cannot be added', async () => {
    mount();
    await run(ok({ stopReason: 'length' }));
    await waitFor(() => expect(screen.getByText(/cut off/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Add to note/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('notes a fallback connection, shows engine errors inline and blocked runs with the Settings action', async () => {
    mount();
    await run(ok({ fellBack: true }));
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

  it('Discard adds nothing', async () => {
    const { onClose, target } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Discard/ }));
    expect(target.insertBlocks).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('saves the restore point only once the blocks were really added', async () => {
    const commit = vi.fn();
    const beforeApply = vi.fn(() => commit);
    mount(makeTarget({ insertBlocks: vi.fn(() => null) }), undefined, beforeApply);
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Add to note/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(commit).not.toHaveBeenCalled();
    cleanup();
    const commit2 = vi.fn();
    mount(makeTarget(), undefined, vi.fn(() => commit2));
    runAiTask.mockReset();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Add to note/ }));
    await waitFor(() => expect(commit2).toHaveBeenCalledTimes(1));
  });
});
