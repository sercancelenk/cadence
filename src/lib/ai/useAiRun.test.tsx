import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../../model';
import type { AiTask } from './types';

const runAiTask = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
let aiSettings: AISettings | undefined;
let flags = { ai: true, aiPeople: true, aiFocusNote: true };

vi.mock('./runTask', () => ({ runAiTask }));
vi.mock('../../AppDataContext', () => ({ useAppData: () => ({ data: { aiSettings } }) }));
vi.mock('../features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features')>()),
  useFeatures: () => ({ features: flags }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { useAiRun } from './useAiRun';

const task = { id: 'ai.test', promptVersion: 1, dataClass: 'content', needsJson: false, allowsFocusNote: false } as unknown as AiTask<string, string>;
const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const ok = (value: string, over: Record<string, unknown> = {}) => ({
  ok: true,
  value,
  connectionName: 'Company',
  model: 'team/x',
  fellBack: false,
  repaired: false,
  stopReason: 'stop',
  ...over,
});

beforeEach(() => {
  runAiTask.mockReset();
  navigate.mockClear();
  aiSettings = cloud;
  flags = { ai: true, aiPeople: true, aiFocusNote: true };
});

describe('useAiRun', () => {
  it('runs the task, shows busy while it works, and keeps the value and where it came from', async () => {
    let release: (v: unknown) => void = () => {};
    runAiTask.mockReturnValueOnce(new Promise((r) => (release = r)));
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    expect(result.current.busy).toBe(false);
    let promise: Promise<unknown> = Promise.resolve();
    act(() => {
      promise = result.current.run({ input: 'x' });
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => {
      release(ok('answer', { fellBack: true }));
      await promise;
    });
    expect(result.current).toMatchObject({ busy: false, value: 'answer', connectionLabel: 'Company', modelLabel: 'team/x', fellBack: true, truncated: false, error: null, blocked: null });
    const args = runAiTask.mock.calls[0][0];
    expect(args).toMatchObject({ task, input: 'x', settings: cloud, features: { ai: true, aiPeople: true, aiFocusNote: true } });
  });

  it('passes options, images, conversation and the people class through', async () => {
    runAiTask.mockResolvedValueOnce(ok('v'));
    const { result } = renderHook(() => useAiRun(task, { dataClass: 'people' }), { wrapper });
    const images = [{ mediaType: 'image/png' as const, base64: 'AAAA' }];
    await act(async () => {
      await result.current.run({ input: 'x', options: { kind: 'a' }, images, conversation: [{ role: 'assistant', content: 'prev' }] });
    });
    expect(runAiTask.mock.calls[0][0]).toMatchObject({ options: { kind: 'a' }, images, dataClass: 'people', conversation: [{ role: 'assistant', content: 'prev' }] });
  });

  it('marks a reply cut off at the token limit', async () => {
    runAiTask.mockResolvedValueOnce(ok('half', { stopReason: 'length' }));
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    await act(async () => {
      await result.current.run({ input: 'x' });
    });
    expect(result.current.truncated).toBe(true);
  });

  it('a streamed reply that ended without a clear finish is treated as possibly cut off; a plain one is not', async () => {
    runAiTask.mockResolvedValueOnce(ok('partial', { stopReason: 'other' }));
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    await act(async () => {
      await result.current.run({ input: 'x', stream: true });
    });
    expect(result.current.truncated).toBe(true);
    runAiTask.mockResolvedValueOnce(ok('whole', { stopReason: 'other' }));
    await act(async () => {
      await result.current.run({ input: 'x' });
    });
    expect(result.current.truncated).toBe(false);
  });

  it('does not start a request after the dialog is gone', async () => {
    const { result, unmount } = renderHook(() => useAiRun(task), { wrapper });
    unmount();
    await result.current.run({ input: 'x' });
    expect(runAiTask).not.toHaveBeenCalled();
  });

  it('a superseded run does not clear busy or overwrite the newer run', async () => {
    let releaseA: (v: unknown) => void = () => {};
    let releaseB: (v: unknown) => void = () => {};
    runAiTask.mockReturnValueOnce(new Promise((r) => (releaseA = r))).mockReturnValueOnce(new Promise((r) => (releaseB = r)));
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    act(() => void result.current.run({ input: 'a' }));
    act(() => void result.current.run({ input: 'b' }));
    await act(async () => releaseA(ok('from A')));
    expect(result.current.busy).toBe(true);
    expect(result.current.value).toBeNull();
    await act(async () => releaseB(ok('from B')));
    expect(result.current.busy).toBe(false);
    expect(result.current.value).toBe('from B');
  });

  it('the caller of a superseded run gets null, so it cannot apply an outdated result', async () => {
    let releaseA: (v: unknown) => void = () => {};
    runAiTask.mockReturnValueOnce(new Promise((r) => (releaseA = r))).mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.run({ input: 'a' });
    });
    act(() => void result.current.run({ input: 'b' }));
    await act(async () => releaseA(ok('from A')));
    await expect(first).resolves.toBeNull();
  });

  it.each([
    ['not-configured', true],
    ['capability', true],
    ['blocked-people', true],
    ['policy', false],
  ])('a %s failure is a blocked state (settings button: %s)', async (reason, canOpenSettings) => {
    runAiTask.mockResolvedValueOnce({ ok: false, reason, message: `msg ${reason}` });
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    await act(async () => {
      await result.current.run({ input: 'x' });
    });
    expect(result.current.blocked).toEqual({ message: `msg ${reason}`, canOpenSettings });
    expect(result.current.value).toBeNull();
  });

  it('an engine or output failure is an inline error with its diagnostic; a cancel is nothing', async () => {
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'engine', message: 'HTTP 500', diagnostic: 'POST x' });
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    await act(async () => {
      await result.current.run({ input: 'x' });
    });
    expect(result.current.error).toEqual({ message: 'HTTP 500', diagnostic: 'POST x' });
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'cancelled', message: 'Cancelled.' });
    await act(async () => {
      await result.current.run({ input: 'x' });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.blocked).toBeNull();
  });

  it('a new run clears the previous result first', async () => {
    runAiTask.mockResolvedValueOnce(ok('first'));
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    await act(async () => {
      await result.current.run({ input: 'x' });
    });
    expect(result.current.value).toBe('first');
    runAiTask.mockResolvedValueOnce({ ok: false, reason: 'engine', message: 'boom' });
    await act(async () => {
      await result.current.run({ input: 'x' });
    });
    expect(result.current.value).toBeNull();
  });

  it('streams: stream:true gives the text so far, and the final value replaces it', async () => {
    runAiTask.mockImplementationOnce(async (a: { onText?: (t: string) => void }) => {
      a.onText?.('par');
      a.onText?.('partial');
      return ok('final');
    });
    const { result } = renderHook(() => useAiRun(task), { wrapper });
    await act(async () => {
      await result.current.run({ input: 'x', stream: true });
    });
    expect(runAiTask.mock.calls[0][0].onText).toBeTypeOf('function');
    expect(result.current.streamText).toBe('partial');
    expect(result.current.value).toBe('final');
    runAiTask.mockResolvedValueOnce(ok('plain'));
    await act(async () => {
      await result.current.run({ input: 'x' });
    });
    expect(runAiTask.mock.calls[1][0].onText).toBeUndefined();
    expect(result.current.streamText).toBe('');
  });

  it('abort cancels the request in flight, and unmounting does too', async () => {
    let signal: AbortSignal | undefined;
    runAiTask.mockImplementationOnce((a: { signal: AbortSignal }) => {
      signal = a.signal;
      return new Promise(() => {});
    });
    const { result, unmount } = renderHook(() => useAiRun(task), { wrapper });
    act(() => {
      void result.current.run({ input: 'x' });
    });
    await waitFor(() => expect(signal).toBeDefined());
    act(() => result.current.abort());
    expect(signal?.aborted).toBe(true);
    runAiTask.mockImplementationOnce((a: { signal: AbortSignal }) => {
      signal = a.signal;
      return new Promise(() => {});
    });
    act(() => {
      void result.current.run({ input: 'x' });
    });
    await waitFor(() => expect(signal?.aborted).toBe(false));
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('knows when AI is off or nothing is connected, and can send the user to Settings', () => {
    flags = { ai: false, aiPeople: false, aiFocusNote: false };
    const off = renderHook(() => useAiRun(task), { wrapper });
    expect(off.result.current.enabled).toBe(false);
    flags = { ai: true, aiPeople: true, aiFocusNote: true };
    aiSettings = undefined;
    const none = renderHook(() => useAiRun(task), { wrapper });
    expect(none.result.current.configured).toBe(false);
    expect(none.result.current.blockedView?.canOpenSettings).toBe(true);
    const close = vi.fn();
    act(() => none.result.current.openSettings(close));
    expect(close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('#ai'));
  });
});
