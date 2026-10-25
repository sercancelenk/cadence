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

import { AIStructureDialog } from './AIStructureDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const OUT = { title: 'Release plan', sections: [{ heading: 'Todo', items: ['Write changelog', 'Tag build'] }, { heading: 'Risks', items: ['Month-end'] }] };
const ok = (over: Record<string, unknown> = {}) => ({ ok: true, value: OUT, connectionName: 'Company', model: 'team/x', fellBack: false, repaired: false, stopReason: 'stop', ...over });

function mount(onApply = vi.fn(() => 'tab-2' as string | null), text = 'rough notes about the release', extra: Partial<React.ComponentProps<typeof AIStructureDialog>> = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIStructureDialog open onClose={onClose} tabTitle="Untitled 1" text={text} onApply={onApply} {...extra} />
    </MemoryRouter>,
  );
  return { onClose, onApply };
}
const run = async (result: unknown = ok()) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Structure$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  convert.mockClear();
  validateMermaid.mockReset();
  validateMermaid.mockResolvedValue({ ok: true });
  navigate.mockClear();
  writeText.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIStructureDialog', () => {
  it('shows what will be sent and sends nothing until asked; off or unconnected is handled', () => {
    mount();
    expect(screen.getByText('Document')).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
    cleanup();
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Structure$/ })).toBeNull();
  });

  it('runs the structure task on the document text and previews the sections', async () => {
    mount();
    await run();
    expect(runAiTask.mock.calls[0][0]).toMatchObject({ input: { text: 'rough notes about the release' }, task: expect.objectContaining({ id: 'ai.structure' }) });
    await waitFor(() => expect(screen.getByText('Release plan')).toBeTruthy());
    expect(screen.getByText('Todo')).toBeTruthy();
    expect(screen.getByText('Write changelog')).toBeTruthy();
  });

  it('Add as a new tab hands over a title and the body, leaving the original alone, then closes', async () => {
    const { onApply, onClose } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Add as a new tab/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [title, fields] = onApply.mock.calls[0] as unknown as [string, { bodyFormat: string; bodyPlainText: string }];
    expect(title).toBe('Structured: Untitled 1');
    expect(fields.bodyFormat).toBe('prosemirror');
    expect(fields.bodyPlainText).toContain('Write changelog');
    expect(toast.showSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open with an error when the tab could not be saved', async () => {
    const { onClose } = mount(vi.fn(() => null));
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Add as a new tab/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Copy puts the structure on the clipboard as plain text', async () => {
    const { onApply } = mount();
    await run();
    fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain('Release plan');
    expect(text).toContain('- Tag build');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('a cut-off reply cannot be added; errors and blocks are shown', async () => {
    mount();
    await run(ok({ stopReason: 'length' }));
    await waitFor(() => expect(screen.getByText(/cut off/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Add as a new tab/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    mount();
    await run({ ok: false, reason: 'engine', message: 'Provider returned 500', diagnostic: 'HTTP 500' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Provider returned 500'));
    cleanup();
    mount();
    await run({ ok: false, reason: 'not-configured', message: 'AI is not set up yet.' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy());
  });

  it('cannot start on an empty document', () => {
    mount(vi.fn(), '   ');
    expect((screen.getByRole('button', { name: /^Structure$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Outline, RFC, Meeting summary and Table, sends the chosen kind, and defaults to outline', async () => {
    mount();
    expect(screen.getByRole('radio', { name: 'Outline' })).toHaveProperty('checked', true);
    for (const name of ['RFC', 'Meeting summary', 'Table']) expect(screen.getByRole('radio', { name })).toBeTruthy();
    await run();
    expect(runAiTask.mock.calls[0][0]).toMatchObject({ options: { kind: 'outline' } });
    cleanup();
    runAiTask.mockReset();
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'RFC' }));
    await run();
    expect(runAiTask.mock.calls[0][0]).toMatchObject({ options: { kind: 'rfc' } });
  });

  it('changing the format after a result clears it so the new format can be asked for', async () => {
    mount();
    await run();
    await screen.findByText('Release plan');
    fireEvent.click(screen.getByRole('radio', { name: 'Meeting summary' }));
    expect(screen.queryByText('Release plan')).toBeNull();
    await run();
    expect(runAiTask.mock.calls[1][0]).toMatchObject({ options: { kind: 'meeting' } });
  });

  it('previews a table result, adds it as a table, and copies it as Markdown', async () => {
    const TABLE = { title: 'Owners', sections: [], table: { columns: ['Task', 'Owner'], rows: [['Ship', 'Ann | Bob']] } };
    const { onApply } = mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    await run(ok({ value: TABLE }));
    const table = await screen.findByRole('table');
    expect(table.textContent).toContain('Ann | Bob');
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect((writeText.mock.calls[0] as unknown as [string])[0]).toContain('| Ship | Ann \\| Bob |');
    fireEvent.click(screen.getByRole('button', { name: /Add as a new tab/ }));
    const [, fields] = onApply.mock.calls[0] as unknown as [string, { body: string }];
    expect(fields.body).toContain('"type":"table"');
  });

  describe('Also draw as Mermaid', () => {
    const SRC = 'flowchart TD\n  A[Write changelog] --> B[Tag build]';
    const drawn = (over: Record<string, unknown> = {}) => ok({ value: { source: SRC }, ...over });
    const onAddNote = () => vi.fn((_t: string, _f: unknown) => 'note-9' as string | null);

    it('is offered only after a result, and only when the host can add a note', async () => {
      mount(undefined, undefined, { onAddNote: onAddNote() });
      expect(screen.queryByRole('button', { name: /Draw as Mermaid/ })).toBeNull();
      await run();
      expect(await screen.findByRole('button', { name: /Draw as Mermaid/ })).toBeTruthy();
      cleanup();
      mount();
      await run();
      await screen.findByText('Release plan');
      expect(screen.queryByRole('button', { name: /Draw as Mermaid/ })).toBeNull();
    });

    it('draws the structured result, not the raw document, and adds it as a new note only on request', async () => {
      const add = onAddNote();
      const { onApply, onClose } = mount(undefined, undefined, { onAddNote: add });
      await run();
      runAiTask.mockResolvedValueOnce(drawn());
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Mermaid/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
      const second = runAiTask.mock.calls[1][0] as { task: { id: string }; input: { text: string } };
      expect(second.task.id).toBe('ai.visualize');
      expect(second.input.text).toContain('Write changelog');
      expect(second.input.text).not.toContain('rough notes about the release');
      expect(add).not.toHaveBeenCalled();
      await waitFor(() => expect(validateMermaid).toHaveBeenCalledWith(SRC));
      fireEvent.click(await screen.findByRole('button', { name: /Add diagram as a new note/ }));
      expect(add).toHaveBeenCalledTimes(1);
      const [title, fields] = add.mock.calls[0] as unknown as [string, { bodyFormat: string; body: string }];
      expect(title).toBe('Diagram: Untitled 1');
      expect(fields.bodyFormat).toBe('prosemirror');
      expect(fields.body).toContain('mermaid');
      expect(onApply).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText('Release plan')).toBeTruthy();
    });

    it('does not offer a diagram that does not render', async () => {
      validateMermaid.mockResolvedValue({ ok: false, error: 'Parse error' });
      mount(undefined, undefined, { onAddNote: onAddNote() });
      await run();
      runAiTask.mockResolvedValueOnce(drawn());
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Mermaid/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/renders/i));
      expect(screen.queryByRole('button', { name: /Add diagram as a new note/ })).toBeNull();
    });

    it('stays open with an error when the note could not be saved', async () => {
      mount(undefined, undefined, { onAddNote: vi.fn(() => null) });
      await run();
      runAiTask.mockResolvedValueOnce(drawn());
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Mermaid/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Add diagram as a new note/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i));
    });

    it('a cut-off diagram cannot be added', async () => {
      mount(undefined, undefined, { onAddNote: onAddNote() });
      await run();
      runAiTask.mockResolvedValueOnce(drawn({ stopReason: 'length' }));
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Mermaid/ }));
      const add = await screen.findByRole('button', { name: /Add diagram as a new note/ });
      expect((add as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('Also draw as Sketch', () => {
    const BOXES = { nodes: [{ label: 'Write changelog' }, { label: 'Tag build' }], edges: [{ from: 0, to: 1 }] };
    const boxes = (over: Record<string, unknown> = {}) => ok({ value: BOXES, ...over });
    type SketchSave = { ok: true; id: string } | { ok: false; error: string };
    const onAddSketch = (result: SketchSave = { ok: true, id: 's1' }) => vi.fn((_title: string, _scene: string): SketchSave => result);

    it('is offered only after a result, and only when the host can add a sketch', async () => {
      mount(undefined, undefined, { onAddSketch: onAddSketch() });
      expect(screen.queryByRole('button', { name: /Draw as Sketch/ })).toBeNull();
      await run();
      expect(await screen.findByRole('button', { name: /Draw as Sketch/ })).toBeTruthy();
      cleanup();
      mount();
      await run();
      await screen.findByText('Release plan');
      expect(screen.queryByRole('button', { name: /Draw as Sketch/ })).toBeNull();
    });

    it('draws the structured result and saves a new board only on request', async () => {
      const add = onAddSketch();
      const { onApply, onClose } = mount(undefined, undefined, { onAddSketch: add });
      await run();
      runAiTask.mockResolvedValueOnce(boxes());
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Sketch/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
      const second = runAiTask.mock.calls[1][0] as { task: { id: string }; input: { text: string } };
      expect(second.task.id).toBe('ai.boxes');
      expect(second.input.text).toContain('Write changelog');
      expect(second.input.text).not.toContain('rough notes about the release');
      expect(add).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole('button', { name: /Add sketch as a new board/ }));
      expect(add).toHaveBeenCalledTimes(1);
      const [title, sceneJson] = add.mock.calls[0];
      expect(title).toBe('Sketch: Untitled 1');
      const scene = JSON.parse(sceneJson) as { type: string; elements: Array<{ type: string }> };
      expect(scene.type).toBe('excalidraw');
      expect(scene.elements.map((e) => e.type)).toEqual(['rectangle', 'rectangle', 'arrow']);
      expect(onApply).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText('Release plan')).toBeTruthy();
    });

    it('shows the host error when the board could not be saved, and keeps the dialog', async () => {
      mount(undefined, undefined, { onAddSketch: onAddSketch({ ok: false, error: 'Save is blocked — resolve the workspace issue first.' }) });
      await run();
      runAiTask.mockResolvedValueOnce(boxes());
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Sketch/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Add sketch as a new board/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Save is blocked'));
    });

    it('does not offer a sketch that could not be built', async () => {
      convert.mockImplementationOnce(() => {
        throw new Error('canvas missing');
      });
      mount(undefined, undefined, { onAddSketch: onAddSketch() });
      await run();
      runAiTask.mockResolvedValueOnce(boxes());
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Sketch/ }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not build/i));
      expect(screen.queryByRole('button', { name: /Add sketch as a new board/ })).toBeNull();
    });

    it('a cut-off sketch cannot be added', async () => {
      mount(undefined, undefined, { onAddSketch: onAddSketch() });
      await run();
      runAiTask.mockResolvedValueOnce(boxes({ stopReason: 'length' }));
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Sketch/ }));
      const add = await screen.findByRole('button', { name: /Add sketch as a new board/ });
      expect((add as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('final review fixes', () => {
    const SRC = 'flowchart TD\n  A[Write changelog] --> B[Tag build]';
    const BOXES = { nodes: [{ label: 'Write changelog' }, { label: 'Tag build' }], edges: [{ from: 0, to: 1 }] };

    it('adds a diagram only once even if the button is pressed again', async () => {
      const add = vi.fn((_t: string, _f: unknown) => 'note-9' as string | null);
      mount(undefined, undefined, { onAddNote: add });
      await run();
      runAiTask.mockResolvedValueOnce(ok({ value: { source: SRC } }));
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Mermaid/ }));
      const button = await screen.findByRole('button', { name: /Add diagram as a new note/ });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(add).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Diagram added/)).toBeTruthy();
    });

    it('adds a sketch board only once even if the button is pressed again', async () => {
      const add = vi.fn((_t: string, _s: string) => ({ ok: true, id: 's1' }) as { ok: true; id: string });
      mount(undefined, undefined, { onAddSketch: add });
      await run();
      runAiTask.mockResolvedValueOnce(ok({ value: BOXES }));
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Sketch/ }));
      const button = await screen.findByRole('button', { name: /Add sketch as a new board/ });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(add).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Sketch added/)).toBeTruthy();
    });

    it('a diagram still being drawn for an older result never shows up after Regenerate', async () => {
      mount(undefined, undefined, { onAddNote: vi.fn(() => 'n' as string | null) });
      await run();
      let finishOld: (v: unknown) => void = () => {};
      runAiTask.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Mermaid/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
      runAiTask.mockResolvedValueOnce(ok());
      fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(3));
      finishOld(ok({ value: { source: SRC } }));
      await new Promise((r) => setTimeout(r, 30));
      expect(screen.queryByRole('button', { name: /Add diagram as a new note/ })).toBeNull();
      expect(validateMermaid).not.toHaveBeenCalledWith(SRC);
    });

    it('a sketch still being built for an older result never shows up after a format change', async () => {
      mount(undefined, undefined, { onAddSketch: vi.fn(() => ({ ok: true, id: 's' }) as { ok: true; id: string }) });
      await run();
      let finishOld: (v: unknown) => void = () => {};
      runAiTask.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
      fireEvent.click(await screen.findByRole('button', { name: /Draw as Sketch/ }));
      await waitFor(() => expect(runAiTask).toHaveBeenCalledTimes(2));
      fireEvent.click(screen.getByRole('radio', { name: 'RFC' }));
      finishOld(ok({ value: BOXES }));
      await new Promise((r) => setTimeout(r, 30));
      expect(screen.queryByRole('button', { name: /Add sketch as a new board/ })).toBeNull();
      expect(convert).not.toHaveBeenCalled();
    });

    it('does not send a document that is too short to structure, and says why', () => {
      mount(undefined, 'ok');
      expect((screen.getByRole('button', { name: /^Structure$/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText(/Write a little more/i)).toBeTruthy();
      expect(runAiTask).not.toHaveBeenCalled();
    });
  });
});
