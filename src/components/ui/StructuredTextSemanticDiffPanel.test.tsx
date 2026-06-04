import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StructuredTextSemanticDiffPanel } from './StructuredTextSemanticDiffPanel';

afterEach(() => {
  cleanup();
});

describe('StructuredTextSemanticDiffPanel', () => {
  it('shows parse error when either side is invalid', () => {
    render(
      <StructuredTextSemanticDiffPanel valueA="{" valueB="{}" language="json" />,
    );
    expect(screen.getByText('Summary unavailable')).toBeTruthy();
  });

  it('shows empty state when documents match structurally', () => {
    render(
      <StructuredTextSemanticDiffPanel
        valueA='{"a":1}'
        valueB='{"a":1}'
        language="json"
        leftLabel="Sol"
        rightLabel="Sağ"
      />,
    );
    expect(screen.getByText(/Sol and Sağ match/)).toBeTruthy();
  });

  it('renders left/right columns for key and value differences', () => {
    const onJump = vi.fn();

    render(
      <StructuredTextSemanticDiffPanel
        valueA='{"soyad2":"Yılmaz","count":1}'
        valueB='{"soyad":"Yılmaz","count":2}'
        language="json"
        leftLabel="Left"
        rightLabel="Right"
        onJumpToPath={onJump}
      />,
    );

    expect(screen.getByText('Possible renames')).toBeTruthy();
    expect(screen.getByText('soyad2 → soyad')).toBeTruthy();
    expect(screen.queryByText('Only on Right')).toBeNull();
    expect(screen.queryByText('Only on Left')).toBeNull();
    expect(screen.getByText('Value changes')).toBeTruthy();

    const renameRow = screen.getByText('soyad2 → soyad').closest('li');
    expect(renameRow).toBeTruthy();
    fireEvent.click(within(renameRow!).getByTitle('Jump to this field on left'));
    expect(onJump).toHaveBeenCalledWith('a', '$.soyad2');
    fireEvent.click(within(renameRow!).getByTitle('Jump to this field on right'));
    expect(onJump).toHaveBeenCalledWith('b', '$.soyad');

    const valueRow = screen.getByText('count').closest('li');
    expect(valueRow).toBeTruthy();
    expect(within(valueRow!).getByText('1')).toBeTruthy();
    expect(within(valueRow!).getByText('2')).toBeTruthy();

    fireEvent.click(within(valueRow!).getByTitle('Jump to this field on right'));
    expect(onJump).toHaveBeenCalledWith('b', '$.count');
  });

  it('filters to keys-only and values-only views', () => {
    const { unmount } = render(
      <StructuredTextSemanticDiffPanel
        valueA='{"drop":1,"keep":1}'
        valueB='{"keep":1,"add":2}'
        language="json"
      />,
    );

    fireEvent.click(screen.getAllByRole('tab', { name: /Keys/i })[0]!);
    expect(screen.queryByText('Value changes')).toBeNull();

    fireEvent.click(screen.getAllByRole('tab', { name: /Values/i })[0]!);
    expect(screen.queryByText('Only on Right')).toBeNull();
    unmount();
  });

  it('virtualizes very large summaries instead of rendering every row', () => {
    const fields = Object.fromEntries(
      Array.from({ length: 90 }, (_, index) => [`field_${index}`, index]),
    );
    const next = Object.fromEntries(
      Array.from({ length: 90 }, (_, index) => [`field_${index}`, index + 1]),
    );

    const { container } = render(
      <StructuredTextSemanticDiffPanel
        valueA={JSON.stringify(fields)}
        valueB={JSON.stringify(next)}
        language="json"
      />,
    );

    expect(container.querySelector('.structured-text-semantic-diff__sections--virtual')).toBeTruthy();
    expect(container.querySelectorAll('.structured-text-semantic-diff__virtual-item').length).toBeLessThan(90);
  });
});
