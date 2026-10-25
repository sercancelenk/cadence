import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const gate = vi.hoisted(() => ({ slow: null as null | Promise<void> }));
const validateMermaid = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const navigate = vi.hoisted(() => vi.fn());
const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('../lib/ai/images', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/ai/images')>();
  return {
    ...real,
    fileToAiImage: async (file: File) => {
      if (file.name === 'slow.png' && gate.slow) await gate.slow;
      return real.fileToAiImage(file);
    },
  };
});
vi.mock('../lib/richTextMermaid', () => ({ validateMermaid }));
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

import { AIScreenshotDialog } from './AIScreenshotDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const MERMAID = { ok: true, value: { kind: 'mermaid', source: 'flowchart TD\n  A --> B' }, connectionName: 'Company', model: 'team/x', fellBack: false, repaired: false, stopReason: 'stop' };
const HTML = { ...MERMAID, value: { kind: 'html', source: '<p>Hello</p>' } };
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });

function mount(onApply = vi.fn(() => 'note-1' as string | null)) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIScreenshotDialog open onClose={onClose} onApply={onApply} />
    </MemoryRouter>,
  );
  return { onClose, onApply };
}
const pick = async (file = png()) => {
  fireEvent.change(screen.getByLabelText('Image'), { target: { files: [file] } });
  await screen.findByAltText('Selected image');
};
const convert = async (result: unknown = MERMAID) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Convert$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  validateMermaid.mockReset().mockResolvedValue({ ok: true });
  navigate.mockClear();
  writeText.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIScreenshotDialog', () => {
  it('sends nothing until an image is chosen and Convert is pressed; absent when AI is off', async () => {
    mount();
    expect((screen.getByRole('button', { name: /^Convert$/ }) as HTMLButtonElement).disabled).toBe(true);
    await pick();
    expect(screen.getByAltText('Selected image')).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
    cleanup();
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Convert$/ })).toBeNull();
  });

  it('shows the thumbnail before sending and then sends that image with the chosen target', async () => {
    mount();
    await pick();
    fireEvent.click(screen.getByLabelText(/HTML mock-up/));
    await convert(HTML);
    const call = runAiTask.mock.calls[0][0] as { images: Array<{ mediaType: string; base64: string }>; options: Record<string, string>; task: { id: string } };
    expect(call.task.id).toBe('ai.screenshot');
    expect(call.images).toHaveLength(1);
    expect(call.images[0].mediaType).toBe('image/png');
    expect(call.options).toMatchObject({ target: 'html' });
  });

  it('refuses a file that is not an image, without sending anything', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Image'), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByAltText('Selected image')).toBeNull();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('takes a pasted image', async () => {
    mount();
    fireEvent.paste(screen.getByTestId('screenshot-drop'), { clipboardData: { files: [png()], items: [] } });
    expect(await screen.findByAltText('Selected image')).toBeTruthy();
  });

  it('a text-only connection shows the Settings path', async () => {
    mount();
    await pick();
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'capability', message: 'Check images first.' });
    fireEvent.click(screen.getByRole('button', { name: /^Convert$/ }));
    expect(await screen.findByText(/Check images first/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open AI settings/ }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });

  it('refuses Mermaid that does not render', async () => {
    validateMermaid.mockResolvedValue({ ok: false, error: 'Parse error' } as never);
    mount();
    await pick();
    await convert();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not make a diagram that renders/i));
    expect(screen.queryByRole('button', { name: /Add as a new note/ })).toBeNull();
  });

  it('shows HTML in a frame with no scripts and no origin, never inline', async () => {
    mount();
    await pick();
    fireEvent.click(screen.getByLabelText(/HTML mock-up/));
    await convert(HTML);
    const frame = (await screen.findByTitle('Preview')) as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<p>Hello</p>');
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
  });

  it('Add as a new note hands over a code block note and closes', async () => {
    const { onApply, onClose } = mount();
    await pick();
    await convert();
    fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
    const [title, fields] = onApply.mock.calls[0] as unknown as [string, { body: string }];
    expect(title).toBe('Diagram from a screenshot');
    expect(fields.body).toContain('mermaid');
    expect(onClose).toHaveBeenCalled();
  });

  it('names an HTML note differently and stores it as an html code block', async () => {
    const { onApply } = mount();
    await pick();
    fireEvent.click(screen.getByLabelText(/HTML mock-up/));
    await convert(HTML);
    fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
    const [title, fields] = onApply.mock.calls[0] as unknown as [string, { body: string }];
    expect(title).toBe('HTML from a screenshot');
    expect(fields.body).toContain('"language":"html"');
  });

  it('stays open with an error when the note could not be saved, and does not add a cut-off reply', async () => {
    const { onClose } = mount(vi.fn(() => null));
    await pick();
    await convert();
    fireEvent.click(await screen.findByRole('button', { name: /Add as a new note/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
    mount();
    await pick();
    await convert({ ...MERMAID, stopReason: 'length' });
    await waitFor(() => expect((screen.getByRole('button', { name: /Add as a new note/ }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('Copy puts the source on the clipboard', async () => {
    mount();
    await pick();
    await convert();
    fireEvent.click(await screen.findByRole('button', { name: /^Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('flowchart TD\n  A --> B'));
  });

  it('a slow older file never overwrites a newer pick', async () => {
    mount();
    let release = () => {};
    gate.slow = new Promise<void>((r) => {
      release = r;
    });
    const slow = new File([new Uint8Array([1, 1, 1, 1])], 'slow.png', { type: 'image/png' });
    const fast = new File([new Uint8Array([2, 2, 2, 2])], 'fast.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Image'), { target: { files: [slow] } });
    fireEvent.change(screen.getByLabelText('Image'), { target: { files: [fast] } });
    const shown = await screen.findByAltText('Selected image');
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect((screen.getByAltText('Selected image') as HTMLImageElement).src).toContain(btoa('\x02\x02\x02\x02'));
    expect(shown).toBeTruthy();
    gate.slow = null;
  });

  it('the paste area is reachable by name and has focus when the dialog opens', () => {
    mount();
    const area = screen.getByTestId('screenshot-drop');
    expect(area.getAttribute('role')).toBe('group');
    expect(area.getAttribute('aria-label')).toMatch(/paste/i);
    expect(document.activeElement).toBe(area);
  });
});
