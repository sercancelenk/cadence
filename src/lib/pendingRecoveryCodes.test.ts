import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPendingRecoveryCodes,
  readPendingRecoveryCodes,
  stashPendingRecoveryCodes,
} from './pendingRecoveryCodes';

describe('pendingRecoveryCodes', () => {
  afterEach(() => {
    clearPendingRecoveryCodes();
  });

  it('round-trips codes through in-memory storage', () => {
    stashPendingRecoveryCodes(['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH']);
    expect(readPendingRecoveryCodes()).toEqual(['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH']);
    clearPendingRecoveryCodes();
    expect(readPendingRecoveryCodes()).toBeNull();
  });

  it('returns a defensive copy that cannot mutate the stashed codes', () => {
    stashPendingRecoveryCodes(['AAAA-BBBB-CCCC-DDDD']);
    const first = readPendingRecoveryCodes();
    first?.push('INJECTED');
    expect(readPendingRecoveryCodes()).toEqual(['AAAA-BBBB-CCCC-DDDD']);
  });

  it('rejects malformed inputs', () => {
    stashPendingRecoveryCodes([] as string[]);
    expect(readPendingRecoveryCodes()).toBeNull();
    stashPendingRecoveryCodes(['ok', 42 as unknown as string]);
    expect(readPendingRecoveryCodes()).toBeNull();
  });

  it('never persists codes to web storage', () => {
    stashPendingRecoveryCodes(['AAAA-BBBB-CCCC-DDDD']);
    const haystack = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(haystack).not.toContain('AAAA-BBBB-CCCC-DDDD');
  });
});
