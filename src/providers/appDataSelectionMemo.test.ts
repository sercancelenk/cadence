import { describe, expect, it } from 'vitest';
import type { AppData } from '../core/model';
import { createAppDataSelectionMemo } from './appDataSelectionMemo';

function makeSnap(over: Partial<AppData> = {}): AppData {
  return { teams: [], people: [], items: [], ...over } as unknown as AppData;
}

describe('createAppDataSelectionMemo', () => {
  it('returns a STABLE reference for the same snapshot even when the selector builds a new object each call (regression: infinite render loop)', () => {
    const snap = makeSnap();
    // Object-returning selector with the default Object.is equality — the exact
    // shape that previously made getSnapshot return a new ref every call.
    const getSelection = createAppDataSelectionMemo(
      (d) => ({ teams: d.teams, people: d.people }),
      Object.is,
    );

    const first = getSelection(snap);
    const second = getSelection(snap);
    const third = getSelection(snap);

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('recomputes when the snapshot reference changes', () => {
    const a = makeSnap();
    const b = makeSnap();
    const getSelection = createAppDataSelectionMemo((d) => ({ teams: d.teams }), Object.is);

    const fromA = getSelection(a);
    const fromB = getSelection(b);

    expect(fromB).not.toBe(fromA);
  });

  it('keeps the previous reference across snapshots when isEqual reports equivalence (no churn)', () => {
    const teams: AppData['teams'] = [];
    const a = makeSnap({ teams });
    const b = makeSnap({ teams }); // different snapshot ref, same teams ref
    const getSelection = createAppDataSelectionMemo(
      (d) => ({ teams: d.teams }),
      (x, y) => x.teams === y.teams,
    );

    const fromA = getSelection(a);
    const fromB = getSelection(b);

    expect(fromB).toBe(fromA);
  });

  it('produces a new reference when isEqual reports a real change', () => {
    const a = makeSnap({ teams: [] });
    const b = makeSnap({ teams: [{ id: 't1' } as AppData['teams'][number]] });
    const getSelection = createAppDataSelectionMemo(
      (d) => ({ teams: d.teams }),
      (x, y) => x.teams === y.teams,
    );

    const fromA = getSelection(a);
    const fromB = getSelection(b);

    expect(fromB).not.toBe(fromA);
    expect(fromB.teams).toBe(b.teams);
  });
});
