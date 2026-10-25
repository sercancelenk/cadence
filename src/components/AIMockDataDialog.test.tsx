import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';

const runAiTask = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
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

import { AIMockDataDialog } from './AIMockDataDialog';

const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const SAMPLE = '{"id":1,"name":"Ana","active":true}';
const ok = (records: unknown[], over: Record<string, unknown> = {}) => ({ ok: true, value: records, connectionName: 'Company', model: 'team/x', fellBack: false, repaired: false, stopReason: 'stop', ...over });

function mount(sample = SAMPLE, onApply = vi.fn(() => 'tab-2' as string | null)) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AIMockDataDialog open onClose={onClose} tabTitle="users" sampleText={sample} onApply={onApply} />
    </MemoryRouter>,
  );
  return { onClose, onApply };
}
const generate = async (result: unknown) => {
  runAiTask.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));
  await waitFor(() => expect(runAiTask).toHaveBeenCalled());
};

beforeEach(() => {
  runAiTask.mockReset();
  navigate.mockClear();
  writeText.mockClear();
  Object.values(toast).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});
afterEach(cleanup);

describe('AIMockDataDialog', () => {
  it('shows the sample as what is sent and sends nothing until asked', () => {
    mount();
    expect(screen.getByText('JSON sample')).toBeTruthy();
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('explains an unusable sample and does not allow a request', () => {
    mount('{oops');
    expect(screen.getByRole('alert').textContent).toMatch(/not valid/i);
    expect((screen.getByRole('button', { name: /^Generate$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('sends the sample and the chosen count', async () => {
    mount();
    fireEvent.change(screen.getByLabelText(/How many records/), { target: { value: '12' } });
    await generate(ok([{ id: 5, name: 'Bo', active: false }]));
    expect(runAiTask.mock.calls[0][0].input).toEqual({ sample: SAMPLE, count: 12 });
  });

  it('keeps the count between 1 and 50', async () => {
    mount();
    fireEvent.change(screen.getByLabelText(/How many records/), { target: { value: '500' } });
    await generate(ok([{ id: 5, name: 'Bo', active: false }]));
    expect(runAiTask.mock.calls[0][0].input.count).toBe(50);
  });

  it('lets the count be cleared and retyped, never shows a leading zero, and snaps into range on blur', () => {
    mount();
    const box = screen.getByLabelText(/How many records/) as HTMLInputElement;
    fireEvent.change(box, { target: { value: '' } });
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: '05' } });
    expect(box.value).toBe('5');
    fireEvent.change(box, { target: { value: '500' } });
    fireEvent.blur(box);
    expect(box.value).toBe('50');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(box.value).toBe('10');
  });

  it('shows only records that match the sample and says how many were left out', async () => {
    mount();
    await generate(ok([{ id: 2, name: 'Bo', active: false }, { id: '3', name: 'Cy', active: true }, { id: 4, name: 'Di', active: true, extra: 1 }]));
    await waitFor(() => expect(screen.getByText(/1 record/)).toBeTruthy());
    expect(screen.getByText(/2 .*left out/i)).toBeTruthy();
  });

  it('refuses when no record matches', async () => {
    mount();
    await generate(ok([{ nope: true }]));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/none of the records/i));
    expect(screen.queryByRole('button', { name: /Add as a new tab/ })).toBeNull();
  });

  it('Add as a new tab hands over a title and pretty JSON, then closes', async () => {
    const { onApply, onClose } = mount();
    await generate(ok([{ id: 2, name: 'Bo', active: false }]));
    fireEvent.click(await screen.findByRole('button', { name: /Add as a new tab/ }));
    expect(onApply).toHaveBeenCalledWith('Mock: users', JSON.stringify([{ id: 2, name: 'Bo', active: false }], null, 2));
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open when the tab could not be saved; Copy never touches the workspace', async () => {
    const { onClose, onApply } = mount(SAMPLE, vi.fn(() => null));
    await generate(ok([{ id: 2, name: 'Bo', active: false }]));
    fireEvent.click(await screen.findByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Add as a new tab/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a cut-off reply cannot be added; blocked and error runs are shown', async () => {
    mount();
    await generate(ok([{ id: 2, name: 'Bo', active: false }], { stopReason: 'length' }));
    await waitFor(() => expect(screen.getByText(/cut off/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Add as a new tab/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    mount();
    await generate({ ok: false, reason: 'not-configured', message: 'AI is not set up yet.' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Open AI settings/ })).toBeTruthy());
  });
});
