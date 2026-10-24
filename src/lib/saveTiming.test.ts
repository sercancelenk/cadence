import { describe, expect, it } from 'vitest';
import {
  APP_SAVE_DEBOUNCE_MS,
  EDITOR_CHANGE_DEBOUNCE_MS,
  MAX_UNSAVED_WINDOW_MS,
} from './saveTiming';

describe('saveTiming', () => {
  it('keeps the editor buffer shorter than the app save debounce', () => {
    expect(EDITOR_CHANGE_DEBOUNCE_MS).toBeLessThan(APP_SAVE_DEBOUNCE_MS);
  });

  it('uses a calmer cadence than the old 120 ms / 400 ms defaults', () => {
    expect(EDITOR_CHANGE_DEBOUNCE_MS).toBe(600);
    expect(APP_SAVE_DEBOUNCE_MS).toBe(1800);
  });

  it('bounds the worst-case unsaved typing window to the two debounces combined', () => {
    expect(MAX_UNSAVED_WINDOW_MS).toBe(EDITOR_CHANGE_DEBOUNCE_MS + APP_SAVE_DEBOUNCE_MS);
    expect(MAX_UNSAVED_WINDOW_MS).toBeLessThanOrEqual(3000);
  });
});
