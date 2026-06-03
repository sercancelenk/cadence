import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  MAX_DATA_VERSION,
  readWriteMeta,
  canCommitWriteGeneration,
  isFutureDataVersion,
  isValidSnapshotPayload,
} = require('./writeGeneration.cjs');

describe('writeGeneration', () => {
  it('exports MAX_DATA_VERSION as 3', () => {
    expect(MAX_DATA_VERSION).toBe(3);
  });

  it('readWriteMeta returns defaults when file missing', () => {
    const meta = readWriteMeta(path.join(os.tmpdir(), 'missing-meta.json'), fs);
    expect(meta).toEqual({ generation: 0, updatedAt: '' });
  });

  it('readWriteMeta parses valid meta file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-meta-'));
    const metaPath = path.join(dir, 'meta.json');
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ generation: 7, updatedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(readWriteMeta(metaPath, fs).generation).toBe(7);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('readWriteMeta tolerates corrupt JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-meta-'));
    const metaPath = path.join(dir, 'bad.json');
    fs.writeFileSync(metaPath, '{not json');
    expect(readWriteMeta(metaPath, fs).generation).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('canCommitWriteGeneration allows null/undefined expected (legacy)', () => {
    expect(canCommitWriteGeneration(null, 5)).toBe(true);
    expect(canCommitWriteGeneration(undefined, 5)).toBe(true);
  });

  it('canCommitWriteGeneration requires exact match when expected is set', () => {
    expect(canCommitWriteGeneration(3, 3)).toBe(true);
    expect(canCommitWriteGeneration(3, 4)).toBe(false);
  });

  it('isFutureDataVersion detects version > MAX', () => {
    expect(isFutureDataVersion({ version: 4, teams: [], people: [], items: [], todoGroups: [], todoItems: [] })).toBe(
      true,
    );
    expect(isFutureDataVersion({ version: 3, teams: [], people: [], items: [], todoGroups: [], todoItems: [] })).toBe(
      false,
    );
  });

  it('isValidSnapshotPayload rejects future version and malformed payloads', () => {
    const minimal = {
      version: 3,
      teams: [],
      people: [],
      items: [],
      todoGroups: [],
      todoItems: [],
    };
    expect(isValidSnapshotPayload(minimal)).toBe(true);
    expect(isValidSnapshotPayload({ ...minimal, version: 99 })).toBe(false);
    expect(isValidSnapshotPayload(null)).toBe(false);
    expect(isValidSnapshotPayload({ version: 3 })).toBe(false);
  });
});
