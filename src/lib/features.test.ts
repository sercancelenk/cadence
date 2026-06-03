/**
 * Unit tests for the enterprise / shared-device feature flag layer.
 *
 * Why these tests are load-bearing:
 *   - `parsePolicy` is the boundary between an admin-supplied JSON file and
 *     the renderer. A regression that loosens validation could quietly
 *     expose a "disabled" feature, which is exactly the kind of silent
 *     failure mode that destroys trust in an enterprise deployment.
 *   - `resolveFeatures` encodes the precedence rules that the
 *     ENTERPRISE.md docs promise. If the policy stops winning over the
 *     user preset, every previously-locked-down device suddenly grows
 *     visible Sync/AI cards on the next launch.
 *
 * The tests deliberately exercise the public API (`parsePolicy`,
 * `resolveFeatures`, `PRESETS`) rather than the React provider, because:
 *   - Provider tests would require mocking `window.cadence.policyGet` and
 *     are covered in the integration test suite separately.
 *   - The core invariants live in pure functions; pinning them here makes
 *     refactors safe without dragging in jsdom render machinery.
 */

import { describe, expect, it } from 'vitest';
import { PRESETS, parsePolicy, resolveFeatures, type PresetName } from './features';

describe('PRESETS shape', () => {
  it('exposes the three named presets with all flags set', () => {
    const names: PresetName[] = ['personal', 'work-standard', 'work-strict'];
    for (const n of names) {
      const p = PRESETS[n];
      expect(typeof p.sync.lan).toBe('boolean');
      expect(typeof p.sync.cloud).toBe('boolean');
      expect(typeof p.ai).toBe('boolean');
      expect(typeof p.dataExport).toBe('boolean');
      expect(typeof p.updateCheck).toBe('boolean');
    }
  });

  it("personal has every feature on", () => {
    expect(PRESETS.personal).toEqual({
      sync: { lan: true, cloud: true },
      ai: true,
      dataExport: true,
      updateCheck: true,
    });
  });

  it("work-standard disables sync only", () => {
    expect(PRESETS['work-standard']).toEqual({
      sync: { lan: false, cloud: false },
      ai: true,
      dataExport: true,
      updateCheck: true,
    });
  });

  it("work-strict locks down everything except updates", () => {
    expect(PRESETS['work-strict']).toEqual({
      sync: { lan: false, cloud: false },
      ai: false,
      dataExport: false,
      updateCheck: true,
    });
  });
});

describe('parsePolicy validation', () => {
  it('returns null for non-object input', () => {
    expect(parsePolicy(null)).toBeNull();
    expect(parsePolicy(undefined)).toBeNull();
    expect(parsePolicy('not-an-object')).toBeNull();
    expect(parsePolicy(123)).toBeNull();
    expect(parsePolicy([])).toBeNull();
  });

  it('requires a non-empty path field', () => {
    expect(parsePolicy({ preset: 'work-strict' })).toBeNull();
    expect(parsePolicy({ path: '', preset: 'work-strict' })).toBeNull();
  });

  it('requires either a preset OR a features block', () => {
    // path-only is meaningless and dropped (no behaviour to apply).
    expect(parsePolicy({ path: '/etc/cadence/policy.json' })).toBeNull();
    // empty features block also rejected.
    expect(parsePolicy({ path: '/etc/cadence/policy.json', features: {} })).toBeNull();
  });

  it('accepts a preset-only policy', () => {
    const p = parsePolicy({ path: '/x', preset: 'work-standard' });
    expect(p).toEqual({ path: '/x', preset: 'work-standard' });
  });

  it('rejects unknown preset names', () => {
    const p = parsePolicy({ path: '/x', preset: 'work-loose' });
    // unknown preset is dropped; with no features block left, the whole
    // policy is invalid and falls back to null (= no policy in effect).
    expect(p).toBeNull();
  });

  it('passes through managedBy verbatim', () => {
    const p = parsePolicy({ path: '/x', preset: 'work-strict', managedBy: 'Acme IT' });
    expect(p?.managedBy).toBe('Acme IT');
  });

  it('drops non-string managedBy', () => {
    const p = parsePolicy({ path: '/x', preset: 'work-strict', managedBy: 42 });
    expect(p?.managedBy).toBeUndefined();
  });

  it('keeps only boolean feature flags (silently drops invalid types)', () => {
    const p = parsePolicy({
      path: '/x',
      features: {
        sync: { lan: false, cloud: 'no' },
        ai: true,
        dataExport: 0,
        updateCheck: false,
      },
    });
    expect(p).toEqual({
      path: '/x',
      features: {
        sync: { lan: false },
        ai: true,
        updateCheck: false,
      },
    });
  });

  it('accepts features without sync sub-block', () => {
    const p = parsePolicy({ path: '/x', features: { ai: false } });
    expect(p).toEqual({ path: '/x', features: { ai: false } });
  });

  it('accepts sync.cloud-only granular overrides', () => {
    const p = parsePolicy({ path: '/x', features: { sync: { cloud: true } } });
    expect(p).toEqual({ path: '/x', features: { sync: { cloud: true } } });
  });

  it('drops sync block when sync is not an object', () => {
    const p = parsePolicy({ path: '/x', features: { sync: 'nope', ai: true } });
    expect(p).toEqual({ path: '/x', features: { ai: true } });
  });
});

