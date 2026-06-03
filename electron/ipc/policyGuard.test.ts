import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { requirePolicyFeature } = require('../ipc/policyGuard.cjs');

describe('policyGuard', () => {
  it('returns null when feature is allowed', () => {
    const allow = vi.fn(() => true);
    expect(requirePolicyFeature('sync.lan', allow)).toBeNull();
  });

  it('blocks when feature is denied', () => {
    const deny = vi.fn(() => false);
    const r = requirePolicyFeature('dataExport', deny);
    expect(r?.ok).toBe(false);
    expect(r?.reason).toBe('policy-disabled');
  });
});
