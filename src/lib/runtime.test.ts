import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isElectronApp, isMobileViewport, isMobileWeb, MOBILE_BREAKPOINT_PX, useMobileWeb } from './runtime';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn((query: string) => {
    expect(query).toBe(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList;
  });
}

describe('isElectronApp', () => {
  afterEach(() => {
    delete window.cadence;
  });

  it('returns false when cadence.saveData is absent', () => {
    expect(isElectronApp()).toBe(false);
  });

  it('returns true when cadence.saveData is present', () => {
    window.cadence = { saveData: async () => true } as unknown as Window['cadence'];
    expect(isElectronApp()).toBe(true);
  });
});

describe('isMobileViewport', () => {
  afterEach(() => {
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
  });

  it('returns true when the mobile breakpoint matches', () => {
    mockMatchMedia(true);
    expect(isMobileViewport()).toBe(true);
  });

  it('returns false when the viewport is wider than the breakpoint', () => {
    mockMatchMedia(false);
    expect(isMobileViewport()).toBe(false);
  });
});

describe('isMobileWeb', () => {
  afterEach(() => {
    delete window.cadence;
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
  });

  it('is true on a narrow viewport without Electron', () => {
    mockMatchMedia(true);
    expect(isMobileWeb()).toBe(true);
  });

  it('is false on desktop viewport', () => {
    mockMatchMedia(false);
    expect(isMobileWeb()).toBe(false);
  });

  it('is false in Electron even when the viewport is narrow', () => {
    mockMatchMedia(true);
    window.cadence = { saveData: async () => true } as unknown as Window['cadence'];
    expect(isMobileWeb()).toBe(false);
  });
});

describe('useMobileWeb', () => {
  afterEach(() => {
    delete window.cadence;
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
  });

  it('starts from isMobileWeb and updates when the media query changes', () => {
    let listener: (() => void) | null = null;
    window.matchMedia = vi.fn((query: string) => {
      expect(query).toBe(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_event, cb) => {
          listener = cb as () => void;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as MediaQueryList;
    });

    const { result } = renderHook(() => useMobileWeb());
    expect(result.current).toBe(true);

    act(() => {
      (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      listener?.();
    });

    expect(result.current).toBe(false);
  });

  it('removes the media-query listener on unmount', () => {
    const removeListener = vi.fn();
    window.matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: removeListener,
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    const { unmount } = renderHook(() => useMobileWeb());
    unmount();
    expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
