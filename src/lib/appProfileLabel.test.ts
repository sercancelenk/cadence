import { describe, expect, it } from 'vitest';
import { PRESETS } from './features';
import { resolveAppProfileLabel } from './appProfileLabel';

describe('resolveAppProfileLabel', () => {
  it('labels personal preset', () => {
    const r = resolveAppProfileLabel(PRESETS.personal, false);
    expect(r.label).toBe('Personal');
    expect(r.managed).toBe(false);
  });

  it('labels managed policy with base preset', () => {
    const r = resolveAppProfileLabel(PRESETS['work-strict'], true, {
      kind: 'policy',
      preset: 'work-strict',
      path: '/etc/cadence/policy.json',
    });
    expect(r.label).toBe('Managed · Work — Strict');
    expect(r.badgeLabel).toBe('Managed by organization');
  });

  it('labels managed mode without a named preset as Managed', () => {
    const custom = { ...PRESETS.personal, ai: false };
    const r = resolveAppProfileLabel(custom, true);
    expect(r.label).toBe('Managed');
    expect(r.preset).toBe('custom');
  });

  it('labels user-preset source for unmanaged custom features', () => {
    const custom = { ...PRESETS.personal, dataExport: false };
    const r = resolveAppProfileLabel(custom, false, {
      kind: 'user-preset',
      preset: 'work-standard',
    });
    expect(r.label).toBe('Custom');
    expect(r.preset).toBe('custom');
  });

  it('labels work-standard via user-preset source when features match personal', () => {
    // personal and work-standard share the same flags now that sync is off;
    // the explicit user-preset source keeps the chosen label.
    const r = resolveAppProfileLabel(PRESETS['work-standard'], false, {
      kind: 'user-preset',
      preset: 'work-standard',
    });
    expect(r.label).toBe('Work — Standard');
    expect(r.badgeLabel).toBe('Work — Standard');
    expect(r.preset).toBe('work-standard');
  });

  it('labels managed deployments using a user-preset source title', () => {
    const r = resolveAppProfileLabel(PRESETS.personal, true, {
      kind: 'user-preset',
      preset: 'work-standard',
    });
    expect(r.label).toBe('Managed · Work — Standard');
  });
});
