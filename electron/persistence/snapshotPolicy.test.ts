import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PRE_SAVE_SNAPSHOT_MIN_INTERVAL_MS,
  PRE_SAVE_SNAPSHOT_MIN_SHRINK_BYTES,
  decidePreSaveSnapshot,
} = require('./snapshotPolicy.cjs') as {
  PRE_SAVE_SNAPSHOT_MIN_INTERVAL_MS: number;
  PRE_SAVE_SNAPSHOT_MIN_SHRINK_BYTES: number;
  decidePreSaveSnapshot: (input: {
    nowMs: number;
    lastSnapshotAtMs?: number | null;
    previousWorkspace?: unknown;
    nextWorkspace?: unknown;
    previousContentBytes?: number | null;
    nextContentBytes?: number | null;
    snapshotContentBytes?: number | null;
    minIntervalMs?: number;
    minShrinkBytes?: number;
  }) => { snapshot: boolean; reason: string };
};

const NOW = 1_800_000_000_000;

function workspace(notes: number, todoItems = 0, items = 0) {
  return {
    notes: Array.from({ length: notes }, (_, i) => ({ id: `n${i}` })),
    todoItems: Array.from({ length: todoItems }, (_, i) => ({ id: `t${i}` })),
    items: Array.from({ length: items }, (_, i) => ({ id: `i${i}` })),
  };
}

/** What `prepareUserDataWrite` passes: the serialized size of each workspace. */
function bytes(ws: unknown) {
  return Buffer.byteLength(JSON.stringify(ws), 'utf8');
}

/** The real call shape — main always knows both sizes on a steady-state save. */
function decide(input: {
  nowMs: number;
  lastSnapshotAtMs?: number | null;
  previousWorkspace?: unknown;
  nextWorkspace?: unknown;
}) {
  return decidePreSaveSnapshot({
    ...input,
    previousContentBytes: bytes(input.previousWorkspace),
    nextContentBytes: bytes(input.nextWorkspace),
  });
}