describe('resolveFeatures precedence', () => {
  it('returns personal preset when no policy and no user preset', () => {
    const r = resolveFeatures(null, null);
    expect(r.features).toEqual(PRESETS.personal);
    expect(r.managed).toBe(false);
    expect(r.source).toEqual({ kind: 'default' });
  });

  it("returns the user preset when no policy is in effect", () => {
    const r = resolveFeatures(null, 'work-standard');
    expect(r.features).toEqual(PRESETS['work-standard']);
    expect(r.managed).toBe(false);
    expect(r.source).toEqual({ kind: 'user-preset', preset: 'work-standard' });
  });

  it("policy wins over the user preset (the locked-down invariant)", () => {
    const r = resolveFeatures(
      { path: '/x', preset: 'work-strict', managedBy: 'Acme IT' },
      'personal',
    );
    expect(r.features).toEqual(PRESETS['work-strict']);
    expect(r.managed).toBe(true);
    expect(r.source).toEqual({
      kind: 'policy',
      preset: 'work-strict',
      path: '/x',
      managedBy: 'Acme IT',
    });
  });

  it("policy-only features merge over work-standard by default", () => {
    // Admin set features but no preset → must NOT default to personal.
    // (Defaulting to personal would silently re-enable cloud sync.)
    const r = resolveFeatures(
      { path: '/x', features: { ai: false } },
      null,
    );
    // Base = work-standard, with ai forced off.
    expect(r.features).toEqual({
      ...PRESETS['work-standard'],
      ai: false,
    });
    expect(r.managed).toBe(true);
  });

  it('policy granular features override the named preset base', () => {
    // "work-strict but keep AI" combination — common request from teams
    // that have an internal Azure OpenAI deployment.
    const r = resolveFeatures(
      { path: '/x', preset: 'work-strict', features: { ai: true } },
      null,
    );
    expect(r.features).toEqual({
      ...PRESETS['work-strict'],
      ai: true,
    });
  });

  it('omitting individual flags inherits from the preset (not from personal)', () => {
    // Regression guard: a stray `?? PRESETS.personal.*` somewhere in the
    // merge would silently re-enable Cloud sync on a `work-strict` device.
    const r = resolveFeatures(
      { path: '/x', preset: 'work-strict', features: { ai: true } },
      null,
    );
    expect(r.features.sync.lan).toBe(false);
    expect(r.features.sync.cloud).toBe(false);
    expect(r.features.dataExport).toBe(false);
  });

  it('granular sync.lan/cloud overrides are independent', () => {
    const r = resolveFeatures(
      {
        path: '/x',
        preset: 'work-standard',
        features: { sync: { lan: true } }, // re-enable LAN only
      },
      null,
    );
    expect(r.features.sync.lan).toBe(true);
    expect(r.features.sync.cloud).toBe(false);
  });

  it('source includes the policy path so the UI can show it', () => {
    const r = resolveFeatures(
      { path: '/Library/Managed Preferences/cadence.policy.json', preset: 'work-strict' },
      null,
    );
    expect(r.source).toMatchObject({ kind: 'policy', path: '/Library/Managed Preferences/cadence.policy.json' });
  });
});

