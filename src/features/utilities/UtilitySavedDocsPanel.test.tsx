import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UtilitySavedDocsPanel } from './UtilitySavedDocsPanel';

const docs = [
  { id: 'a', title: 'Alpha', updatedAt: '2026-01-03T10:00:00.000Z' },
  { id: 'b', title: 'Beta', updatedAt: '2026-01-02T10:00:00.000Z' },
  { id: 'c', title: 'Gamma', updatedAt: '2026-01-01T10:00:00.000Z' },
];

function mount() {
  const h = { onRename: vi.fn(), onDelete: vi.fn() };
  render(
    <UtilitySavedDocsPanel
      libraryId="sketch"
      kindLabel="sketches"
      docs={docs}
      activeId={null}
      dirty={false}
      onNew={() => {}}
      onOpen={() => {}}
      onSave={() => {}}
      onSaveAs={() => {}}
      {...h}
    />,
  );
  return h;
}

const rectAt = (top: number): DOMRect => ({ top, bottom: top + 28, left: 500, right: 528, width: 28, height: 28, x: 500, y: top, toJSON: () => ({}) });
const openMenuFor = (title: string, top: number) => {
  const btn = screen.getByLabelText(`Actions for ${title}`);
  btn.getBoundingClientRect = () => rectAt(top);
  fireEvent.click(btn);
  return screen.getByRole('menu');
};

beforeEach(() => {
  localStorage.setItem('cadence.utilityLibrary.open.sketch', '1');
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
});
afterEach(cleanup);

describe('UtilitySavedDocsPanel row menu', () => {
  it('is drawn outside the scrolling list, fixed to the screen, so the list can never clip or cover it', () => {
    mount();
    const menu = openMenuFor('Alpha', 120);
    expect(menu.closest('.utility-saved__list')).toBeNull();
    expect(menu.style.position).toBe('fixed');
  });

  it('opens below the button when there is room, and above it near the bottom of the screen', () => {
    mount();
    const below = openMenuFor('Alpha', 120);
    expect(below.style.top).toBe('150px');
    expect(below.style.bottom).toBe('');
    fireEvent.keyDown(document, { key: 'Escape' });
    const above = openMenuFor('Gamma', 760);
    expect(above.style.bottom).toBe('42px');
    expect(above.style.top).toBe('');
  });

  it('Delete and Rename are reachable and act on the right row', () => {
    const h = mount();
    openMenuFor('Beta', 160);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(h.onDelete).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('menu')).toBeNull();
    openMenuFor('Gamma', 200);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(h.onRename).toHaveBeenCalledWith('c');
  });

  it('closes on Escape, on an outside press and when the page scrolls', () => {
    mount();
    openMenuFor('Alpha', 120);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    openMenuFor('Alpha', 120);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    openMenuFor('Alpha', 120);
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('UtilitySavedDocsPanel row menu: keyboard', () => {
  it('moves focus into the menu when it opens, so Rename and Delete can be reached', () => {
    mount();
    openMenuFor('Alpha', 120);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }));
  });

  it('arrow keys, Home and End move between the items', () => {
    mount();
    const menu = openMenuFor('Alpha', 120);
    const rename = screen.getByRole('menuitem', { name: 'Rename' });
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(del);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rename);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(del);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(rename);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(del);
  });

  it('Escape and choosing an item put focus back on the ⋮ button', () => {
    mount();
    const button = screen.getByLabelText('Actions for Alpha');
    openMenuFor('Alpha', 120);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
    openMenuFor('Alpha', 120);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(document.activeElement).toBe(button);
  });
});
