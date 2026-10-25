/**
 * The write generation the renderer sends with each save must follow writes that happen in the
 * main process (a password change re-encrypts and commits the workspace there), or the next
 * edit is refused as a `write-conflict`.
 */

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeData, type AppData } from '../core/model';

vi.mock('./AccountContext', () => ({
  useAccount: () => ({ user: { id: 'user-1' } }),
}));

import { AppDataProvider, useAppData } from './AppDataContext';

let api: ReturnType<typeof useAppData>;
function Probe() {
  api = useAppData();
  return null;
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { cadence?: unknown }).cadence;
});

describe('refreshWriteGeneration', () => {
  it('makes the next save carry the generation the main process wrote', async () => {
    let diskGeneration = 1;
    const expected: Array<number | undefined> = [];
    (window as unknown as { cadence: unknown }).cadence = {
      loadDataResult: vi.fn(async () => ({ ok: true, data: normalizeData(null) as AppData, writeGeneration: diskGeneration })),
      saveData: vi.fn(async (_payload: unknown, _uid: string, expectedGeneration?: number) => {
        expected.push(expectedGeneration);
        diskGeneration += 1;
        return { ok: true, writeGeneration: diskGeneration };
      }),
    };
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    await waitFor(() => expect(api.ready).toBe(true));
    await act(async () => {
      await api.flushPendingSave();
    });
    expected.length = 0;

    // The main process commits the workspace on its own (as it does when the password changes).
    diskGeneration = 7;
    await act(async () => {
      await api.refreshWriteGeneration();
    });
    await act(async () => {
      api.update((d) => ({ ...d, lastTeamId: 'team-x' }));
      await api.flushPendingSave();
    });

    expect(expected).toEqual([7]);
  });
});
