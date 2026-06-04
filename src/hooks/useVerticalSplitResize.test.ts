import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useRef } from 'react';
import { useVerticalSplitResize } from './useVerticalSplitResize';

function mountHook(containerHeight = 600) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      height: containerHeight,
      width: 800,
      top: 0,
      left: 0,
      right: 800,
      bottom: containerHeight,
    }),
  });
  document.body.appendChild(container);

  const { result, unmount } = renderHook(() => {
    const containerRef = useRef<HTMLElement | null>(container);
    return useVerticalSplitResize({
      containerRef,
      defaultSize: 220,
      minTop: 96,
      minBottom: 160,
    });
  });

  return {
    result,
    container,
    unmount: () => {
      unmount();
      container.remove();
    },
  };
}

describe('useVerticalSplitResize', () => {
  afterEach(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  it('starts at default size and clamps while dragging', () => {
    const { result, unmount } = mountHook();
    expect(result.current.topSize).toBe(220);

    const splitter = document.createElement('div');
    const capture = vi.fn();
    splitter.setPointerCapture = capture;
    splitter.releasePointerCapture = vi.fn();

    act(() => {
      result.current.begin({
        button: 0,
        preventDefault: vi.fn(),
        currentTarget: splitter,
        pointerId: 1,
        clientY: 100,
      } as unknown as React.PointerEvent<HTMLElement>);
    });

    act(() => {
      result.current.move({
        clientY: 280,
        currentTarget: splitter,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>);
    });

    expect(result.current.topSize).toBe(400);

    act(() => {
      result.current.end({
        currentTarget: splitter,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>);
    });

    expect(document.body.style.cursor).toBe('');
    unmount();
  });

  it('ignores non-primary pointer buttons', () => {
    const { result, unmount } = mountHook();
    const splitter = document.createElement('div');
    splitter.setPointerCapture = vi.fn();
    splitter.releasePointerCapture = vi.fn();

    act(() => {
      result.current.begin({
        button: 1,
        preventDefault: vi.fn(),
        currentTarget: splitter,
        pointerId: 1,
        clientY: 100,
      } as unknown as React.PointerEvent<HTMLElement>);
    });

    expect(splitter.setPointerCapture).not.toHaveBeenCalled();
    unmount();
  });

  it('ignores move/end when drag has not started', () => {
    const { result, unmount } = mountHook();
    const splitter = document.createElement('div');

    act(() => {
      result.current.move({
        clientY: 200,
        currentTarget: splitter,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>);
      result.current.end({
        currentTarget: splitter,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>);
    });

    expect(result.current.topSize).toBe(220);
    unmount();
  });
});
