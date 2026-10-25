import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const validateMermaid = vi.hoisted(() => vi.fn(async (_s: string): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })));
const convert = vi.hoisted(() => vi.fn((els: Array<Record<string, unknown>>) => els.map((e, i) => ({ ...e, id: (e.id as string | undefined) ?? `a${i}`, isDeleted: false }))));
const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('../lib/richTextMermaid', () => ({ validateMermaid }));
vi.mock('@excalidraw/excalidraw', () => ({ convertToExcalidrawElements: convert }));
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

import { AIDrawDialog } from './AIDrawDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const DESC = 'A user orders, the API gateway checks it, Kafka gets an event.';
const SRC = 'flowchart TD\n  A[Order] --> B[Gateway]';
const SRC2 = 'flowchart TD\n  A[Order] --> B[Gateway] --> C[Cache]';
const BOXES = { nodes: [{ label: 'Client' }, { label: 'API' }], edges: [{ from: 0, to: 1 }] };
const ok = (value: unknown, over: Record<string, unknown> = {}) => ({
  ok: true,
  value,
  connectionName: 'Company',
  model: 'team/x',
  fellBack: false,
  repaired: false,
  stopReason: 'stop',
  ...over,
});

type Saved = { ok: true; id: string } | { ok: false; error: string };
function mount(over: Partial<React.ComponentProps<typeof AIDrawDialog>> = {}) {
  const onClose = vi.fn();
  const onAddNote = vi.fn((_t: string, _f: unknown) => 'note-1' as string | null);
  const onAddSketch = vi.fn((_t: string, _s: string): Saved => ({ ok: true, id: 's1' }));
  render(
    <MemoryRouter>
      <AIDrawDialog open onClose={onClose} onAddNote={onAddNote} onAddSketch={onAddSketch} {...over} />
    </MemoryRouter>,
  );
  return { onClose, onAddNote, onAddSketch };
}
const describeIt = (text = DESC) => fireEvent.change(screen.getByLabelText('Description'), { target: { value: text } });
const draw = async (result: unknown) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Draw$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  validateMermaid.mockReset();
  validateMermaid.mockResolvedValue({ ok: true });
  convert.mockClear();
  navigate.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIDrawDialog', () => {
  it('sends nothing until asked, and not for a description that is too short', () => {
    mount();
    const button = screen.getByRole('button', { name: /^Draw$/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    describeIt('ok');
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Write a little more/i)).toBeTruthy();
    describeIt();
    expect(button.disabled).toBe(false);
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('renders nothing when AI is off', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByLabelText('Description')).toBeNull();
  });

  it('starts in the format a page asked for', () => {
    mount({ initialFormat: 'sketch' });
    expect(screen.getByRole('radio', { name: 'Sketch' })).toHaveProperty('checked', true);
    cleanup();
    mount();
    expect(screen.getByRole('radio', { name: 'Mermaid' })).toHaveProperty('checked', true);
  });

  describe('Mermaid', () => {
    it('draws from the description, checks it renders, and adds a new note once', async () => {
      const { onAddNote, onClose } = mount();
      describeIt();
      await draw(ok({ source: SRC }));
      expect(runAiTask.mock.calls[0][0]).toMatchObject({
        task: { id: 'ai.visualize' },
        input: { text: DESC },
        options: { kind: 'auto' },
      });
      await waitFor(() => expect(validateMermaid).toHaveBeenCalledWith(SRC));
      expect((await screen.findByText(/flowchart TD/)).textContent).toContain('Gateway');
      expect(onAddNote).not.toHaveBeenCalled();
      const add = await screen.findByRole('button', { name: /Add as a new note/ });
      fireEvent.click(add);
      fireEvent.click(add);
      expect(onAddNote).toHaveBeenCalledTimes(1);
      const [title, fields] = onAddNote.mock.calls[0] as unknown as [string, { bodyFormat: string; body: string }];
      expect(title).toMatch(/^Diagram: /);
      expect(fields.bodyFormat).toBe('prosemirror');
      expect(fields.body).toContain('mermaid');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('passes the chosen diagram type', async () => {
      mount();
      describeIt();
      fireEvent.change(screen.getByLabelText('Diagram type'), { target: { value: 'sequence' } });
      await draw(ok({ source: SRC }));
      expect(runAiTask.mock.calls[0][0]).toMatchObject({ options: { kind: 'sequence' } });
    });

    it('does not offer a diagram that does not render', async () => {
      validateMermaid.mockResolvedValue({ ok: false, error: 'Parse error' });
      mount();
      describeIt();
      await draw(ok({ source: SRC }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/renders/i));
      expect(screen.queryByRole('button', { name: /Add as a new note/ })).toBeNull();
    });

    it('stays open with an error when the note could not be saved, and lets the user try again', async () => {
      const { onAddNote } = mount({ onAddNote: vi.fn(() => null) });
      void onAddNote;
      describeIt();
      await draw(ok({ source: SRC }));
      fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i));
      expect((screen.getByRole('button', { name: /Add as a new note/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('a change builds on the current diagram, replaces it, and the new one can be added as well', async () => {
      const { onAddNote } = mount();
      describeIt();
      await draw(ok({ source: SRC }));
      fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
      fireEvent.change(screen.getByLabelText('Change it'), { target: { value: 'Add a cache after the gateway' } });
      runAiTask.mockResolvedValueOnce(ok({ source: SRC2 }));
      fireEvent.click(screen.getByRole('button', { name: /Apply change/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
      expect(runAiTask.mock.calls[1][0]).toMatchObject({
        task: { id: 'ai.visualize' },
        input: { text: DESC, current: SRC, change: 'Add a cache after the gateway' },
      });
      await waitFor(() => expect(screen.getByText(/Cache/)).toBeTruthy());
      fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
      expect(onAddNote).toHaveBeenCalledTimes(2);
    });

    it('a cut-off diagram can neither be added nor changed', async () => {
      mount();
      describeIt();
      await draw(ok({ source: SRC }, { stopReason: 'length' }));
      const add = await screen.findByRole('button', { name: /Add as a new note/ });
      expect((add as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(screen.getByLabelText('Change it'), { target: { value: 'Add a cache' } });
      expect((screen.getByRole('button', { name: /Apply change/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('a change reply that is cut off is not used: the last good diagram stays and can still be added', async () => {
      const { onAddNote } = mount();
      describeIt();
      await draw(ok({ source: SRC }));
      fireEvent.change(screen.getByLabelText('Change it'), { target: { value: 'Add a cache after the gateway' } });
      runAiTask.mockResolvedValueOnce(ok({ source: SRC2 }, { stopReason: 'length' }));
      fireEvent.click(screen.getByRole('button', { name: /Apply change/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/cut off/i));
      expect(document.querySelector('.ai-sketch__source')?.textContent).toBe(SRC);
      const add = screen.getByRole('button', { name: /Add as a new note/ }) as HTMLButtonElement;
      expect(add.disabled).toBe(false);
      fireEvent.click(add);
      expect(onAddNote).toHaveBeenCalledTimes(1);
      expect(String((onAddNote.mock.calls[0] as unknown[])[1] && JSON.stringify(onAddNote.mock.calls[0]))).toContain('Gateway');
    });

    it('copies the Mermaid source', async () => {
      mount();
      describeIt();
      await draw(ok({ source: SRC }));
      fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(SRC));
    });
  });

  describe('Sketch', () => {
    it('draws boxes and arrows, builds a scene, and adds a new board once', async () => {
      const { onAddSketch } = mount({ initialFormat: 'sketch' });
      describeIt();
      await draw(ok(BOXES));
      expect(runAiTask.mock.calls[0][0]).toMatchObject({ task: { id: 'ai.boxes' }, input: { text: DESC } });
      expect(await screen.findByText(/2 boxes and 1 arrow/)).toBeTruthy();
      expect(onAddSketch).not.toHaveBeenCalled();
      const add = screen.getByRole('button', { name: /Add as a new board/ });
      fireEvent.click(add);
      fireEvent.click(add);
      expect(onAddSketch).toHaveBeenCalledTimes(1);
      const [title, json] = onAddSketch.mock.calls[0];
      expect(title).toMatch(/^Sketch: /);
      const scene = JSON.parse(json) as { type: string; elements: Array<{ type: string }> };
      expect(scene.elements.map((e) => e.type)).toEqual(['rectangle', 'rectangle', 'arrow']);
    });

    it('shows the host error when the board could not be saved', async () => {
      mount({ initialFormat: 'sketch', onAddSketch: () => ({ ok: false, error: 'Save is blocked — resolve the workspace issue first.' }) });
      describeIt();
      await draw(ok(BOXES));
      fireEvent.click(await screen.findByRole('button', { name: /Add as a new board/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Save is blocked'));
    });

    it('does not offer a sketch that could not be built', async () => {
      convert.mockImplementationOnce(() => {
        throw new Error('canvas missing');
      });
      mount({ initialFormat: 'sketch' });
      describeIt();
      await draw(ok(BOXES));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not build/i));
      expect(screen.queryByRole('button', { name: /Add as a new board/ })).toBeNull();
    });

    it('announces the finished sketch summary', async () => {
      mount({ initialFormat: 'sketch' });
      describeIt();
      await draw(ok(BOXES));
      const summary = await screen.findByText(/2 boxes and 1 arrow/);
      expect(summary.getAttribute('role')).toBe('status');
    });

    it('a change sends the current boxes and arrows as numbered text', async () => {
      mount({ initialFormat: 'sketch' });
      describeIt();
      await draw(ok(BOXES));
      await screen.findByText(/2 boxes and 1 arrow/);
      fireEvent.change(screen.getByLabelText('Change it'), { target: { value: 'Add a database behind the API' } });
      runAiTask.mockResolvedValueOnce(ok({ nodes: [...BOXES.nodes, { label: 'DB' }], edges: [...BOXES.edges, { from: 1, to: 2 }] }));
      fireEvent.click(screen.getByRole('button', { name: /Apply change/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
      const input = (runAiTask.mock.calls[1][0] as { input: { current: string; change: string } }).input;
      expect(input.current).toContain('1: Client');
      expect(input.current).toContain('1 -> 2');
      expect(input.change).toBe('Add a database behind the API');
      await screen.findByText(/3 boxes and 2 arrows/);
    });
  });

  it('changing the format clears the result', async () => {
    mount();
    describeIt();
    await draw(ok({ source: SRC }));
    await screen.findByRole('button', { name: /Add as a new note/ });
    fireEvent.click(screen.getByRole('radio', { name: 'Sketch' }));
    expect(screen.queryByRole('button', { name: /Add as a new note/ })).toBeNull();
    expect(screen.queryByText(/flowchart TD/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Draw$/ })).toBeTruthy();
  });

  it('shows engine errors and points to Settings when nothing is connected', async () => {
    mount();
    describeIt();
    await draw({ ok: false, reason: 'engine', message: 'Provider returned 500', diagnostic: 'HTTP 500' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Provider returned 500'));
    cleanup();
    runAiTask.mockReset();
    mount();
    describeIt();
    await draw({ ok: false, reason: 'not-configured', message: 'AI is not set up yet.' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy());
  });

  describe('final review fixes', () => {
    it('a failed change does not make an already added result addable again', async () => {
      const { onAddNote } = mount();
      describeIt();
      await draw(ok({ source: SRC }));
      fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
      expect(onAddNote).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByLabelText('Change it'), { target: { value: 'Add a cache' } });
      runAiTask.mockResolvedValueOnce({ ok: false, reason: 'engine', message: 'Provider returned 500' });
      fireEvent.click(screen.getByRole('button', { name: /Apply change/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Provider returned 500'));
      const button = screen.getByRole('button', { name: /Added/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(onAddNote).toHaveBeenCalledTimes(1);
    });

    it('says when the description reached its limit', () => {
      mount();
      describeIt('x'.repeat(6_000));
      expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toHaveLength(4_000);
      expect(screen.getByText(/limited to 4,000 characters/i)).toBeTruthy();
    });

    it('locks the description and type once there is a result, and Start over unlocks them', async () => {
      mount();
      describeIt();
      await draw(ok({ source: SRC }));
      await screen.findByRole('button', { name: /Add as a new note/ });
      expect((screen.getByLabelText('Description') as HTMLTextAreaElement).disabled).toBe(true);
      expect((screen.getByLabelText('Diagram type') as HTMLSelectElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: /Start over/ }));
      expect((screen.getByLabelText('Description') as HTMLTextAreaElement).disabled).toBe(false);
      expect((screen.getByLabelText('Diagram type') as HTMLSelectElement).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: /Add as a new note/ })).toBeNull();
      expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(DESC);
    });

    it('with nothing connected it points to Settings and sends nothing', () => {
      aiSettings = undefined;
      mount();
      expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy();
      expect(runAiTask).not.toHaveBeenCalled();
    });
  });
});