describe('resolveFeatures — enterprise build flavor', () => {
  it('locks down to work-strict even with no policy or user preset', () => {
    const r = resolveFeatures(null, null, { enterpriseBuild: true });
    expect(r.features).toEqual(PRESETS['work-strict']);
    expect(r.managed).toBe(true);
    expect(r.source).toEqual({
      kind: 'distribution',
      distribution: 'enterprise',
      policyHint: undefined,
    });
  });

  it('ignores any user preset (build flavor cannot be unlocked from UI)', () => {
    const r = resolveFeatures(null, 'personal', { enterpriseBuild: true });
    // CRITICAL: never re-enable cloud sync just because the user clicked
    // the "Personal" card in some old build's onboarding tour. The user
    // preset is data, the build flavor is policy — policy wins.
    expect(r.features).toEqual(PRESETS['work-strict']);
    expect(r.managed).toBe(true);
  });

  it('lets a sidecar policy.json LOOSEN a single flag (e.g. internal AI)', () => {
    const r = resolveFeatures(
      { path: '/Library/Application Support/Cadence/policy.json', features: { ai: true }, managedBy: 'Acme IT' },
      null,
      { enterpriseBuild: true },
    );
    // Loosened: AI is now enabled. Everything else stays locked.
    expect(r.features).toEqual({
      ...PRESETS['work-strict'],
      ai: true,
    });
    expect(r.managed).toBe(true);
    expect(r.source).toEqual({
      kind: 'distribution',
      distribution: 'enterprise',
      policyHint: {
        path: '/Library/Application Support/Cadence/policy.json',
        managedBy: 'Acme IT',
      },
    });
  });

  it('a sidecar policy can ALSO further tighten flags (sanity check)', () => {
    const r = resolveFeatures(
      { path: '/etc/cadence/policy.json', features: { updateCheck: false } },
      null,
      { enterpriseBuild: true },
    );
    expect(r.features.updateCheck).toBe(false);
    // The other strict-locked flags must stay off.
    expect(r.features.sync).toEqual({ lan: false, cloud: false });
    expect(r.features.ai).toBe(false);
    expect(r.features.dataExport).toBe(false);
  });

  it('enterprise merge uses policy preset cloud override independently of lan', () => {
    const r = resolveFeatures(
      {
        path: '/x',
        features: { sync: { cloud: true } },
      },
      'personal',
      { enterpriseBuild: true },
    );
    expect(r.features).toEqual({
      sync: { lan: false, cloud: true },
      ai: false,
      dataExport: false,
      updateCheck: true,
    });
  });

  it('policy with preset personal still resolves under non-enterprise builds', () => {
    const r = resolveFeatures({ path: '/x', preset: 'personal' }, 'work-strict');
    expect(r.features).toEqual(PRESETS.personal);
    expect(r.managed).toBe(true);
  });

  it('sidecar preset value is ignored (base is always work-strict in enterprise)', () => {
    // Defence-in-depth: even if someone deploys a "preset: personal" policy
    // to an enterprise build, we don't suddenly open up sync/AI/export.
    // The build flavor is the floor.
    const r = resolveFeatures(
      { path: '/x', preset: 'personal' },
      null,
      { enterpriseBuild: true },
    );
    expect(r.features).toEqual(PRESETS['work-strict']);
  });
});
