import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UtilityTabStrip } from './UtilityTabStrip';

const tabs = [
  { id: 'a', title: 'Alpha', badge: <span data-testid="badge-a">JSON</span> },
  { id: 'b', title: 'Beta' },
];

function setup(over: Partial<React.ComponentProps<typeof UtilityTabStrip>> = {}) {
  const props = {
    tabs,
    activeId: 'a',
    ariaLabel: 'Documents',
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onClose: vi.fn(),
    onRename: vi.fn(),
    ...over,
  };
  render(<UtilityTabStrip {...props} />);
  return props;
}

describe('UtilityTabStrip', () => {
  afterEach(cleanup);

  it('renders every tab, marks the active one and shows badges', () => {
    setup();
    const tabEls = screen.getAllByRole('tab');
    expect(tabEls).toHaveLength(2);
    expect(tabEls[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabEls[1]!.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('badge-a')).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Documents' })).toBeTruthy();
  });

  it('selects a tab on click and adds a tab from the plus button', () => {
    const p = setup();
    fireEvent.click(screen.getByText('Beta'));
    expect(p.onSelect).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }));
    expect(p.onAdd).toHaveBeenCalledTimes(1);
  });

  it('closes a tab without selecting it', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close Beta' }));
    expect(p.onClose).toHaveBeenCalledWith('b');
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('renames on double-click and Enter', () => {
    const p = setup();
    fireEvent.doubleClick(screen.getByText('Alpha'));
    const input = screen.getByDisplayValue('Alpha');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onRename).toHaveBeenCalledWith('a', 'Renamed');
  });

  it('cancels a rename on Escape without renaming', () => {
    const p = setup();
    fireEvent.doubleClick(screen.getByText('Alpha'));
    const input = screen.getByDisplayValue('Alpha');
    fireEvent.change(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(p.onRename).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('Nope')).toBeNull();
  });

  it('keeps only the active tab in the tab order', () => {
    setup();
    const [a, b] = screen.getAllByRole('tab');
    expect(a!.getAttribute('tabindex')).toBe('0');
    expect(b!.getAttribute('tabindex')).toBe('-1');
  });

  it('moves between tabs with the arrow keys, wrapping around, and Home / End', () => {
    const p = setup({ activeId: 'a' });
    const [a, b] = screen.getAllByRole('tab');
    fireEvent.keyDown(a!, { key: 'ArrowRight' });
    expect(p.onSelect).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(a!, { key: 'ArrowLeft' });
    expect(p.onSelect).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(b!, { key: 'Home' });
    expect(p.onSelect).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(a!, { key: 'End' });
    expect(p.onSelect).toHaveBeenLastCalledWith('b');
  });

  it('renames from the keyboard with F2', () => {
    const p = setup();
    fireEvent.keyDown(screen.getAllByRole('tab')[0]!, { key: 'F2' });
    const input = screen.getByDisplayValue('Alpha');
    fireEvent.change(input, { target: { value: 'Typed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onRename).toHaveBeenCalledWith('a', 'Typed');
  });

  it('does not navigate tabs while typing a new name', () => {
    const p = setup();
    fireEvent.keyDown(screen.getAllByRole('tab')[0]!, { key: 'F2' });
    fireEvent.keyDown(screen.getByDisplayValue('Alpha'), { key: 'ArrowRight' });
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('keeps the add button out of the tab list', () => {
    setup();
    const add = screen.getByRole('button', { name: 'New tab' });
    expect(screen.getByRole('tablist').contains(add)).toBe(false);
  });
});

