import { describe, expect, it } from 'vitest';
import { parseSaveDataResult } from './appDataSave';

describe('parseSaveDataResult', () => {
  it('maps legacy true to ok', () => {
    expect(parseSaveDataResult(true)).toEqual({ ok: true });
  });

  it('maps legacy false to write-rejected', () => {
    const r = parseSaveDataResult(false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('write-rejected');
  });

  it('reads structured success with writeGeneration', () => {
    expect(parseSaveDataResult({ ok: true, writeGeneration: 4 })).toEqual({
      ok: true,
      writeGeneration: 4,
    });
  });

  it('reads structured failure with reason and generation hint', () => {
    expect(
      parseSaveDataResult({
        ok: false,
        reason: 'write-conflict',
        error: 'conflict',
        writeGeneration: 9,
      }),
    ).toEqual({
      ok: false,
      reason: 'write-conflict',
      error: 'conflict',
      writeGeneration: 9,
    });
  });

  it('reads structured success without writeGeneration', () => {
    expect(parseSaveDataResult({ ok: true })).toEqual({ ok: true });
  });

  it('maps unexpected IPC payloads to write-rejected', () => {
    const r = parseSaveDataResult(null as unknown as false);
    expect(r).toEqual({
      ok: false,
      reason: 'write-rejected',
      error: 'Unexpected save response from the main process.',
    });
  });
});
