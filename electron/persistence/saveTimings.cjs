/**
 * Opt-in stage timings for the workspace save path.
 *
 * The save path runs on the Electron main process, which is also the Chromium
 * browser process that routes input events to the renderer. Slow work there is
 * felt as typing lag, so every optimisation needs per-stage numbers before and
 * after. Nothing here changes what is written to disk.
 *
 * Disabled by default: `createSaveTimer` hands back a shared no-op recorder so
 * the save path pays a single boolean read when diagnostics are off.
 */

/** Recent samples kept in memory for the diagnostics panel. */
const RING_CAPACITY = 50;

/** @typedef {{ stage: string; ms: number }} SaveTimingStage */
/**
 * @typedef {{
 *   label: string;
 *   at: string;
 *   totalMs: number;
 *   stages: SaveTimingStage[];
 *   meta?: Record<string, unknown>;
 * }} SaveTimingSample
 */

let enabled = false;

/** @type {SaveTimingSample[]} */
let samples = [];

const NOOP_TIMER = {
  stage() {},
  done() {
    return null;
  },
};

function round2(ms) {
  return Math.round(ms * 100) / 100;
}

/**
 * Only an actual `true` turns recording on. The value arrives over IPC, and
 * coercing means a mistaken `"false"` — a plausible thing for a caller to send —
 * would start recording when it was asked to stop.
 *
 * @param {unknown} next
 * @returns {boolean} the resolved enabled state
 */
function setSaveTimingsEnabled(next) {
  const value = next === true;
  if (value !== enabled) {
    enabled = value;
    // Turning diagnostics off discards the buffer: stale numbers from a
    // previous build are worse than no numbers.
    if (!enabled) samples = [];
  }
  return enabled;
}

function isSaveTimingsEnabled() {
  return enabled;
}

/**
 * Start recording a save. Call `stage(name)` after each phase and `done(meta)`
 * once, at the end. Stage durations are the gap since the previous call, so the
 * stages of one sample always add up to `totalMs`.
 *
 * Neither method can throw. They are called from the middle of the save path —
 * including after the commit, when the user's data is already durably on disk
 * — and `finishDataSave` calls `done` before it has returned anything to the
 * renderer. An exception escaping from here would turn a save that succeeded
 * into one the renderer is told failed, which costs the user a resync and an
 * alarming error for nothing. Measurement never decides whether a save worked.
 *
 * @param {string} label
 * @returns {{ stage: (name: string) => void; done: (meta?: Record<string, unknown>) => SaveTimingSample | null }}
 */
function createSaveTimer(label) {
  if (!enabled) return NOOP_TIMER;

  const startedAt = performance.now();
  let previous = startedAt;
  /** @type {SaveTimingStage[]} */
  const stages = [];

  return {
    stage(name) {
      try {
        const now = performance.now();
        stages.push({ stage: name, ms: round2(now - previous) });
        previous = now;
      } catch (err) {
        console.warn('[cadence] save timing stage failed (ignored)', err);
      }
    },
    done(meta) {
      try {
        /** @type {SaveTimingSample} */
        const sample = {
          label,
          at: new Date().toISOString(),
          totalMs: round2(performance.now() - startedAt),
          stages,
        };
        if (meta) sample.meta = meta;
        samples.push(sample);
        if (samples.length > RING_CAPACITY) samples.splice(0, samples.length - RING_CAPACITY);
        return sample;
      } catch (err) {
        console.warn('[cadence] save timing record failed (ignored)', err);
        return null;
      }
    },
  };
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/**
 * Per-stage p50/p95/max across the buffered samples. This is what the
 * diagnostics panel shows and what a before/after comparison is read from.
 *
 * @returns {{
 *   enabled: boolean;
 *   sampleCount: number;
 *   totalMs: { p50: number; p95: number; max: number };
 *   stages: { stage: string; p50: number; p95: number; max: number }[];
 * }}
 */
function summarizeSaveTimings() {
  const totals = samples.map((s) => s.totalMs).sort((a, b) => a - b);

  /** @type {Map<string, number[]>} */
  const byStage = new Map();
  for (const sample of samples) {
    for (const { stage, ms } of sample.stages) {
      const bucket = byStage.get(stage);
      if (bucket) bucket.push(ms);
      else byStage.set(stage, [ms]);
    }
  }

  const stages = Array.from(byStage.entries()).map(([stage, values]) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return {
      stage,
      p50: round2(percentile(sorted, 0.5)),
      p95: round2(percentile(sorted, 0.95)),
      max: round2(sorted[sorted.length - 1] ?? 0),
    };
  });
  // Slowest first — the panel should lead with the stage worth fixing.
  stages.sort((a, b) => b.p95 - a.p95);

  return {
    enabled,
    sampleCount: samples.length,
    totalMs: {
      p50: round2(percentile(totals, 0.5)),
      p95: round2(percentile(totals, 0.95)),
      max: round2(totals[totals.length - 1] ?? 0),
    },
    stages,
  };
}

/** @returns {SaveTimingSample[]} newest last */
function readSaveTimings() {
  return samples.slice();
}

function clearSaveTimings() {
  samples = [];
}

module.exports = {
  RING_CAPACITY,
  setSaveTimingsEnabled,
  isSaveTimingsEnabled,
  createSaveTimer,
  summarizeSaveTimings,
  readSaveTimings,
  clearSaveTimings,
};
