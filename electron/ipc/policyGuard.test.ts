import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { requirePolicyFeature, requireDataClassPolicy } = require('../ipc/policyGuard.cjs');

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

describe('requireDataClassPolicy', () => {
  it('lets content through without asking for aiPeople', () => {
    const allow = vi.fn(() => false);
    expect(requireDataClassPolicy('content', allow)).toBeNull();
    expect(allow).not.toHaveBeenCalled();
  });
  it('rejects a missing or unknown class instead of treating it as ordinary content', () => {
    for (const bad of [undefined, null, '', 'People', 'content ', 'other', 42, {}]) {
      const r = requireDataClassPolicy(bad, () => true);
      expect(r, String(bad)).toMatchObject({ ok: false, reason: 'invalid-request' });
      expect(r.error).toMatch(/data class/i);
    }
  });
  it('blocks people data when aiPeople is off, with a people-specific message', () => {
    const r = requireDataClassPolicy('people', (f: string) => f !== 'aiPeople');
    expect(r).toMatchObject({ ok: false, reason: 'policy-disabled' });
    expect(r.error).toMatch(/people|1:1|feedback/i);
  });
  it('allows people data when aiPeople is on', () => {
    expect(requireDataClassPolicy('people', () => true)).toBeNull();
  });
});
