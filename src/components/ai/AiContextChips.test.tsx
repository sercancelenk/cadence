import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiContextChips } from './AiContextChips';

afterEach(cleanup);

describe('AiContextChips', () => {
  it('shows two identical chips without a duplicate-key warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<AiContextChips chips={[{ label: 'Note', detail: '10 characters' }, { label: 'Note', detail: '10 characters' }]} />);
    expect(container.querySelectorAll('.ai-chips__item')).toHaveLength(2);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
    error.mockRestore();
  });
});
