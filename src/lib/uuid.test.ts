import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuid } from './uuid';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns RFC 4122 v4 format via native randomUUID', () => {
    expect(uuid()).toMatch(UUID_V4);
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => 'aaaaaaaa-bbbb-4ccc-yddd-eeeeeeeeeeee');
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() });
    expect(uuid()).toBe('aaaaaaaa-bbbb-4ccc-yddd-eeeeeeeeeeee');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('falls back to getRandomValues when randomUUID is missing', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i);
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      arr.set(bytes);
      return arr;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const id = uuid();
    expect(getRandomValues).toHaveBeenCalled();
    expect(id).toMatch(UUID_V4);
    expect(id[14]).toBe('4');
  });

  it('falls back to Math.random when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const id = uuid();
    expect(randomSpy).toHaveBeenCalled();
    expect(id).toMatch(UUID_V4);
  });
});