describe('snapshotPolicy', () => {
  it('snapshots when nothing has been snapshotted yet', () => {
    expect(
      decide({
        nowMs: NOW,
        lastSnapshotAtMs: null,
        previousWorkspace: workspace(10),
        nextWorkspace: workspace(11),
      }),
    ).toEqual({ snapshot: true, reason: 'no-previous-snapshot' });
  });

  it('throttles routine saves inside the interval', () => {
    expect(
      decide({
        nowMs: NOW,
        lastSnapshotAtMs: NOW - 1000,
        previousWorkspace: workspace(10, 5),
        nextWorkspace: workspace(10, 5),
      }),
    ).toEqual({ snapshot: false, reason: 'throttled' });
  });

  it('snapshots again once the interval has elapsed', () => {
    expect(
      decide({
        nowMs: NOW,
        lastSnapshotAtMs: NOW - PRE_SAVE_SNAPSHOT_MIN_INTERVAL_MS,
        previousWorkspace: workspace(10),
        nextWorkspace: workspace(10),
      }),
    ).toEqual({ snapshot: true, reason: 'interval-elapsed' });
  });

  it('never throttles a save that shrinks a collection', () => {
    for (const [previous, next] of [
      [workspace(10), workspace(9)],
      [workspace(10, 5), workspace(10, 4)],
      [workspace(10, 5, 3), workspace(10, 5, 2)],
    ] as const) {
      expect(
        decide({
          nowMs: NOW,
          lastSnapshotAtMs: NOW - 1,
          previousWorkspace: previous,
          nextWorkspace: next,
        }),
      ).toEqual({ snapshot: true, reason: 'content-shrink' });
    }
  });

  it('treats a swap that keeps the total steady as a shrink', () => {
    // 40 notes deleted, 40 todos added: the total is unchanged but notes were
    // lost, so this must still be backed up.
    expect(
      decide({
        nowMs: NOW,
        lastSnapshotAtMs: NOW - 1,
        previousWorkspace: workspace(40, 0),
        nextWorkspace: workspace(0, 40),
      }),
    ).toEqual({ snapshot: true, reason: 'content-shrink' });
  });

  it('never throttles a loss in a collection that is not monthly-sharded', () => {
    // Teams, people, groups, links and saved diagrams never reach a shard file,
    // but deleting them is exactly as destructive as deleting a note.
    const previous = {
      ...workspace(10, 5),
      teams: [{ id: 'team-1' }, { id: 'team-2' }],
      people: [{ id: 'p1' }],
      noteGroups: [{ id: 'g1' }],
      noteTodoLinks: [{ id: 'l1' }],
      utilitySketchDocuments: [{ id: 's1' }],
    };

    for (const shrunk of [
      { teams: [{ id: 'team-1' }] },
      { people: [] },
      { noteGroups: [] },
      { noteTodoLinks: [] },
      { utilitySketchDocuments: [] },
    ]) {
      expect(
        decide({
          nowMs: NOW,
          lastSnapshotAtMs: NOW - 1,
          previousWorkspace: previous,
          nextWorkspace: { ...previous, ...shrunk },
        }),
      ).toEqual({ snapshot: true, reason: 'content-shrink' });
    }

    // Unchanged, so the throttle still applies — the wider check must not
    // snapshot on every save.
    expect(
      decide({
        nowMs: NOW,
        lastSnapshotAtMs: NOW - 1,
        previousWorkspace: previous,
        nextWorkspace: { ...previous, teams: [...previous.teams, { id: 'team-3' }] },
      }),
    ).toEqual({ snapshot: false, reason: 'throttled' });
  });

  it('snapshots when the previous workspace is unknown', () => {
    // A caller that cannot prove the workspace grew must not be throttled.
    expect(
      decide({
        nowMs: NOW,
        lastSnapshotAtMs: NOW - 1,
        previousWorkspace: null,
        nextWorkspace: workspace(10),
      }),
    ).toEqual({ snapshot: true, reason: 'content-shrink' });
  });

  it('snapshots when the clock jumps backwards', () => {
    expect(
      decide({
        nowMs: NOW,
        lastSnapshotAtMs: NOW + 60_000,
        previousWorkspace: workspace(10),
        nextWorkspace: workspace(10),
      }),
    ).toEqual({ snapshot: true, reason: 'interval-elapsed' });
  });

  it('keeps growth-only saves throttled across a long typing session', () => {
    // A note being edited does not change any collection count, so a burst of
    // saves must produce exactly one snapshot per interval.
    let lastSnapshotAtMs: number | null = NOW;
    let snapshots = 0;
    for (let elapsed = 0; elapsed <= 60 * 60 * 1000; elapsed += 500) {
      const decision = decide({
        nowMs: NOW + elapsed,
        lastSnapshotAtMs,
        previousWorkspace: workspace(200, 200),
        nextWorkspace: workspace(200, 200),
      });
      if (decision.snapshot) {
        snapshots += 1;
        lastSnapshotAtMs = NOW + elapsed;
      }
    }

    // One hour at a 5 minute interval.
    expect(snapshots).toBe(12);
  });

  describe('content destroyed inside entities', () => {
    // Every collection keeps its length; only the bytes inside change. Todo,
    // item and utility-document bodies have no revision history, so a snapshot
    // is the only way back.
    const ws = (body: string) => ({
      notes: [{ id: 'n1', body: 'note body' }],
      todoItems: [{ id: 't1', body }],
      items: [],
    });

    it('snapshots when a body loses more than the threshold', () => {
      const previous = ws('x'.repeat(PRE_SAVE_SNAPSHOT_MIN_SHRINK_BYTES + 100));
      const next = ws('');
      expect(
        decide({
          nowMs: NOW,
          lastSnapshotAtMs: NOW - 1,
          previousWorkspace: previous,
          nextWorkspace: next,
        }),
      ).toEqual({ snapshot: true, reason: 'content-shrink' });
    });

    it('stays throttled while ordinary editing nibbles at the text', () => {
      const previous = ws('x'.repeat(4000));
      const next = ws('x'.repeat(3980));
      expect(
        decide({
          nowMs: NOW,
          lastSnapshotAtMs: NOW - 1,
          previousWorkspace: previous,
          nextWorkspace: next,
        }),
      ).toEqual({ snapshot: false, reason: 'throttled' });
    });

    it('stays throttled while the workspace grows', () => {
      expect(
        decide({
          nowMs: NOW,
          lastSnapshotAtMs: NOW - 1,
          previousWorkspace: ws('x'.repeat(1000)),
          nextWorkspace: ws('x'.repeat(9000)),
        }),
      ).toEqual({ snapshot: false, reason: 'throttled' });
    });

    it('snapshots once a body has been erased across many throttled saves', () => {
      // Holding backspace sheds a few hundred bytes per autosave. Each step is
      // under the per-save threshold, so without a cumulative baseline the
      // whole body vanishes inside one throttle window and nothing is backed
      // up.
      const step = 300;
      const snapshotContentBytes = bytes(ws('x'.repeat(9000)));
      let body = 'x'.repeat(9000);
      let snapshots = 0;

      for (let i = 0; i < 20; i += 1) {
        const previous = ws(body);
        body = body.slice(0, Math.max(0, body.length - step));
        const decision = decidePreSaveSnapshot({
          nowMs: NOW + i * 500,
          lastSnapshotAtMs: NOW,
          previousWorkspace: previous,
          nextWorkspace: ws(body),
          previousContentBytes: bytes(previous),
          nextContentBytes: bytes(ws(body)),
          snapshotContentBytes,
        });
        if (decision.snapshot) {
          expect(decision.reason).toBe('cumulative-shrink');
          snapshots += 1;
          break;
        }
      }

      expect(snapshots).toBe(1);
      // And it fires while most of the body is still recoverable, not after
      // the last character is gone.
      expect(body.length).toBeGreaterThan(6000);
    });

    it('ignores a cumulative baseline it was never given', () => {
      // A lifecycle snapshot (launch, login, restore) records no size. That
      // snapshot holds the state still being edited, so nothing can have been
      // lost since it and the throttle must still apply.
      expect(
        decidePreSaveSnapshot({
          nowMs: NOW,
          lastSnapshotAtMs: NOW - 1,
          previousWorkspace: ws('x'.repeat(4000)),
          nextWorkspace: ws('x'.repeat(3980)),
          previousContentBytes: bytes(ws('x'.repeat(4000))),
          nextContentBytes: bytes(ws('x'.repeat(3980))),
          snapshotContentBytes: null,
        }),
      ).toEqual({ snapshot: false, reason: 'throttled' });
    });

    it('does not re-snapshot content that grew back after a dip', () => {
      const snapshotContentBytes = bytes(ws('x'.repeat(9000)));
      expect(
        decidePreSaveSnapshot({
          nowMs: NOW,
          lastSnapshotAtMs: NOW - 1,
          previousWorkspace: ws('x'.repeat(8900)),
          nextWorkspace: ws('x'.repeat(9500)),
          previousContentBytes: bytes(ws('x'.repeat(8900))),
          nextContentBytes: bytes(ws('x'.repeat(9500))),
          snapshotContentBytes,
        }),
      ).toEqual({ snapshot: false, reason: 'throttled' });
    });

    it('snapshots when either size is unknown', () => {
      // The previous size is only known when this process wrote and verified
      // the current files. Every other case — first save, post-failure,
      // post-restore — is when a backup is worth most.
      const unchanged = workspace(10, 5);
      for (const sizes of [
        { previousContentBytes: null, nextContentBytes: 1000 },
        { previousContentBytes: 1000, nextContentBytes: null },
        { previousContentBytes: Number.NaN, nextContentBytes: 1000 },
      ]) {
        expect(
          decidePreSaveSnapshot({
            nowMs: NOW,
            lastSnapshotAtMs: NOW - 1,
            previousWorkspace: unchanged,
            nextWorkspace: unchanged,
            ...sizes,
          }),
        ).toEqual({ snapshot: true, reason: 'content-shrink' });
      }
    });
  });
});
