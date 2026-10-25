import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openAiTool } from '../lib/ai/launcher';

const state = vi.hoisted(() => ({ ai: undefined as undefined | Record<string, unknown>, enabled: true }));
const actions = vi.hoisted(() => ({
  createNoteWithContent: vi.fn(() => 'note-1' as string | null),
  upsertUtilitySketchDocument: vi.fn((_input: { title: string; sceneJson: string }) => ({ ok: true, id: 's1' }) as { ok: true; id: string }),
}));

vi.mock('../AppDataContext', () => ({
  useAppData: () => ({
    data: { aiSettings: state.ai },
    createNoteWithContent: actions.createNoteWithContent,
    upsertUtilitySketchDocument: actions.upsertUtilitySketchDocument,
  }),
}));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: { ai: state.enabled, aiPeople: true, aiFocusNote: true } }),
}));
vi.mock('./AIDigestDialog', () => ({
  AIDigestDialog: (props: { onClose: () => void; onSave: (t: string, m: string) => string | null; initialMode?: string }) => (
    <div data-testid="digest" data-mode={props.initialMode ?? ''}>
      <button type="button" onClick={() => props.onSave('Retrospective 2026-10-25', '## Done')}>save</button>
      <button type="button" onClick={props.onClose}>close</button>
    </div>
  ),
}));

vi.mock('./AIScreenshotDialog', () => ({
  AIScreenshotDialog: (props: { onApply: (t: string, f: { body: string }) => string | null }) => (
    <div data-testid="shot">
      <button type="button" onClick={() => props.onApply('Diagram from a screenshot', { body: 'b' })}>apply-shot</button>
    </div>
  ),
}));

vi.mock('./AIWorkspaceDialog', () => ({ AIWorkspaceDialog: () => <div data-testid="workspace" /> }));

vi.mock('./AIDrawDialog', () => ({
  AIDrawDialog: (props: {
    initialFormat?: string;
    onAddNote: (t: string, f: { body: string }) => string | null;
    onAddSketch: (t: string, s: string) => { ok: true; id: string } | { ok: false; error: string };
  }) => (
    <div data-testid="draw" data-format={props.initialFormat ?? ''}>
      <button type="button" onClick={() => props.onAddNote('Diagram', { body: 'b' })}>add-note</button>
      <button type="button" onClick={() => props.onAddSketch('Sketch', '{"elements":[1]}')}>add-sketch</button>
    </div>
  ),
}));

import { AiLauncher } from './AiLauncher';

beforeEach(() => {
  state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
  state.enabled = true;
  actions.createNoteWithContent.mockClear();
});
afterEach(cleanup);

describe('AiLauncher', () => {
  it('shows nothing until a tool is opened, then the dialog, and closes it again', async () => {
    render(<AiLauncher />);
    expect(screen.queryByTestId('digest')).toBeNull();
    act(() => openAiTool('weekly-digest'));
    expect(await screen.findByTestId('digest')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'close' }).click());
    expect(screen.queryByTestId('digest')).toBeNull();
  });

  it('opens the digest in the mode a page asked for, and forgets it when closed', async () => {
    render(<AiLauncher />);
    act(() => openAiTool('weekly-digest', { mode: 'upward' }));
    expect((await screen.findByTestId('digest')).getAttribute('data-mode')).toBe('upward');
    act(() => screen.getByRole('button', { name: 'close' }).click());
    act(() => openAiTool('weekly-digest'));
    expect((await screen.findByTestId('digest')).getAttribute('data-mode')).toBe('');
  });

  it('saves a summary as a Markdown note', async () => {
    render(<AiLauncher />);
    act(() => openAiTool('weekly-digest'));
    (await screen.findByRole('button', { name: 'save' })).click();
    expect(actions.createNoteWithContent).toHaveBeenCalledWith({
      title: 'Retrospective 2026-10-25',
      body: '## Done',
      bodyFormat: 'markdown',
      bodyPlainText: '## Done',
    });
  });

  it('opens the screenshot tool and creates a note from its result', async () => {
    render(<AiLauncher />);
    act(() => openAiTool('screenshot-to-diagram'));
    (await screen.findByRole('button', { name: 'apply-shot' })).click();
    expect(actions.createNoteWithContent).toHaveBeenCalledWith({ title: 'Diagram from a screenshot', body: 'b' });
  });

  it('opens the workspace question tool', async () => {
    render(<AiLauncher />);
    act(() => openAiTool('ask-workspace'));
    expect(await screen.findByTestId('workspace')).toBeTruthy();
  });

  it('ignores the request when AI is off or nothing is connected', () => {
    state.enabled = false;
    render(<AiLauncher />);
    act(() => openAiTool('weekly-digest'));
    expect(screen.queryByTestId('digest')).toBeNull();
    cleanup();
    state.enabled = true;
    state.ai = undefined;
    render(<AiLauncher />);
    act(() => openAiTool('weekly-digest'));
    expect(screen.queryByTestId('digest')).toBeNull();
  });

  it('opens the draw tool in the format a page asked for, and saves new notes and boards only', async () => {
    render(<AiLauncher />);
    act(() => openAiTool('draw-from-description', { format: 'sketch' }));
    expect((await screen.findByTestId('draw')).getAttribute('data-format')).toBe('sketch');
    screen.getByRole('button', { name: 'add-note' }).click();
    expect(actions.createNoteWithContent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Diagram', body: 'b' }));
    screen.getByRole('button', { name: 'add-sketch' }).click();
    expect(actions.upsertUtilitySketchDocument).toHaveBeenCalledWith({ title: 'Sketch', sceneJson: '{"elements":[1]}' });
    expect(actions.upsertUtilitySketchDocument.mock.calls[0][0]).not.toHaveProperty('id');
  });
});
