import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoResizeTextarea } from './AutoResizeTextarea';

afterEach(cleanup);

function mount(submitMode: 'enter' | 'mod') {
  const onSubmit = vi.fn();
  render(<AutoResizeTextarea value="hello" onChange={() => {}} onSubmit={onSubmit} submitMode={submitMode} ariaLabel="Box" />);
  return { onSubmit, box: screen.getByLabelText('Box') };
}

describe('AutoResizeTextarea submit', () => {
  it('Enter submits in enter mode and Shift+Enter does not', () => {
    const { onSubmit, box } = mount('enter');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('the Enter that confirms an IME composition does not submit', () => {
    const { onSubmit, box } = mount('enter');
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Cmd+Enter in mod mode submits, but not during composition', () => {
    const { onSubmit, box } = mount('mod');
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true, isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
