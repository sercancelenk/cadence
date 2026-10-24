import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { noteExportFormatKey } from './notePreferences';
import { useNoteExportFormat } from './useNoteExportFormat';

describe('useNoteExportFormat', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to markdown', () => {
    const { result } = renderHook(() => useNoteExportFormat('u1'));
    expect(result.current.format).toBe('md');
  });

  it('restores a stored choice for the same user', () => {
    localStorage.setItem(noteExportFormatKey('u1'), 'html');
    const { result } = renderHook(() => useNoteExportFormat('u1'));
    expect(result.current.format).toBe('html');
  });

  it('persists a change per user without leaking to others', () => {
    const { result } = renderHook(() => useNoteExportFormat('u1'));
    act(() => result.current.setFormat('txt'));
    expect(localStorage.getItem(noteExportFormatKey('u1'))).toBe('txt');
    const other = renderHook(() => useNoteExportFormat('u2'));
    expect(other.result.current.format).toBe('md');
  });

  it('ignores a corrupt stored value', () => {
    localStorage.setItem(noteExportFormatKey('u1'), 'pdf');
    const { result } = renderHook(() => useNoteExportFormat('u1'));
    expect(result.current.format).toBe('md');
  });
});
