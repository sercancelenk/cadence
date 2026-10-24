/**
 * Moving a Tools tab to Notes through the provider: the note and the tab removal
 * are one update, the freshest editor text is included, a write-protected
 * workspace is left alone, and a tab can only be moved once.
 */

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeData, type AppData } from '../core/model';
import { registerBeforeFlushHook } from '../lib/pendingSaveFlush';
import { STORAGE_PREFIX } from '../lib/appBranding';

vi.mock('./AccountContext', () => ({ useAccount: () => ({ user: { id: 'user-1' } }) }));

import { AppDataProvider, useAppData } from './AppDataContext';

type Api = ReturnType<typeof useAppData>;
type Saved = Record<string, unknown>;
let api: Api;
let saved: Saved[];

function Probe() {
  api = useAppData();
  return null;
}

const TS = '2026-01-01T00:00:00.000Z';
const seed = (): AppData =>
  normalizeData({
    ...normalizeData(null),
    noteGroups: [{ id: 'g1', name: 'Projects', sortOrder: 0, createdAt: TS }],
    utilityDocumentTabs: [
      { id: 't1', title: 'Plan', body: 'plan body', updatedAt: TS },
      { id: 't2', title: 'Other', body: 'other body', updatedAt: TS },
    ],
    activeDocumentTabId: 't1',
    utilityStructuredTabs: [
      { id: 's1', title: 'config', content: '{"a":1}', language: 'json', mode: 'edit', updatedAt: TS },
    ],
    activeStructuredTabId: 's1',
  });

function install(loadResult: Record<string, unknown>) {
  saved = [];
  (window as unknown as { cadence: unknown }).cadence = {
    loadDataResult: vi.fn(async () => loadResult),
    saveData: vi.fn(async (payload: Saved) => {
      saved.push(payload);
      return { ok: true, writeGeneration: saved.length };
    }),
  };
}

async function mountReady(load: Record<string, unknown> = { ok: true, data: seed(), writeGeneration: 1 }) {
  install(load);
  render(
    <AppDataProvider>
      <Probe />
    </AppDataProvider>,
  );
  await waitFor(() => expect(api.ready).toBe(true));
  await act(async () => {
    await api.flushPendingSave();
  });
  saved.length = 0;
}

const snap = () => api.getLatestSnapshot();

