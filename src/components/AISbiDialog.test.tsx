import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';
import type { AiEditorTarget } from '../lib/ai/editorTarget';
import { sbiToText } from '../lib/ai/prompts/sbi';

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

import { AISbiDialog } from './AISbiDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const TEXT = 'You were rude in the meeting yesterday.';
const OUT = { situation: 'In yesterday\'s meeting', behavior: 'you talked over Ana', impact: '' };
const ok = (value = OUT, over: Record<string, unknown> = {}) => ({
  ok: true,
  value,
  connectionName: 'Local model',
  model: 'llama3',
  fellBack: false,
  repaired: false,
  stopReason: 'stop',
  ...over,
});
const makeTarget = (over: Partial<AiEditorTarget> = {}): AiEditorTarget => ({
  selectedText: TEXT,
  isCurrent: () => true,
  insertBlocks: vi.fn(() => 'end' as const),
  replaceSelection: vi.fn(() => true),
  ...over,
});

function mount(target = makeTarget(), beforeApply?: () => void | (() => void)) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AISbiDialog open onClose={onClose} text={TEXT} kind="concern" target={target} beforeApply={beforeApply} />
    </MemoryRouter>,
  );
  return { onClose, target };
}
const run = async (result: unknown = ok()) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Rewrite as SBI$/ }));
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

