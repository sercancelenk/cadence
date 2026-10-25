import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeAiTool } from '../../lib/ai/launcher';

const state = vi.hoisted(() => ({ ai: undefined as undefined | Record<string, unknown> }));
const canvas = vi.hoisted(() => ({ getSceneJson: vi.fn() }));
const actions = vi.hoisted(() => ({ createNoteWithContent: vi.fn(() => 'note-9' as string | null) }));

vi.mock('../../AppDataContext', () => ({
  useAppData: () => ({
    data: { aiSettings: state.ai, utilitySketchDocuments: [] },
    upsertUtilitySketchDocument: vi.fn(),
    renameUtilitySketchDocument: vi.fn(),
    removeUtilitySketchDocument: vi.fn(),
    createNoteWithContent: actions.createNoteWithContent,
  }),
}));
vi.mock('../../components/ui/ConfirmProvider', () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true), prompt: vi.fn() }) }));
vi.mock('../../features/utilities/UtilitySavedDocsPanel', () => ({ UtilitySavedDocsPanel: () => null }));
vi.mock('../../features/sketch/SketchCanvas', () => ({
  SketchCanvas: forwardRef(function FakeCanvas(_props: unknown, ref) {
    useImperativeHandle(ref, () => ({ getSceneJson: canvas.getSceneJson, loadSceneJson: vi.fn(), newBlank: vi.fn(), isReady: () => true }));
    return <div data-testid="canvas" />;
  }),
}));
vi.mock('../../components/AISketchDialog', () => ({
  AISketchDialog: (props: { sceneJson: string; onApply: (t: string, f: { body: string }) => string | null }) => (
    <div data-testid="sketch-dialog" data-scene={props.sceneJson}>
      <button type="button" onClick={() => props.onApply('Sketch as a diagram', { body: 'b' })}>apply</button>
    </div>
  ),
}));

import { UtilitiesToolsSketchPage } from './UtilitiesToolsSketchPage';

beforeEach(() => {
  state.ai = undefined;
  actions.createNoteWithContent.mockClear();
  canvas.getSceneJson.mockReset().mockReturnValue('{"elements":[]}');
});
afterEach(cleanup);

describe('UtilitiesToolsSketchPage draw entry', () => {
  it('opens the draw tool as a sketch through the launcher, only when AI is usable', () => {
    const opened = vi.fn();
    const off = subscribeAiTool(opened);
    render(<UtilitiesToolsSketchPage />);
    expect(screen.queryByRole('button', { name: /Draw with AI/ })).toBeNull();
    cleanup();
    state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
    render(<UtilitiesToolsSketchPage />);
    fireEvent.click(screen.getByRole('button', { name: /Draw with AI/ }));
    expect(opened).toHaveBeenCalledWith('draw-from-description', { format: 'sketch' });
    off();
  });
});

describe('UtilitiesToolsSketchPage AI entry', () => {
  it('is not offered without a connected provider', () => {
    render(<UtilitiesToolsSketchPage />);
    expect(screen.queryByRole('button', { name: /Convert to Mermaid/ })).toBeNull();
  });

  it('opens the dialog on the sketch as it is on the canvas now', async () => {
    state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
    render(<UtilitiesToolsSketchPage />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to Mermaid/ }));
    const dialog = await screen.findByTestId('sketch-dialog');
    expect(dialog.getAttribute('data-scene')).toBe('{"elements":[]}');
  });

  it('creates a note from the diagram and returns its id', async () => {
    state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
    render(<UtilitiesToolsSketchPage />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to Mermaid/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'apply' }));
    expect(actions.createNoteWithContent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sketch as a diagram', body: 'b' }));
  });

  it('does nothing when the canvas is not ready', () => {
    state.ai = { provider: 'openai', apiKey: 'sk-test-key-12345', model: 'm' };
    canvas.getSceneJson.mockReturnValue(null);
    render(<UtilitiesToolsSketchPage />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to Mermaid/ }));
    expect(screen.queryByTestId('sketch-dialog')).toBeNull();
  });
});
