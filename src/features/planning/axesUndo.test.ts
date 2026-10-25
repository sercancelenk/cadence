import { describe, expect, it } from 'vitest';
import { axesRestorePatches } from './axesUndo';

type Axes = { planImportant?: boolean; planUrgent?: boolean };
const item = (id: string, axes: Axes) => ({ id, ...axes });

describe('axesRestorePatches', () => {
  const applied = [
    { id: 'a', important: true, urgent: false },
    { id: 'b', important: false, urgent: true },
  ];
  const previous = { a: { planImportant: undefined, planUrgent: undefined }, b: { planImportant: true, planUrgent: true } };

  it('puts each task back to what it had before, when it still holds what was applied', () => {
    const r = axesRestorePatches(
      [item('a', { planImportant: true, planUrgent: false }), item('b', { planImportant: false, planUrgent: true })],
      applied,
      previous,
    );
    expect(r.restore).toEqual([
      { id: 'a', patch: { planImportant: undefined, planUrgent: undefined } },
      { id: 'b', patch: { planImportant: true, planUrgent: true } },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('leaves alone a task the user has since moved, and one that is gone', () => {
    const r = axesRestorePatches([item('a', { planImportant: false, planUrgent: false })], applied, previous);
    expect(r.restore).toEqual([]);
    expect(r.skipped).toBe(2);
  });
});
