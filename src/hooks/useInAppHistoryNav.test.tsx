import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { act, type ReactNode } from 'react';
import { useInAppHistoryNav } from './useInAppHistoryNav';

describe('useInAppHistoryNav', () => {
  it('starts with no back/forward on the first screen', () => {
    const { result } = renderHook(() => useInAppHistoryNav(), {
      wrapper: function W({ children }: { children: ReactNode }) {
        return (
          <MemoryRouter initialEntries={['/notes']}>
            <Routes>
              <Route path="*" element={children} />
            </Routes>
          </MemoryRouter>
        );
      },
    });
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it('enables back after an in-app push, then forward after going back', async () => {
    let navigateFn: ReturnType<typeof useNavigate> | null = null;
    function Probe() {
      navigateFn = useNavigate();
      return null;
    }

    const { result, rerender } = renderHook(() => useInAppHistoryNav(), {
      wrapper: function W({ children }: { children: ReactNode }) {
        return (
          <MemoryRouter initialEntries={['/notes']}>
            <Probe />
            <Routes>
              <Route path="*" element={children} />
            </Routes>
          </MemoryRouter>
        );
      },
    });

    expect(result.current.canGoBack).toBe(false);

    await act(async () => {
      navigateFn?.('/todos');
    });
    rerender();
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);

    await act(async () => {
      result.current.goBack();
    });
    rerender();
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(true);
  });

  it('treats revisiting a prior URL via Link/PUSH as a new entry, not Back', async () => {
    let navigateFn: ReturnType<typeof useNavigate> | null = null;
    function Probe() {
      navigateFn = useNavigate();
      return null;
    }

    const { result, rerender } = renderHook(() => useInAppHistoryNav(), {
      wrapper: function W({ children }: { children: ReactNode }) {
        return (
          <MemoryRouter initialEntries={['/notes']}>
            <Probe />
            <Routes>
              <Route path="*" element={children} />
            </Routes>
          </MemoryRouter>
        );
      },
    });

    await act(async () => {
      navigateFn?.('/todos');
    });
    rerender();
    await act(async () => {
      // Sidebar-style revisit: PUSH to a prior path, not browser Back
      navigateFn?.('/notes');
    });
    rerender();

    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);

    await act(async () => {
      result.current.goBack();
    });
    rerender();
    // Should land on /todos (middle of notes → todos → notes), not skip
    expect(result.current.canGoForward).toBe(true);
  });

  it('REPLACE overwrites the current stack entry without enabling Forward', async () => {
    let navigateFn: ReturnType<typeof useNavigate> | null = null;
    function Probe() {
      navigateFn = useNavigate();
      return null;
    }

    const { result, rerender } = renderHook(() => useInAppHistoryNav(), {
      wrapper: function W({ children }: { children: ReactNode }) {
        return (
          <MemoryRouter initialEntries={['/todos?focus=abc']}>
            <Probe />
            <Routes>
              <Route path="*" element={children} />
            </Routes>
          </MemoryRouter>
        );
      },
    });

    await act(async () => {
      navigateFn?.('/todos', { replace: true });
    });
    rerender();

    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });
});
