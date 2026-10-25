import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';
import type { AiEditorTarget } from '../lib/ai/editorTarget';

const runAiTask = vi.hoisted(() => vi.fn());
const validateMermaid = vi.hoisted(() => vi.fn());
const renderMermaidSvg = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('../lib/richTextMermaid', () => ({ validateMermaid, renderMermaidSvg }));
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

import { AIVisualizeDialog } from './AIVisualizeDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const SOURCE = 'flowchart TD\n  A[Sign in] --> B[Token]';
const ok = (source = SOURCE, over: Record<string, unknown> = {}) => ({
  ok: true,
  value: { source },
  connectionName: 'Company gateway',
  model: 'team/x',
  fellBack: false,
  repaired: false,
  stopReason: 'stop',
  ...over,
});

function makeTarget(over: Partial<AiEditorTarget> = {}): AiEditorTarget {
  return {
    selectedText: 'User signs in and gets a token',
    isCurrent: () => true,
    insertBlocks: vi.fn(() => 'after-selection' as const),
    replaceSelection: vi.fn(() => true),
    ...over,
  };
}

function mount(target = makeTarget(), text = 'User signs in and gets a token', beforeApply?: () => void | (() => void)) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIVisualizeDialog open onClose={onClose} text={text} target={target} beforeApply={beforeApply} />
    </MemoryRouter>,
  );
  return { onClose, target };
}
const generate = async (result: unknown = ok()) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  validateMermaid.mockReset().mockResolvedValue({ ok: true });
  renderMermaidSvg.mockReset().mockResolvedValue({ ok: true, svg: '<svg data-testid="diagram"></svg>' });
  navigate.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('before generating', () => {
  it('shows what will be sent and sends nothing until Generate is pressed', () => {
    mount(makeTarget(), 'User signs in and gets a token');
    expect(screen.getByText('Text')).toBeTruthy();
    expect(screen.getByText(/30 characters/)).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('renders nothing when the organization turned AI off', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Generate$/ })).toBeNull();
  });

  it('points to Settings when no connection is usable', () => {
    aiSettings = undefined;
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });
});

describe('where the diagram will go', () => {
  it('says "after the selection" when text was selected, and names the cursor block when not', () => {
    mount(makeTarget({ selectedText: 'User signs in' }));
    expect(screen.getByText(/after the selection/i)).toBeTruthy();
    cleanup();
    mount(makeTarget({ selectedText: '' }));
    expect(screen.queryByText(/after the selection/i)).toBeNull();
    expect(screen.getByText(/after the paragraph where your cursor is/i)).toBeTruthy();
  });

  it('shows that the note was unlocked this session when it was', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AIVisualizeDialog open onClose={onClose} text="x" target={makeTarget()} noteUnlocked />
      </MemoryRouter>,
    );
    expect(screen.getByText(/unlocked this session/i)).toBeTruthy();
  });
});

describe('nothing to work on', () => {
  it('explains that there is no text, and sends nothing', async () => {
    mount(makeTarget(), '   ');
    const generateBtn = screen.getByRole('button', { name: /^Generate$/ }) as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(true);
    expect(runAiTask).not.toHaveBeenCalled();
  });
});

