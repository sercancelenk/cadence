import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Measures the workspace save path at several workspace sizes, for both the
 * pre-optimisation pipeline and the current one.
 *
 * The assertions guard correctness (every entity survives the round trip, and
 * the optimised path is not slower); the printed table is the artefact a
 * performance change is judged against. Set `CADENCE_BENCH=1` to include the
 * 5.000-entity case, which is too slow for a normal test run.
 */

const require = createRequire(import.meta.url);
const { createSyntheticWorkspace } = require('./syntheticWorkspace.cjs') as {
  createSyntheticWorkspace: (options?: {
    notes?: number;
    todoItems?: number;
    paragraphsPerNote?: number;
    seed?: number;
  }) => Record<string, unknown>;
};

type SaveCycleResult = {
  bytes: number;
  shardCount: number;
  shardsWritten: number;
  verified: boolean;
  snapshotsScanned: number;
  committed: object;
};

const { runSaveCycle } = require('./saveBenchHarness.cjs') as {
  runSaveCycle: (options: {
    dir: string;
    key: Buffer;
    payload: Record<string, unknown>;
    mode?: 'legacy' | 'optimized';
    committed?: object | null;
    timer?: { stage: (name: string) => void };
  }) => SaveCycleResult;
};

const {
  setSaveTimingsEnabled,
  createSaveTimer,
  summarizeSaveTimings,
  clearSaveTimings,
} = require('./saveTimings.cjs') as {
  setSaveTimingsEnabled: (next: boolean) => boolean;
  createSaveTimer: (label: string) => {
    stage: (name: string) => void;
    done: (meta?: Record<string, unknown>) => unknown;
  };
  summarizeSaveTimings: () => {
    sampleCount: number;
    totalMs: { p50: number; p95: number; max: number };
    stages: { stage: string; p50: number; p95: number; max: number }[];
  };
  clearSaveTimings: () => void;
};

const SIZES = process.env.CADENCE_BENCH === '1' ? [100, 1000, 5000] : [100, 1000];
const SAVES_PER_SIZE = 5;

const key = crypto.scryptSync('bench', Buffer.from('bench-salt'), 32);

/** Collected across sizes so the report prints as one table at the end. */
const report: string[] = [];

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-bench-'));
  setSaveTimingsEnabled(true);
  clearSaveTimings();
});

afterEach(() => {
  setSaveTimingsEnabled(false);
  fs.rmSync(dir, { recursive: true, force: true });
});

afterAll(() => {
  // Written straight to stdout: this is the deliverable of the benchmark, and
  // the default reporter hides console output from passing tests.
  if (report.length) process.stdout.write(`\nSave path timings\n${report.join('\n')}\n\n`);
});

/**
 * Save the same workspace repeatedly, the way a typing session does: the first
 * save establishes the files, the rest only touch the note being edited.
 */
function measure(mode: 'legacy' | 'optimized', payload: Record<string, unknown>, saves: number) {
  let committed: object | null = null;
  let last: SaveCycleResult | null = null;

  // Warm-up save, not measured: it has no prior state to compare against.
  last = runSaveCycle({ dir, key, payload, mode });
  committed = last.committed;
  clearSaveTimings();

  for (let i = 0; i < saves; i += 1) {
    const timer = createSaveTimer(mode);
    last = runSaveCycle({ dir, key, payload, mode, committed, timer });
    timer.done();
    committed = last.committed;
  }

  return { summary: summarizeSaveTimings(), last: last as SaveCycleResult };
}

function formatStages(summary: ReturnType<typeof summarizeSaveTimings>) {
  return summary.stages.map((s) => `${s.stage} ${s.p50.toFixed(1)}ms`).join(', ');
}

describe('save path benchmark', () => {
  for (const size of SIZES) {
    it(`saves ${size} notes + ${size} todos without losing an entity`, { timeout: 60_000 }, () => {
      const payload = createSyntheticWorkspace({ notes: size, todoItems: size });

      const legacy = measure('legacy', payload, SAVES_PER_SIZE);
      fs.rmSync(dir, { recursive: true, force: true });
      const optimized = measure('optimized', payload, SAVES_PER_SIZE);

      // The point of the whole exercise: nothing may be dropped by sharding,
      // encryption, or the atomic write — in either pipeline.
      expect(legacy.last.verified).toBe(true);
      expect(optimized.last.verified).toBe(true);
      expect(optimized.last.shardCount).toBeGreaterThan(1);

      // An unchanged workspace must not rewrite a single shard.
      expect(legacy.last.shardsWritten).toBe(legacy.last.shardCount);
      expect(optimized.last.shardsWritten).toBe(0);

      // Wall-clock comparison only under `CADENCE_BENCH=1`. On a loaded CI
      // machine the two pipelines can trade places for reasons that have
      // nothing to do with this code, and a flaky red build teaches the team
      // to ignore it. The work-avoided assertions above hold either way.
      if (process.env.CADENCE_BENCH === '1') {
        expect(optimized.summary.totalMs.p50).toBeLessThan(legacy.summary.totalMs.p50);
      }

      const mb = (optimized.last.bytes / (1024 * 1024)).toFixed(2);
      const saved = 100 - (optimized.summary.totalMs.p50 / legacy.summary.totalMs.p50) * 100;
      report.push(
        `  ${String(size).padStart(5)} notes+todos (${mb} MB, ${optimized.last.shardCount} shards) — ${saved.toFixed(0)}% faster`,
      );
      report.push(`      before  ${legacy.summary.totalMs.p50.toFixed(1)}ms: ${formatStages(legacy.summary)}`);
      report.push(
        `      after   ${optimized.summary.totalMs.p50.toFixed(1)}ms: ${formatStages(optimized.summary)}`,
      );
    });
  }

  it('rewrites only the shard whose month actually changed', () => {
    const payload = createSyntheticWorkspace({ notes: 300, todoItems: 300 }) as {
      notes: { id: string; updatedAt: string; bodyPlainText: string }[];
    };

    const first = runSaveCycle({ dir, key, payload, mode: 'optimized' });
    expect(first.shardsWritten).toBe(first.shardCount);

    // Edit one note, the way a keystroke does.
    payload.notes[0].bodyPlainText = 'edited while typing';

    const second = runSaveCycle({
      dir,
      key,
      payload,
      mode: 'optimized',
      committed: first.committed,
    });

    expect(second.verified).toBe(true);
    expect(second.shardsWritten).toBe(1);
    expect(second.shardCount).toBeGreaterThan(1);
  });

  it('falls back to rewriting everything when a shard is touched behind our back', () => {
    const payload = createSyntheticWorkspace({ notes: 200, todoItems: 200 });
    const first = runSaveCycle({ dir, key, payload, mode: 'optimized' });

    // Simulate cloud sync or a second instance replacing a shard.
    const shardName = fs.readdirSync(dir).find((n) => /^workspace-\d{4}-\d{2}\.json$/.test(n));
    expect(shardName).toBeDefined();
    fs.writeFileSync(path.join(dir, shardName as string), 'corrupted by another writer');

    const second = runSaveCycle({
      dir,
      key,
      payload,
      mode: 'optimized',
      committed: first.committed,
    });

    // The fingerprint no longer matches, so nothing is skipped and the damaged
    // shard is rewritten from the payload.
    expect(second.shardsWritten).toBe(second.shardCount);
    expect(second.verified).toBe(true);
  });
});
