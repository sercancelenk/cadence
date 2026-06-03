// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  buildReminderToggleOffPatch,
  buildReminderToggleOnPatch,
  buildScheduleClearPatch,
  buildScheduleDateTimePatch,
} from './schedulePopoverPatch';
import { schedulePatchToTodoPatch } from '../../features/todos/todoBody';

describe('schedulePopoverPatch — deadline vs reminder isolation', () => {
  const iso = '2030-06-15T14:00:00.000Z';

  it('picking a datetime with reminder OFF sets dueAt only (regression: no ghost remindAt)', () => {
    const patch = buildScheduleDateTimePatch(iso, false);
    expect(patch).toEqual({ dueAt: iso });
    expect(patch).not.toHaveProperty('remindAt');

    const todoPatch = schedulePatchToTodoPatch(patch);
    expect(todoPatch.dueAt).toBe(iso);
    expect(todoPatch.remindAt).toBeUndefined();
  });

  it('picking a datetime with reminder ON mirrors due and remind', () => {
    const patch = buildScheduleDateTimePatch(iso, true);
    expect(patch).toEqual({ dueAt: iso, remindAt: iso });
  });

  it('turning reminder ON when due already exists sets remindAt only', () => {
    const patch = buildReminderToggleOnPatch(iso, true);
    expect(patch).toEqual({ remindAt: iso, dueAt: undefined });
    const todoPatch = schedulePatchToTodoPatch(patch);
    expect(todoPatch.remindAt).toBe(iso);
    expect(todoPatch.dueAt).toBeUndefined();
  });

  it('turning reminder ON without due sets both fields', () => {
    const patch = buildReminderToggleOnPatch(iso, false);
    expect(patch).toEqual({ remindAt: iso, dueAt: iso });
  });

  it('turning reminder OFF clears remind fields', () => {
    expect(buildReminderToggleOffPatch()).toEqual({ remindAt: null, remindRepeat: null });
  });

  it('clear all removes schedule and reminder', () => {
    expect(buildScheduleClearPatch()).toEqual({
      dueAt: null,
      remindAt: null,
      remindRepeat: null,
    });
  });
});