describe('generating', () => {
  it('runs the visualize task with the chosen diagram type and shows the preview and the source on request', async () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Diagram type/), { target: { value: 'sequence' } });
    await generate();
    expect(runAiTask).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { text: 'User signs in and gets a token' },
        options: { kind: 'sequence' },
        task: expect.objectContaining({ id: 'ai.visualize' }),
      }),
    );
    await waitFor(() => expect(screen.getByTestId('diagram')).toBeTruthy());
    expect(screen.queryByText(/A\[Sign in\]/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show source/ }));
    expect(screen.getByText(/A\[Sign in\]/)).toBeTruthy();
  });

  it('asks for one corrected diagram when Mermaid rejects the first, with the parser message', async () => {
    validateMermaid.mockResolvedValueOnce({ ok: false, error: 'Parse error on line 2' }).mockResolvedValueOnce({ ok: true });
    mount();
    runAiTask.mockResolvedValueOnce(ok('flowchart TD\n  A--')).mockResolvedValueOnce(ok());
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));
    await waitFor(() => expect(screen.getByTestId('diagram')).toBeTruthy());
    expect(runAiTask).toHaveBeenCalledTimes(2);
    const second = runAiTask.mock.calls[1][0] as { conversation: Array<{ role: string; content: string }> };
    expect(second.conversation[0]).toEqual({ role: 'assistant', content: 'flowchart TD\n  A--' });
    expect(second.conversation[1].role).toBe('user');
    expect(second.conversation[1].content).toContain('Parse error on line 2');
  });

  it('gives up after one repair: an error, no Insert button, nothing inserted', async () => {
    validateMermaid.mockResolvedValue({ ok: false, error: 'bad' });
    const { target } = mount();
    runAiTask.mockResolvedValueOnce(ok('flowchart TD\n  A--')).mockResolvedValueOnce(ok('flowchart TD\n  B--'));
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not make a diagram/i));
    expect(runAiTask).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /Insert diagram/ })).toBeNull();
    expect(target.insertBlocks).not.toHaveBeenCalled();
  });

  it('a reply cut off at the token limit can be read but not inserted', async () => {
    mount();
    await generate(ok(SOURCE, { stopReason: 'length' }));
    await waitFor(() => expect(screen.getByText(/cut off/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Insert diagram/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when another connection served the request', async () => {
    mount();
    await generate(ok(SOURCE, { fellBack: true }));
    await waitFor(() => expect(screen.getByText(/was not available/i)).toBeTruthy());
  });

  it('shows the Settings action for a blocked run', async () => {
    mount();
    await generate({ ok: false, reason: 'not-configured', message: 'AI is not set up yet.' });
    await waitFor(() => expect(screen.getByText('AI is not set up yet.')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy();
  });

  it('shows an engine error inline with its diagnostic and lets the user try again', async () => {
    mount();
    await generate({ ok: false, reason: 'engine', message: 'Provider returned 500', diagnostic: 'HTTP 500' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Provider returned 500'));
    expect(screen.getByText('Diagnostic details')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Generate$/ })).toBeTruthy();
  });
});

describe('inserting', () => {
  it('inserts the source as a mermaid code block after the selection, then closes', async () => {
    const { onClose, target } = mount();
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: /Insert diagram/ }));
    expect(target.insertBlocks).toHaveBeenCalledTimes(1);
    expect(target.insertBlocks).toHaveBeenCalledWith(
      [{ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: SOURCE }] }],
      'after-selection',
    );
    expect(toast.showSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('saves a restore point of the note just before it adds the diagram', async () => {
    const order: string[] = [];
    const target = makeTarget({ insertBlocks: vi.fn(() => (order.push('insert'), 'after-selection' as const)) });
    mount(target, 'User signs in and gets a token', () => {
      order.push('restore point');
    });
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: /Insert diagram/ }));
    expect(order).toEqual(['restore point', 'insert']);
  });

  it('Copy puts the Mermaid source on the clipboard without touching the note', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { target } = mount();
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SOURCE));
    expect(target.insertBlocks).not.toHaveBeenCalled();
  });

  it('tells the user when the diagram had to go to the end because the note changed', async () => {
    const target = makeTarget({ insertBlocks: vi.fn(() => 'end' as const) });
    const { onClose } = mount(target);
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: /Insert diagram/ }));
    expect(toast.showWarning).toHaveBeenCalledWith(expect.stringMatching(/end of the note/i), expect.anything());
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open with an error when the editor cannot take the diagram', async () => {
    const target = makeTarget({ insertBlocks: vi.fn(() => null) });
    const { onClose } = mount(target);
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: /Insert diagram/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be inserted/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Discard changes nothing', async () => {
    const { onClose, target } = mount();
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: /Discard/ }));
    expect(target.insertBlocks).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('saves the restore point only once the diagram was really inserted', async () => {
    const commit = vi.fn();
    mount(makeTarget({ insertBlocks: vi.fn(() => null) }), undefined, vi.fn(() => commit));
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: /Insert diagram/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(commit).not.toHaveBeenCalled();
    cleanup();
    runAiTask.mockReset();
    const commit2 = vi.fn();
    mount(makeTarget(), undefined, vi.fn(() => commit2));
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: /Insert diagram/ }));
    await waitFor(() => expect(commit2).toHaveBeenCalledTimes(1));
  });
});
