import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };
let quiet = false;
let manyNotes = false;
const NOW = new Date();
const iso = (daysAgo: number) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, 9).toISOString();
const appData = () => ({
  aiSettings,
  todoItems: quiet ? [] : [{ id: 't1', groupId: 'g', title: 'Ship release', status: 'done', done: true, doneAt: iso(1), createdAt: iso(20), updatedAt: iso(1) }],
  notes: quiet ? [] : manyNotes ? [
    ...[1, 2, 3, 4, 5].map((i) => ({ id: `old${i}`, title: `Old ${i}`, body: '', bodyPlainText: 'x', locked: false, createdAt: iso(40), updatedAt: iso(20) })),
    { id: 'new1', title: 'New one', body: '', bodyPlainText: 'y', locked: false, createdAt: iso(40), updatedAt: iso(2) },
  ] : [
    { id: 'n1', title: 'Roadmap', body: '', bodyPlainText: 'Q4 plan text', locked: false, createdAt: iso(20), updatedAt: iso(2) },
    { id: 'n2', title: 'Secret', body: '', locked: true, createdAt: iso(20), updatedAt: iso(2) },
  ],
  items: [],
  people: [],
});

vi.mock('../lib/ai/runTask', () => ({ runAiTask }));
vi.mock('./ui/Toast', () => ({ useToast: () => toast }));
vi.mock('../AppDataContext', () => ({ useAppData: () => ({ data: appData() }) }));
vi.mock('../lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/features')>()),
  useFeatures: () => ({ features: flags }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));

import { AIDigestDialog } from './AIDigestDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const ok = { ok: true, value: '## Done\n- Ship release', connectionName: 'Company', model: 'team/x', fellBack: false, repaired: false, stopReason: 'stop' };

function mount(onSave = vi.fn(() => 'note-1' as string | null), initialMode?: 'retro' | 'upward') {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIDigestDialog open onClose={onClose} onSave={onSave} initialMode={initialMode} />
    </MemoryRouter>,
  );
  return { onClose, onSave };
}
const write = async (result: unknown = ok) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Write summary$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  writeText.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIDigestDialog', () => {
  it('shows what will be sent, sends nothing until asked, and is absent when AI is off', () => {
    mount();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText(/1 done/)).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
    cleanup();
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    mount();
    expect(screen.queryByRole('button', { name: /^Write summary$/ })).toBeNull();
  });

  it('sends counts and titles for the chosen window, streaming, without note bodies', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '14' } });
    await write();
    const call = runAiTask.mock.calls[0][0] as { input: { activity: string; notes: unknown[] }; options?: Record<string, string>; task: { id: string }; onText?: unknown };
    expect(call.task.id).toBe('ai.digest');
    expect(call.input.activity).toContain('Last 14 days');
    expect(call.input.activity).toContain('- Ship release');
    expect(call.input.activity).not.toContain('Q4 plan text');
    expect(call.input.notes).toEqual([]);
    expect(typeof call.onText).toBe('function');
    await waitFor(() => expect(document.querySelector('.ai-digest__text')?.textContent).toBe('## Done\n- Ship release'));
  });

  it('upward mode is passed as an option', async () => {
    mount();
    fireEvent.click(screen.getByLabelText(/Status update/));
    await write();
    expect((runAiTask.mock.calls[0][0] as { options?: Record<string, string> }).options).toMatchObject({ mode: 'upward' });
  });

  it('includes the text of a note only when the user ticks it, and never offers a locked one', async () => {
    mount();
    expect(screen.queryByLabelText(/Secret/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Roadmap/));
    await write();
    expect((runAiTask.mock.calls[0][0] as { input: { notes: unknown[] } }).input.notes).toEqual([{ title: 'Roadmap', text: 'Q4 plan text' }]);
  });

  it('shows the text as it streams in', async () => {
    let push: (t: string) => void = () => {};
    runAiTask.mockImplementationOnce(async (args: { onText?: (t: string) => void }) => {
      push = args.onText ?? (() => {});
      await new Promise((r) => setTimeout(r, 30));
      return ok;
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Write summary$/ }));
    await waitFor(() => expect(runAiTask).toHaveBeenCalled());
    act(() => push('## Partial text so far'));
    expect(await screen.findByText(/Partial text so far/)).toBeTruthy();
  });

  it('Save as a note hands over a title and the Markdown, then closes', async () => {
    const { onSave, onClose } = mount();
    await write();
    fireEvent.click(await screen.findByRole('button', { name: /Save as a note/ }));
    const [title, markdown] = onSave.mock.calls[0] as unknown as [string, string];
    expect(title).toMatch(/^Retrospective /);
    expect(markdown).toBe('## Done\n- Ship release');
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open with an error when the note could not be saved', async () => {
    const { onClose } = mount(vi.fn(() => null));
    await write();
    fireEvent.click(await screen.findByRole('button', { name: /Save as a note/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Copy puts the Markdown on the clipboard', async () => {
    mount();
    await write();
    fireEvent.click(await screen.findByRole('button', { name: /^Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('## Done\n- Ship release'));
  });

  it('does not offer Save when the reply was cut off', async () => {
    mount();
    await write({ ...ok, stopReason: 'length' });
    await waitFor(() => expect(document.querySelector('.ai-digest__text')).not.toBeNull());
    expect((screen.getByRole('button', { name: /Save as a note/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts as a status update when the page asked for one, and as a retrospective otherwise', async () => {
    mount(undefined, 'upward');
    expect(screen.getByRole('radio', { name: /Status update/ })).toHaveProperty('checked', true);
    cleanup();
    mount();
    expect(screen.getByRole('radio', { name: /Retrospective/ })).toHaveProperty('checked', true);
  });

  it('says there is nothing to summarise, and writes nothing, when the period has no activity', () => {
    quiet = true;
    try {
      mount(undefined, 'upward');
      expect(screen.getByText(/Nothing to summarise/i)).toBeTruthy();
      expect((screen.getByRole('button', { name: /Write summary/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(runAiTask).not.toHaveBeenCalled();
    } finally {
      quiet = false;
    }
  });

  it('notes ticked under a longer period do not keep the remaining boxes locked after the period shrinks', () => {
    manyNotes = true;
    try {
      mount();
      fireEvent.change(screen.getByLabelText('Period'), { target: { value: '30' } });
      for (let i = 1; i <= 5; i += 1) fireEvent.click(screen.getByLabelText(`Old ${i}`));
      fireEvent.change(screen.getByLabelText('Period'), { target: { value: '7' } });
      expect((screen.getByLabelText('New one') as HTMLInputElement).disabled).toBe(false);
    } finally {
      manyNotes = false;
    }
  });
});