describe('AISbiDialog', () => {
  it('shows what will be sent and sends nothing until asked', () => {
    mount();
    expect(screen.getByText('Feedback text')).toBeTruthy();
    expect(screen.getByText(/39 characters/)).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('renders nothing when AI is off by policy; stays off when the organization blocks people data', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Rewrite as SBI$/ })).toBeNull();
    cleanup();
    flags = { ai: true, aiPeople: false, aiFocusNote: true };
    mount();
    expect(screen.queryByRole('button', { name: /^Rewrite as SBI$/ })).toBeNull();
  });

  it('shows that people data is being sent', () => {
    mount();
    expect(screen.getByText('People data')).toBeTruthy();
  });

  it('runs the SBI task on the text and the feedback type, then shows the two versions side by side', async () => {
    mount();
    await run();
    expect(runAiTask).toHaveBeenCalledWith(
      expect.objectContaining({ task: expect.objectContaining({ id: 'ai.sbi' }), input: { text: TEXT, kind: 'concern' } }),
    );
    await waitFor(() => expect(screen.getByText('Your text')).toBeTruthy());
    expect(screen.getByText('SBI version')).toBeTruthy();
    expect(document.querySelector('.ai-sbi__text')?.textContent).toBe(TEXT);
    expect(screen.getByLabelText(/Situation/).closest('label')?.textContent).toContain('In yesterday\'s meeting');
    expect(screen.getByLabelText(/Behavior/).closest('label')?.textContent).toContain('you talked over Ana');
    expect(screen.queryByLabelText(/Impact/)).toBeNull();
    expect(screen.getByText(/No impact is stated/i)).toBeTruthy();
  });

  it('a selection longer than what is sent can be rewritten for reading or copying, but never replaces the whole selection', async () => {
    const long = 'x'.repeat(8_001);
    const target = makeTarget({ selectedText: long });
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AISbiDialog open onClose={onClose} text={long} kind="concern" target={target} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/only the first 8,000 characters/i)).toBeTruthy();
    await run();
    await waitFor(() => expect(screen.getByRole('button', { name: /Replace selection/ })).toBeTruthy());
    expect((screen.getByRole('button', { name: /Replace selection/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Copy/ })).toBeTruthy();
    expect(target.replaceSelection).not.toHaveBeenCalled();
  });

  it('lets the user take only some of the elements, and cannot replace with none', async () => {
    const { target } = mount();
    await run(ok({ situation: 'In yesterday\'s meeting', behavior: 'you talked over Ana', impact: 'she stopped sharing ideas' }));
    fireEvent.click(await screen.findByLabelText(/Impact/));
    fireEvent.click(screen.getByRole('button', { name: /Replace selection/ }));
    expect(target.replaceSelection).toHaveBeenCalledWith('Situation: In yesterday\'s meeting\nBehavior: you talked over Ana');
    fireEvent.click(screen.getByLabelText(/Situation/));
    fireEvent.click(screen.getByLabelText(/Behavior/));
    expect((screen.getByRole('button', { name: /Replace selection/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Copy copies only the ticked elements, and is not offered when none are ticked', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mount();
    await run(ok({ situation: 'In yesterday\'s meeting', behavior: 'you talked over Ana', impact: 'she stopped sharing ideas' }));
    fireEvent.click(await screen.findByLabelText(/Impact/));
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Situation: In yesterday\'s meeting\nBehavior: you talked over Ana'));
    fireEvent.click(screen.getByLabelText(/Situation/));
    fireEvent.click(screen.getByLabelText(/Behavior/));
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
  });

  it('Replace selection puts the labelled lines in place of the selection, then closes', async () => {
    const { onClose, target } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Replace selection/ }));
    expect(target.replaceSelection).toHaveBeenCalledTimes(1);
    expect(target.replaceSelection).toHaveBeenCalledWith(sbiToText(OUT));
    expect(toast.showSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('when the text changed meanwhile, it replaces nothing, says so and stays open', async () => {
    const { onClose } = mount(makeTarget({ replaceSelection: vi.fn(() => false) }));
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Replace selection/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/changed while this was open/i));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Replace selection/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Copy/ })).toBeTruthy();
  });

  it('copies the SBI text without touching the note', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { target } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith(sbiToText(OUT));
    expect(target.replaceSelection).not.toHaveBeenCalled();
  });

  it('cannot be started without text, and sends nothing', () => {
    render(
      <MemoryRouter>
        <AISbiDialog open onClose={() => {}} text="   " kind="concern" target={makeTarget()} />
      </MemoryRouter>,
    );
    expect((screen.getByRole('button', { name: /^Rewrite as SBI$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('a block that is fixed in Settings has a button to Settings', async () => {
    mount();
    await run({ ok: false, reason: 'blocked-people', message: 'This uses 1:1 or feedback data, and “Cloud” is not allowed for it.' });
    fireEvent.click(await screen.findByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });

  it('says so when copying did not work', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(toast.showWarning).toHaveBeenCalledWith(expect.stringMatching(/could not copy/i), expect.anything()));
    expect(toast.showSuccess).not.toHaveBeenCalledWith('Copied', expect.anything());
  });

  it('a connection that is not allowed for people data blocks the run and sends nothing to the note', async () => {
    const { target } = mount();
    await run({ ok: false, reason: 'blocked-people', message: 'This uses 1:1 or feedback data, and “Cloud” is not allowed for it.' });
    await waitFor(() => expect(screen.getByText(/is not allowed for it/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Replace selection/ })).toBeNull();
    expect(target.replaceSelection).not.toHaveBeenCalled();
  });

  it('a reply cut off at the token limit cannot replace the selection', async () => {
    mount();
    await run(ok(OUT, { stopReason: 'length' }));
    await waitFor(() => expect(screen.getByText(/cut off/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Replace selection/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('notes a fallback connection and shows engine errors inline', async () => {
    mount();
    await run(ok(OUT, { fellBack: true }));
    await waitFor(() => expect(screen.getByText(/was not available/i)).toBeTruthy());
    cleanup();
    mount();
    await run({ ok: false, reason: 'engine', message: 'Provider returned 500', diagnostic: 'HTTP 500' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Provider returned 500'));
  });

  it('Discard changes nothing', async () => {
    const { onClose, target } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Discard/ }));
    expect(target.replaceSelection).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  describe('frameworks', () => {
    const pick = (name: RegExp) => fireEvent.click(screen.getByRole('radio', { name }));
    const runAs = async (button: RegExp, result: unknown) => {
      runAiTask.mockResolvedValueOnce(result);
      fireEvent.click(screen.getByRole('button', { name: button }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalled());
    };

    it('offers SBI, Radical Candor and a review draft, with SBI chosen first', () => {
      mount();
      expect(screen.getByRole('radio', { name: /^SBI$/ })).toHaveProperty('checked', true);
      expect(screen.getByRole('radio', { name: /Radical Candor/ })).toBeTruthy();
      expect(screen.getByRole('radio', { name: /Review draft/ })).toBeTruthy();
    });

    it('rewrites as Radical Candor and replaces the selection with the kept parts only', async () => {
      const { target } = mount();
      pick(/Radical Candor/);
      await runAs(/^Rewrite as Radical Candor$/, ok({ care: 'You review fast.', challenge: 'Reviews arrive late.' } as never));
      expect(runAiTask).toHaveBeenCalledWith(
        expect.objectContaining({ task: expect.objectContaining({ id: 'ai.candor' }), input: { text: TEXT, kind: 'concern' } }),
      );
      await screen.findByText('Radical Candor version');
      fireEvent.click(screen.getByLabelText('Care personally'));
      fireEvent.click(screen.getByRole('button', { name: /Replace selection/ }));
      expect(target.replaceSelection).toHaveBeenCalledWith('Challenge directly: Reviews arrive late.');
    });

    it('drafts a review with lists, and writes them as bullets', async () => {
      const { target } = mount();
      pick(/Review draft/);
      await runAs(/^Draft a review$/, ok({ summary: 'Solid quarter.', strengths: ['Architecture'], growth: ['Review turnaround'] } as never));
      expect(runAiTask).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ id: 'ai.review' }) }));
      await screen.findByText('Review draft version');
      expect(screen.getByLabelText('Strengths').closest('label')?.textContent).toContain('Architecture');
      fireEvent.click(screen.getByRole('button', { name: /Replace selection/ }));
      expect(target.replaceSelection).toHaveBeenCalledWith(
        'Summary: Solid quarter.\nStrengths:\n- Architecture\nGrowth areas:\n- Review turnaround',
      );
    });

    it('changing the framework after a result clears it, and the SBI-only hint is not shown for others', async () => {
      mount();
      await run();
      await screen.findByText('SBI version');
      pick(/Radical Candor/);
      expect(screen.queryByText('SBI version')).toBeNull();
      expect(screen.getByRole('button', { name: /^Rewrite as Radical Candor$/ })).toBeTruthy();
      runAiTask.mockResolvedValueOnce(ok({ care: 'A', challenge: '' } as never));
      fireEvent.click(screen.getByRole('button', { name: /^Rewrite as Radical Candor$/ }));
      await screen.findByText('Radical Candor version');
      expect(screen.queryByText(/No impact is stated/i)).toBeNull();
    });

    it('regenerate keeps the chosen framework', async () => {
      mount();
      pick(/Review draft/);
      await runAs(/^Draft a review$/, ok({ summary: 'S', strengths: [], growth: [] } as never));
      await screen.findByText('Review draft version');
      runAiTask.mockResolvedValueOnce(ok({ summary: 'S2', strengths: [], growth: [] } as never));
      fireEvent.click(screen.getByRole('button', { name: /Regenerate|Try again/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
      expect(runAiTask.mock.calls[1][0]).toMatchObject({ task: { id: 'ai.review' } });
    });
  });

  it('saves the restore point only once the selection was really replaced', async () => {
    const commit = vi.fn();
    mount(makeTarget({ replaceSelection: vi.fn(() => false) }), vi.fn(() => commit));
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Replace selection/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(commit).not.toHaveBeenCalled();
    cleanup();
    runAiTask.mockReset();
    const commit2 = vi.fn();
    mount(makeTarget(), vi.fn(() => commit2));
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Replace selection/ }));
    await waitFor(() => expect(commit2).toHaveBeenCalledTimes(1));
  });
});
