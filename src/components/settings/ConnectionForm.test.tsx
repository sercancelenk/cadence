import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const askAI = vi.hoisted(() => vi.fn());
vi.mock('../../lib/ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/ai')>()), askAI }));
vi.mock('../ui/ConfirmProvider', () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));

import { ConnectionForm, type ConnectionFormSaved } from './ConnectionForm';

const saved: ConnectionFormSaved = { provider: 'gateway', baseUrl: 'http://localhost:11434/v1', model: 'llama3' };
const handlers = () => ({ onSave: vi.fn(), onRemove: vi.fn(), onProbed: vi.fn() });
const reply = (text: string) => ({ text, stopReason: 'stop' as const });
const testBtn = () => screen.getByRole('button', { name: /Test connection/ });

/** A promise the test resolves by hand, to model a slow request. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => askAI.mockReset());
afterEach(cleanup);

describe('JSON check in Test connection', () => {
  it('stores a good result for the configuration that was tested', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} {...h} />);
    askAI.mockResolvedValueOnce(reply('ok')).mockResolvedValueOnce(reply('{"ok":true}'));
    fireEvent.click(testBtn());
    await waitFor(() => expect(h.onProbed).toHaveBeenCalledTimes(1));
    expect(h.onProbed.mock.calls[0][0].capabilities).toEqual(['json']);
    expect(screen.getByText(/JSON replies: ok/)).toBeTruthy();
  });

  it('a model that answers without JSON is recorded as unreliable', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} {...h} />);
    askAI.mockResolvedValueOnce(reply('ok')).mockResolvedValueOnce(reply('sure thing'));
    fireEvent.click(testBtn());
    await waitFor(() => expect(h.onProbed).toHaveBeenCalledTimes(1));
    expect(h.onProbed.mock.calls[0][0].capabilities).toEqual([]);
    expect(screen.getByText(/JSON replies: unreliable/)).toBeTruthy();
  });

  it('a failed probe request is not recorded: a rate limit must not block Extract tasks', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} {...h} />);
    askAI.mockResolvedValueOnce(reply('ok')).mockRejectedValueOnce(new Error('HTTP 429'));
    fireEvent.click(testBtn());
    await waitFor(() => expect(screen.getByText(/could not be checked/i)).toBeTruthy());
    expect(h.onProbed).not.toHaveBeenCalled();
    expect(screen.queryByText(/unreliable/)).toBeNull();
  });

  it('does not store a result when the saved configuration changed while the probe was running', async () => {
    const h = handlers();
    const { rerender } = render(<ConnectionForm saved={saved} {...h} />);
    const probe = deferred<ReturnType<typeof reply>>();
    askAI.mockResolvedValueOnce(reply('ok')).mockReturnValueOnce(probe.promise);
    fireEvent.click(testBtn());
    await waitFor(() => expect(askAI).toHaveBeenCalledTimes(2));
    // Meanwhile the user saved a different model for this connection.
    rerender(<ConnectionForm saved={{ ...saved, model: 'llama3:70b' }} {...h} />);
    probe.resolve(reply('{"ok":true}'));
    await waitFor(() => expect(screen.getByText(/Not saved: save the connection, then test again/)).toBeTruthy());
    expect(h.onProbed).not.toHaveBeenCalled();
  });

  it('does not store a result when the form was edited while the probe was running', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} {...h} />);
    const probe = deferred<ReturnType<typeof reply>>();
    askAI.mockResolvedValueOnce(reply('ok')).mockReturnValueOnce(probe.promise);
    fireEvent.click(testBtn());
    await waitFor(() => expect(askAI).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText(/^Model/), { target: { value: 'other-model' } });
    probe.resolve(reply('{"ok":true}'));
    await waitFor(() => expect(screen.getByText(/Not saved: save the connection, then test again/)).toBeTruthy());
    expect(h.onProbed).not.toHaveBeenCalled();
  });
});
