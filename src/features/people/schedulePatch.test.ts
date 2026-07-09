import { describe, expect, it } from 'vitest';
import { schedulePatchToItemPatch } from './schedulePatch';

describe('schedulePatchToItemPatch', () => {
  it('maps set values through', () => {
    expect(
      schedulePatchToItemPatch({
        dueAt: '2030-01-01T10:00:00.000Z',
        remindAt: '2030-01-01T09:00:00.000Z',
        remindRepeat: 'weekly',
      }),
    ).toEqual({
      dueAt: '2030-01-01T10:00:00.000Z',
      remindAt: '2030-01-01T09:00:00.000Z',
      remindRepeat: 'weekly',
    });
  });

  it('maps null clears to undefined', () => {
    expect(schedulePatchToItemPatch({ dueAt: null, remindAt: null, remindRepeat: null })).toEqual({
      dueAt: undefined,
      remindAt: undefined,
      remindRepeat: undefined,
    });
  });

  it('omits untouched keys', () => {
    expect(schedulePatchToItemPatch({ dueAt: '2030-01-01T10:00:00.000Z' })).toEqual({
      dueAt: '2030-01-01T10:00:00.000Z',
    });
  });
});
