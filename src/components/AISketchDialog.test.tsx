import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const validateMermaid = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('../lib/richTextMermaid', () => ({ validateMermaid }));
vi.mock('./ui/Toast', () => ({ useToast: () => toast }));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings } }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));

import { AISketchDialog } from './AISketchDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const SRC = 'flowchart TD\n  n1["Login"] --> n2["Dashboard"]';
const ok = { ok: true, value: { source: SRC }, connectionName: 'Company', model: 'team/x', fellBack: false, repaired: false, stopReason: 'stop' };
const box = (id: string, x: number, text: string) => [
  { id, type: 'rectangle', x, y: 0, width: 100, height: 60, isDeleted: false },
  { id: `${id}-t`, type: 'text', containerId: id, text, x, y: 0, width: 10, height: 10, isDeleted: false },
];
const SCENE = JSON.stringify({
  type: 'excalidraw',
  elements: [...box('a', 0, 'Login'), ...box('b', 300, 'Dashboard'), { id: 'r', type: 'arrow', x: 100, y: 30, points: [[0, 0], [200, 0]], startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' }, isDeleted: false }],
});

function mount(sceneJson = SCENE, onApply = vi.fn(() => 'note-1' as string | null)) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AISketchDialog open onClose={onClose} sceneJson={sceneJson} onApply={onApply} />
    </MemoryRouter>,
  );
  return { onClose, onApply };
}
const convert = async (result: unknown = ok) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Convert$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  validateMermaid.mockReset().mockResolvedValue({ ok: true });
  writeText.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AISketchDialog', () => {
  it('shows what will be sent, sends nothing until asked, and is absent when AI is off', () => {
    mount();
    expect(screen.getByText('Sketch')).toBeTruthy();
    expect(screen.getByText(/2 shapes, 1 arrow/)).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
    cleanup();
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Convert$/ })).toBeNull();
  });

  it('sends the parsed graph, never the raw scene', async () => {
    mount();
    await convert();
    const call = runAiTask.mock.calls[0][0] as { input: { graph: string }; task: { id: string } };
    expect(call.task.id).toBe('ai.sketch');
    expect(call.input.graph).toContain('1: Login');
    expect(call.input.graph).toContain('1 -> 2');
    expect(call.input.graph).not.toContain('excalidraw');
    await waitFor(() => expect(screen.getByText(/n1\["Login"\]/)).toBeTruthy());
  });

  it('explains an empty sketch and keeps Convert disabled', () => {
    mount(JSON.stringify({ type: 'excalidraw', elements: [] }));
    expect(screen.getByText(/no shapes with text/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Convert$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses a diagram that does not render and shows no Apply', async () => {
    validateMermaid.mockResolvedValue({ ok: false, error: 'Parse error' } as never);
    runAiTask.mockResolvedValue(ok);
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Convert$/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not make a diagram that renders/i));
    expect(screen.queryByRole('button', { name: /Add as a new note/ })).toBeNull();
  });

  it('Add as a new note hands over a title and a mermaid body, leaving the sketch alone', async () => {
    const { onApply, onClose } = mount();
    await convert();
    fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
    const [title, fields] = onApply.mock.calls[0] as unknown as [string, { bodyFormat: string; body: string }];
    expect(title).toBe('Sketch as a diagram');
    expect(fields.bodyFormat).toBe('prosemirror');
    expect(fields.body).toContain('mermaid');
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open with an error when the note could not be saved', async () => {
    const { onClose } = mount(SCENE, vi.fn(() => null));
    await convert();
    fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Copy puts the Mermaid source on the clipboard', async () => {
    mount();
    await convert();
    fireEvent.click(await screen.findByRole('button', { name: /^Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SRC));
  });

  it('does not offer Add when the reply was cut off', async () => {
    mount();
    await convert({ ...ok, stopReason: 'length' });
    await screen.findByText(/n1\["Login"\]/);
    expect((screen.getByRole('button', { name: /Add as a new note/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
