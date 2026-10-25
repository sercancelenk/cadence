import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiActionsMenu } from './AiActionsMenu';

afterEach(cleanup);
const actions = [
  { id: 'extract-tasks', label: 'Extract tasks', hint: 'Find tasks in this text' },
  { id: 'visualize', label: 'Visualize', hint: 'Turn it into a diagram' },
];

describe('AiActionsMenu', () => {
  it('renders nothing without actions', () => {
    const { container } = render(<AiActionsMenu actions={[]} onSelect={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('is one quiet button until opened, then lists the actions', () => {
    render(<AiActionsMenu actions={actions} onSelect={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'AI actions' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      expect.stringContaining('Extract tasks'),
      expect.stringContaining('Visualize'),
    ]);
  });

  it('selecting an action reports its id and closes the menu', () => {
    const onSelect = vi.fn();
    render(<AiActionsMenu actions={actions} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Visualize/ }));
    expect(onSelect).toHaveBeenCalledWith('visualize');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when the host says the selection it belongs to changed (resetKey)', () => {
    const { rerender } = render(<AiActionsMenu actions={actions} onSelect={() => {}} resetKey={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI actions' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    rerender(<AiActionsMenu actions={actions} onSelect={() => {}} resetKey={1} />);
    expect(screen.getByRole('menu')).toBeTruthy();
    rerender(<AiActionsMenu actions={actions} onSelect={() => {}} resetKey={2} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape closes the menu', () => {
    render(<AiActionsMenu actions={actions} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI actions' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when the user clicks elsewhere', () => {
    render(<AiActionsMenu actions={actions} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI actions' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape even when focus is still in the editor', () => {
    render(<AiActionsMenu actions={actions} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI actions' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not steal the editor selection: the trigger prevents focus-taking on mouse down', () => {
    render(<AiActionsMenu actions={actions} onSelect={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'AI actions' });
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    trigger.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
