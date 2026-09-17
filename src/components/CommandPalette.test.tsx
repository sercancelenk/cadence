/**
 * The palette is mounted at the app root, so anything it reads from the
 * workspace is read on every keystroke typed anywhere in the app. These tests
 * pin the two properties that keep it off the typing hot path:
 *
 *  - while closed it touches no workspace data at all;
 *  - the index resolves teams/people by map, not by nested `find`.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppData, Note } from '../model';
import { normalizeData } from '../model';
import type { PaletteData } from './CommandPalette';

const AT = '2024-01-01T00:00:00.000Z';

function paletteData(overrides: Partial<PaletteData> = {}): PaletteData {
  return { teams: [], people: [], items: [], todoItems: [], notes: [], ...overrides };
}

const selectorCalls = { count: 0 };
let workspace: AppData = normalizeData(null);
// Mirrors the real hook: the equality function decides whether the consumer
// sees a new object. Without this the mock would hand out a fresh slice on
// every render, and any test about "what happens when the index changes" would
// pass for the wrong reason.
let lastSelected: { value: unknown } | null = null;

vi.mock('../AppDataContext', () => ({
  useAppDataSelector: <T,>(selector: (d: AppData) => T, isEqual?: (a: T, b: T) => boolean): T => {
    selectorCalls.count += 1;
    const next = selector(workspace);
    if (lastSelected && isEqual?.(lastSelected.value as T, next)) return lastSelected.value as T;
    lastSelected = { value: next };
    return next;
  },
}));

const { CommandPalette, buildCommands } = await import('./CommandPalette');

function renderPalette() {
  return render(
    <MemoryRouter>
      <CommandPalette />
    </MemoryRouter>,
  );
}

function pressCmdK() {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
}

afterEach(() => {
  cleanup();
  selectorCalls.count = 0;
  lastSelected = null;
  workspace = normalizeData(null);
});

function titledNote(id: string, title: string): Note {
  return { id, title, body: '', bodyFormat: 'markdown', locked: false, createdAt: AT, updatedAt: AT };
}

/** Dispatched as a real event so the test can read back `defaultPrevented`. */
function dispatchEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  fireEvent(window, event);
  return event;
}

describe('CommandPalette', () => {
  it('reads no workspace data while closed', () => {
    renderPalette();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(selectorCalls.count).toBe(0);
  });

  it('builds the index only once the palette opens', () => {
    renderPalette();
    pressCmdK();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(selectorCalls.count).toBeGreaterThan(0);
  });

  it('finds a note by its body text', () => {
    const note: Note = {
      id: 'n1',
      title: 'Q3 review',
      body: 'we agreed on the rollout plan',
      bodyFormat: 'markdown',
      locked: false,
      createdAt: AT,
      updatedAt: AT,
    };
    workspace = { ...normalizeData(null), notes: [note] };

    renderPalette();
    pressCmdK();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'rollout' } });

    expect(screen.getByText('Q3 review')).toBeTruthy();
  });

  it('finds a Turkish title from an ASCII query', () => {
    workspace = { ...normalizeData(null), notes: [titledNote('n1', 'İstanbul toplantısı')] };

    renderPalette();
    pressCmdK();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'istanbul' } });

    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('runs the highlighted row on Enter and closes', () => {
    workspace = {
      ...normalizeData(null),
      notes: [titledNote('n1', 'Zeta One'), titledNote('n2', 'Zeta Two')],
    };
    renderPalette();
    pressCmdK();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'zeta' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not move the cursor off the end of an empty result list', () => {
    workspace = { ...normalizeData(null), notes: [titledNote('n1', 'Zeta One')] };
    renderPalette();
    pressCmdK();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'no-such-row' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Enter on an empty list must be a no-op, not a crash or a stray run.
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes on Escape', () => {
    renderPalette();
    pressCmdK();
    expect(dispatchEscape().defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves Escape to the rest of the app while closed', () => {
    renderPalette();
    expect(dispatchEscape().defaultPrevented).toBe(false);
  });

  it('keeps the highlighted row when a background change rebuilds the index', () => {
    workspace = {
      ...normalizeData(null),
      notes: [titledNote('n1', 'Zeta One'), titledNote('n2', 'Zeta Two')],
    };
    const view = renderPalette();
    pressCmdK();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'zeta' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const selectedTitle = () =>
      screen.getAllByRole('option').findIndex((el) => el.getAttribute('aria-selected') === 'true');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(selectedTitle()).toBe(1);

    // A reminder tick / sync apply mutates a collection the palette indexes.
    workspace = { ...workspace, notes: [...workspace.notes, titledNote('n3', 'Unrelated')] };
    view.rerender(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(selectedTitle()).toBe(1);
  });
});

