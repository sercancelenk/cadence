import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sidebarGroupsKey, useSidebarGroups } from './useSidebarGroups';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('useSidebarGroups', () => {
  it('starts with People and Account folded', () => {
    const { result } = renderHook(() => useSidebarGroups('u1'));
    expect([...result.current.collapsed].sort()).toEqual(['account', 'people']);
  });

  it('falls back to the defaults, without throwing, when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useSidebarGroups('u1'));
    expect([...result.current.collapsed].sort()).toEqual(['account', 'people']);
  });

  it('still toggles, without throwing, when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useSidebarGroups('u1'));
    act(() => result.current.toggle('utilities'));
    expect(result.current.collapsed.has('utilities')).toBe(true);
  });

  it('keeps each user separate', () => {
    localStorage.setItem(sidebarGroupsKey('u1'), JSON.stringify(['workspace']));
    expect([...renderHook(() => useSidebarGroups('u1')).result.current.collapsed]).toEqual(['workspace']);
    expect([...renderHook(() => useSidebarGroups('u2')).result.current.collapsed].sort()).toEqual(['account', 'people']);
  });
});
