import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('embedding model', () => {
  it('is saved with the connection, and clearing it saves an empty value', () => {
    const h = handlers();
    render(<ConnectionForm saved={{ ...saved, embeddingModel: 'nomic-embed-text' }} {...h} />);
    const field = screen.getByLabelText(/^Embedding model/) as HTMLInputElement;
    expect(field.value).toBe('nomic-embed-text');
    fireEvent.change(field, { target: { value: 'bge-m3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    expect(h.onSave.mock.calls[0][0].embeddingModel).toBe('bge-m3');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    expect(h.onSave.mock.calls[1][0].embeddingModel).toBe('');
  });

  it('is not offered for a format that has no embeddings', () => {
    render(<ConnectionForm saved={{ ...saved, gatewayFormat: 'anthropic' }} {...handlers()} />);
    expect(screen.queryByLabelText(/^Embedding model/)).toBeNull();
  });
});

describe('Check images and Check live replies', () => {
  const imgBtn = () => screen.getByRole('button', { name: /Check images/ });
  const liveBtn = () => screen.getByRole('button', { name: /Check live replies/ });

  it('records images as supported when the model names the colour, keeping what was known', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} savedCapabilities={['json']} {...h} />);
    askAI.mockResolvedValueOnce(reply('Red'));
    fireEvent.click(imgBtn());
    await waitFor(() => expect(h.onProbed).toHaveBeenCalledTimes(1));
    expect(h.onProbed.mock.calls[0][0]).toEqual({ capabilities: ['json', 'vision'] });
    expect(screen.getByText(/Images: ok/)).toBeTruthy();
  });

  it('records images as not supported, and removes a capability that was recorded before', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} savedCapabilities={['vision']} {...h} />);
    askAI.mockResolvedValueOnce(reply('I cannot see images'));
    fireEvent.click(imgBtn());
    await waitFor(() => expect(h.onProbed).toHaveBeenCalledTimes(1));
    expect(h.onProbed.mock.calls[0][0]).toEqual({ capabilities: [] });
    expect(screen.getByText(/Images: not supported/)).toBeTruthy();
  });

  it('does not record a check whose request failed', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} {...h} />);
    askAI.mockRejectedValueOnce(new Error('HTTP 429'));
    fireEvent.click(imgBtn());
    await waitFor(() => expect(screen.getByText(/could not be checked/)).toBeTruthy());
    expect(h.onProbed).not.toHaveBeenCalled();
  });

  it('shows the result but stores nothing while the form has unsaved changes', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} {...h} />);
    fireEvent.change(screen.getByLabelText(/^Model/), { target: { value: 'other-model' } });
    askAI.mockResolvedValueOnce(reply('Red'));
    fireEvent.click(imgBtn());
    await waitFor(() => expect(screen.getByText(/Images: ok/)).toBeTruthy());
    expect(screen.getByText(/Not saved/)).toBeTruthy();
    expect(h.onProbed).not.toHaveBeenCalled();
  });

  it('records live replies when the text arrives in steps', async () => {
    const h = handlers();
    render(<ConnectionForm saved={saved} {...h} />);
    askAI.mockImplementationOnce(async (input: { onText: (t: string) => void }) => {
      input.onText('1 2');
      input.onText('1 2 3');
      return reply('1 2 3');
    });
    fireEvent.click(liveBtn());
    await waitFor(() => expect(h.onProbed).toHaveBeenCalledTimes(1));
    expect(h.onProbed.mock.calls[0][0]).toEqual({ capabilities: ['streaming'] });
    expect(screen.getByText(/Live replies: ok/)).toBeTruthy();
  });

  it('the buttons are off until the connection is complete', () => {
    render(<ConnectionForm saved={undefined} {...handlers()} />);
    expect((imgBtn() as HTMLButtonElement).disabled).toBe(true);
    expect((liveBtn() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('what Test connection says stays true', () => {
  it('"Connection works" goes away as soon as what was tested is edited, and the result is announced', async () => {
    render(<ConnectionForm saved={saved} {...handlers()} />);
    askAI.mockResolvedValueOnce(reply('ok')).mockResolvedValueOnce(reply('{"ok":true}'));
    fireEvent.click(testBtn());
    await waitFor(() => expect(screen.getByText(/Connection works/)).toBeTruthy());
    expect(screen.getByText(/Connection works/).getAttribute('role')).toBe('status');
    fireEvent.change(screen.getByLabelText(/^Model/), { target: { value: 'llama3:70b' } });
    expect(screen.queryByText(/Connection works/)).toBeNull();
    expect(screen.queryByText(/JSON replies/)).toBeNull();
  });

  it('an error is announced as an alert, and also clears when the form is edited', async () => {
    render(<ConnectionForm saved={saved} {...handlers()} />);
    askAI.mockRejectedValueOnce(new Error('HTTP 401'));
    fireEvent.click(testBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^Model/), { target: { value: 'other' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the Show/Hide key button says what it does and whether it is on', () => {
    render(<ConnectionForm saved={saved} {...handlers()} />);
    const toggle = screen.getByRole('button', { name: /show api key/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /hide api key/i }).getAttribute('aria-pressed')).toBe('true');
  });
});

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
    await act(async () => {
      await Promise.resolve();
    });
    // The result is about a configuration that is no longer in the form, so it is neither stored nor shown.
    expect(h.onProbed).not.toHaveBeenCalled();
    expect(screen.queryByText(/Connection works/)).toBeNull();
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
    await act(async () => {
      await Promise.resolve();
    });
    // The result is about a configuration that is no longer in the form, so it is neither stored nor shown.
    expect(h.onProbed).not.toHaveBeenCalled();
    expect(screen.queryByText(/Connection works/)).toBeNull();
  });
});
