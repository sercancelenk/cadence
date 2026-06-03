import type { PersistResult } from './persistQueue';

/** IPC `data:save` responses (legacy boolean + structured object). */
export type SaveDataResult =
  | boolean
  | { ok: true; writeGeneration?: number }
  | { ok: false; reason?: string; error?: string; writeGeneration?: number };

export type ParsedSaveDataResult = PersistResult & {
  writeGeneration?: number;
};

export function parseSaveDataResult(result: SaveDataResult): ParsedSaveDataResult {
  if (result === true) {
    return { ok: true };
  }
  if (result === false) {
    return {
      ok: false,
      reason: 'write-rejected',
      error:
        'Your changes were not saved. Sign out and back in to unlock the data file, or open Settings → Backups & Recovery to restore an earlier snapshot.',
    };
  }
  if (result && typeof result === 'object' && result.ok === true) {
    return {
      ok: true,
      writeGeneration:
        typeof result.writeGeneration === 'number' ? result.writeGeneration : undefined,
    };
  }
  if (result && typeof result === 'object' && result.ok === false) {
    return {
      ok: false,
      reason: result.reason ?? 'write-rejected',
      error: result.error,
      writeGeneration:
        typeof result.writeGeneration === 'number' ? result.writeGeneration : undefined,
    };
  }
  return {
    ok: false,
    reason: 'write-rejected',
    error: 'Unexpected save response from the main process.',
  };
}