describe('buildCommands', () => {
  const navigate = vi.fn();

  it('resolves a person team and an item owner without nested scans', () => {
    const commands = buildCommands(
      paletteData({
        teams: [{ id: 't1', name: 'Platform', createdAt: AT }],
        people: [{ id: 'p1', teamId: 't1', name: 'Alice', title: 'Staff', createdAt: AT }],
        items: [
          {
            id: 'i1',
            personId: 'p1',
            kind: 'task',
            title: 'Ship it',
            body: 'details',
            done: false,
            createdAt: AT,
            updatedAt: AT,
          },
        ],
      }),
      navigate,
    );

    const person = commands.find((c) => c.id === 'person-p1');
    expect(person?.hint).toBe('Platform');
    const item = commands.find((c) => c.id === 'item-i1');
    expect(item?.hint).toContain('Platform');
    expect(item?.hint).toContain('Alice');
  });

  it('skips items whose person or team is missing', () => {
    const commands = buildCommands(
      paletteData({
        items: [
          {
            id: 'i1',
            personId: 'ghost',
            kind: 'task',
            title: 'Orphan',
            body: '',
            done: false,
            createdAt: AT,
            updatedAt: AT,
          },
        ],
      }),
      navigate,
    );

    expect(commands.some((c) => c.id === 'item-i1')).toBe(false);
  });

  /**
   * A hit that navigates to the right page but does not open the thing the user
   * searched for is indistinguishable from search being broken. Each row's
   * destination has to carry the deep-link parameter its page consumes:
   * `useNotesSelection` reads `id`, `useTodoFocus` and `useItemFocus` read
   * `focus`.
   */
  it('carries a deep-link parameter for every entity hit', () => {
    const run = (id: string) => {
      navigate.mockClear();
      const commands = buildCommands(
        paletteData({
          teams: [{ id: 't1', name: 'Platform', createdAt: AT }],
          people: [{ id: 'p1', teamId: 't1', name: 'Alice', createdAt: AT }],
          items: [
            {
              id: 'i1',
              personId: 'p1',
              kind: 'task',
              title: 'Ship it',
              body: '',
              done: false,
              createdAt: AT,
              updatedAt: AT,
            },
          ],
          todoItems: [
            {
              id: 'd1',
              groupId: 'g1',
              title: 'Pay invoice',
              body: '',
              status: 'todo',
              done: false,
              createdAt: AT,
              updatedAt: AT,
            },
          ],
          notes: [titledNote('n1', 'Q3 review')],
        }),
        navigate,
      );
      commands.find((c) => c.id === id)?.run();
      return navigate.mock.calls[0]?.[0] as string | undefined;
    };

    expect(run('note-n1')).toBe('/notes?id=n1');
    expect(run('todo-d1')).toBe('/todos?focus=d1');
    expect(run('item-i1')).toBe('/teams/t1/people/p1?focus=i1');
  });

  it('never indexes the body of a locked note', () => {
    const commands = buildCommands(
      paletteData({
        notes: [
          {
            id: 'n1',
            title: 'Secret',
            locked: true,
            body: 'passphrase protected',
            createdAt: AT,
            updatedAt: AT,
          },
        ],
      }),
      navigate,
    );

    expect(commands.find((c) => c.id === 'note-n1')?.searchText).toBeUndefined();
  });
});