describe('moving Tools tabs to Notes', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { cadence?: unknown }).cadence;
  });

  it('creates the note and removes the document tab in one snapshot, and a flush writes both', async () => {
    await mountReady();
    let noteId: string | null = null;
    await act(async () => {
      noteId = await api.moveDocumentTabToNote('t1', 'g1');
    });
    expect(noteId).toBeTruthy();
    const note = snap().notes.find((n) => n.id === noteId)!;
    expect(note).toMatchObject({ title: 'Plan', body: 'plan body', groupId: 'g1' });
    expect(snap().utilityDocumentTabs!.map((t) => t.id)).toEqual(['t2']);

    await act(async () => {
      await api.flushPendingSave();
    });
    const disk = saved[saved.length - 1] as { notes: Array<{ id: string }>; utilityDocumentTabs: Array<{ id: string }> };
    expect(disk.notes.some((n) => n.id === noteId)).toBe(true);
    expect(disk.utilityDocumentTabs.map((t) => t.id)).toEqual(['t2']);
  });

  it('moves the freshest text the editor hands over during the flush', async () => {
    await mountReady();
    const off = registerBeforeFlushHook(() => {
      api.patchDocumentTab('t1', { body: 'typed a moment ago' });
    }, 'editor');
    let noteId: string | null = null;
    await act(async () => {
      noteId = await api.moveDocumentTabToNote('t1');
    });
    off();
    expect(snap().notes.find((n) => n.id === noteId)!.body).toBe('typed a moment ago');
  });

  it('returns null for a tab that does not exist', async () => {
    await mountReady();
    let noteId: string | null = 'x';
    await act(async () => {
      noteId = await api.moveDocumentTabToNote('ghost');
    });
    expect(noteId).toBeNull();
    expect(snap().notes).toHaveLength(0);
  });

  it('changes nothing while saving is blocked, even though the tab is there', async () => {
    // A previously healthy, much larger workspace makes the boot integrity check
    // block persistence while the loaded data (with its tabs) stays on screen.
    localStorage.setItem(
      `${STORAGE_PREFIX}-last-shape-user-1`,
      JSON.stringify({ teams: 1, people: 0, items: 0, todoGroups: 1, todoItems: 0, notes: 200, total: 200 }),
    );
    install({ ok: true, data: seed(), writeGeneration: 1 });
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    await waitFor(() => expect(api.ready).toBe(true));
    expect(snap().utilityDocumentTabs).toHaveLength(2);

    let noteId: string | null = 'x';
    await act(async () => {
      noteId = await api.moveDocumentTabToNote('t1');
    });
    expect(noteId).toBeNull();
    expect(snap().notes).toHaveLength(0);
    expect(snap().utilityDocumentTabs!.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(saved).toHaveLength(0);
  });

  it('creates exactly one note when the same tab is moved twice at once', async () => {
    await mountReady();
    let results: Array<string | null> = [];
    await act(async () => {
      results = await Promise.all([api.moveDocumentTabToNote('t1'), api.moveDocumentTabToNote('t1')]);
    });
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(snap().notes).toHaveLength(1);
  });

  it('keeps an empty tabs array after moving the only tab, through a save and reload', async () => {
    await mountReady();
    await act(async () => {
      await api.moveDocumentTabToNote('t1');
      await api.moveDocumentTabToNote('t2');
      await api.flushPendingSave();
    });
    const disk = saved[saved.length - 1] as Record<string, unknown>;
    expect(disk.utilityDocumentTabs).toEqual([]);
    expect(normalizeData(JSON.parse(JSON.stringify(disk))).utilityDocumentTabs).toEqual([]);
  });

  it('does not bring the legacy document back after every tab was moved, through save and reload', async () => {
    const legacy = { body: 'the old single document', updatedAt: TS };
    const withLegacy = normalizeData({ ...seed(), utilityDocument: legacy, utilityDocumentLegacySeenAt: TS });
    await mountReady({ ok: true, data: withLegacy, writeGeneration: 1 });
    await act(async () => {
      await api.moveDocumentTabToNote('t1');
      await api.moveDocumentTabToNote('t2');
      await api.flushPendingSave();
    });
    const disk = JSON.parse(JSON.stringify(saved[saved.length - 1]));
    expect(disk.utilityDocumentTabs).toEqual([]);
    expect(disk.utilityDocument).toEqual(legacy);
    const reloaded = normalizeData(disk);
    expect(reloaded.utilityDocumentTabs).toEqual([]);
    expect(reloaded.notes).toHaveLength(2);
  });

  it('moves a JSON/YAML tab as a note with a code block and drops the tab', async () => {
    await mountReady();
    let noteId: string | null = null;
    await act(async () => {
      noteId = await api.moveStructuredTabToNote('s1', 'g1');
    });
    const note = snap().notes.find((n) => n.id === noteId)!;
    expect(note).toMatchObject({ title: 'config', groupId: 'g1', bodyFormat: 'prosemirror' });
    expect(note.bodyPlainText).toContain('"a":1');
    expect(snap().utilityStructuredTabs).toEqual([]);
  });

  it('manages document tabs through the provider', async () => {
    await mountReady();
    let id = '';
    await act(async () => {
      id = api.addDocumentTab();
    });
    expect(snap().utilityDocumentTabs!.map((t) => t.id)).toContain(id);
    expect(snap().activeDocumentTabId).toBe(id);
    await act(async () => {
      api.renameDocumentTab(id, 'Renamed');
      api.patchDocumentTab(id, { body: 'x' });
      api.setActiveDocumentTab('t1');
      api.closeDocumentTab('t2');
    });
    expect(snap().utilityDocumentTabs!.find((t) => t.id === id)).toMatchObject({ title: 'Renamed', body: 'x' });
    expect(snap().activeDocumentTabId).toBe('t1');
    expect(snap().utilityDocumentTabs!.some((t) => t.id === 't2')).toBe(false);
  });
});
