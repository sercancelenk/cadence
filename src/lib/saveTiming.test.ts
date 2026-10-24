import { describe, expect, it } from 'vitest';
import {
  EDITOR_CHANGE_DEBOUNCE_MS,
  EDITOR_MAX_WAIT_MS,
  MAX_UNSAVED_WINDOW_MS,
  STRUCTURAL_SAVE_DEBOUNCE_MS,
  TYPING_SAVE_INTERVAL_MS,
  editorFlushDelayMs,
  planSaveTimer,
} from './saveTiming';

describe('saveTiming constants', () => {
  it('writes typing every 30 s but structural edits within a second', () => {
    expect(TYPING_SAVE_INTERVAL_MS).toBe(30_000);
    expect(STRUCTURAL_SAVE_DEBOUNCE_MS).toBeLessThanOrEqual(1000);
  });

  it('keeps the editor buffer far shorter than the typing write interval', () => {
    expect(EDITOR_CHANGE_DEBOUNCE_MS).toBe(600);
    expect(EDITOR_MAX_WAIT_MS).toBeLessThan(TYPING_SAVE_INTERVAL_MS);
  });

  it('bounds the worst-case unsaved typing window to editor max wait plus the write interval', () => {
    expect(MAX_UNSAVED_WINDOW_MS).toBe(EDITOR_MAX_WAIT_MS + TYPING_SAVE_INTERVAL_MS);
  });
});

describe('planSaveTimer', () => {
  it('schedules the first typing change a full interval out', () => {
    expect(planSaveTimer('typing', 1_000, null)).toEqual({ dueAt: 1_000 + TYPING_SAVE_INTERVAL_MS });
  });

  it('does not push a pending typing write back while the user keeps typing', () => {
    expect(planSaveTimer('typing', 20_000, 1_000 + TYPING_SAVE_INTERVAL_MS)).toBeNull();
  });

  it('pulls a pending typing write forward when a structural edit arrives', () => {
    expect(planSaveTimer('structural', 5_000, 1_000 + TYPING_SAVE_INTERVAL_MS)).toEqual({
      dueAt: 5_000 + STRUCTURAL_SAVE_DEBOUNCE_MS,
    });
  });

  it('debounces consecutive structural edits', () => {
    expect(planSaveTimer('structural', 5_100, 5_000 + STRUCTURAL_SAVE_DEBOUNCE_MS)).toEqual({
      dueAt: 5_100 + STRUCTURAL_SAVE_DEBOUNCE_MS,
    });
  });

  it('keeps a short structural write when typing arrives afterwards', () => {
    expect(planSaveTimer('typing', 5_100, 5_000 + STRUCTURAL_SAVE_DEBOUNCE_MS)).toBeNull();
  });
});

describe('editorFlushDelayMs', () => {
  it('waits the full debounce for a fresh burst', () => {
    expect(editorFlushDelayMs(10_000, null)).toBe(EDITOR_CHANGE_DEBOUNCE_MS);
  });

  it('shortens the wait so a non-stop burst still flushes within the max wait', () => {
    expect(editorFlushDelayMs(10_000 + EDITOR_MAX_WAIT_MS - 100, 10_000)).toBe(100);
  });

  it('flushes immediately once the max wait has passed', () => {
    expect(editorFlushDelayMs(10_000 + EDITOR_MAX_WAIT_MS + 50, 10_000)).toBe(0);
  });
});
